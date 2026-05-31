import { NextResponse, type NextRequest } from "next/server"
import { google, sheets_v4 } from "googleapis"
import { auth } from "@/lib/google-drive"
import {
  ensureHeaders,
  findColumn,
  colLetter,
  getSpreadsheetId,
  getSheetName,
} from "@/lib/google-sheets-api"
import { EXPECTED_CONSUMER_HEADERS, invalidateConsumerCache } from "@/lib/google-sheets"
import { appendHistory, nowTimestamp, invalidateHistoryCache } from "@/lib/consumer-history"
import { verifySession } from "@/lib/session"

export const maxDuration = 60

// Statuses that represent admin holds — ALWAYS preserved, even in new-cycle mode.
const ADMIN_HOLD_STATUSES = new Set(["bill dispute", "office team"])

// Statuses that represent completed field-team work that MAY be reset in new-cycle mode
// if the OSD amount has changed (meaning the consumer paid, reconnected, and has new dues).
const FIELD_WORK_STATUSES = new Set([
  "disconnected", "paid", "agency paid", "visited", "not found",
  "deemed disconnected", "temprory disconnected",
])

// History tab name
const HISTORY_TAB = "DC_History"
const HISTORY_HEADERS = [
  "Upload Date", "Consumer Id", "Name", "Previous Status",
  "Previous OSD", "Previous Agency", "Previous Notes", "Action",
]

const sheets = google.sheets({ version: "v4", auth })

function mruToZone(mru: string): string {
  return (mru || "").trim().substring(0, 4).toUpperCase()
}

async function loadAgencyZoneMap(spreadsheetId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId, range: "AgencyZoneMap!A:B",
    })
    const rows = resp.data.values || []
    for (let i = 1; i < rows.length; i++) {
      const zone = String(rows[i]?.[0] || "").trim().toUpperCase()
      const agency = String(rows[i]?.[1] || "").trim().toUpperCase()
      if (zone && agency) map.set(zone, agency)
    }
  } catch { /* tab not yet created */ }
  return map
}

async function ensureHistoryTab(spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = meta.data.sheets?.some(s => s.properties?.title === HISTORY_TAB)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: HISTORY_TAB } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${HISTORY_TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HISTORY_HEADERS] },
    })
  }
}

const today = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`
}

type UpsertRequest = {
  sheetName?: string
  rows: string[][]
  // When true: OSD-changed rows with field-work statuses are reset to "connected"
  // (new billing cycle). Admin-hold statuses (bill dispute, office team) are always kept.
  newCycle?: boolean
}

export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: UpsertRequest
  try { body = await request.json() }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) }

  const newCycle = !!body.newCycle
  const uploadRows = Array.isArray(body.rows) ? body.rows : []
  if (uploadRows.length === 0) {
    return NextResponse.json({ error: "No rows supplied" }, { status: 400 })
  }

  try {
    const spreadsheetId = getSpreadsheetId()
    const sheetName = body.sheetName || getSheetName()

    // 1. Ensure columns and history tab exist.
    const [headers] = await Promise.all([
      ensureHeaders(spreadsheetId, sheetName, EXPECTED_CONSUMER_HEADERS),
      ensureHistoryTab(spreadsheetId),
    ])

    // 2. Read the full sheet (Consumer ID + status + agency + notes + OSD) to
    //    determine what already exists. We need these 5 columns only.
    const idColIndex       = findColumn(headers, ["consumerId","consumer id","consumer_id"])
    const statusColIndex   = findColumn(headers, ["discon status","disconnection status","status"])
    const agencyColIndex   = findColumn(headers, ["agency"])
    const notesColIndex    = findColumn(headers, ["notes","remarks","comments"])
    const osdColIndex      = findColumn(headers, ["d2 net o/s","d2 net os","outstanding"])
    const lastUpdColIndex  = findColumn(headers, ["last updated","lastupdated","updatedAt","timestamp"])

    if (idColIndex === -1) {
      return NextResponse.json({ error: "Consumer ID column not found" }, { status: 500 })
    }

    // Fetch ID + status + OSD + agency + notes columns in one batchGet
    const colsToFetch = [idColIndex, statusColIndex, osdColIndex, agencyColIndex, notesColIndex]
      .filter(i => i !== -1)
      .map(i => `'${sheetName}'!${colLetter(i)}:${colLetter(i)}`)

    const batchResp = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: colsToFetch,
    })

    // Build lookup: consumerId -> { row (1-based), status, osd, agency, notes }
    const idValues = batchResp.data.valueRanges?.[0]?.values || []
    const statusValues   = statusColIndex !== -1 ? (batchResp.data.valueRanges?.[colsToFetch.indexOf(`'${sheetName}'!${colLetter(statusColIndex)}:${colLetter(statusColIndex)}`)]?.values || []) : []
    const osdValues      = osdColIndex    !== -1 ? (batchResp.data.valueRanges?.[colsToFetch.indexOf(`'${sheetName}'!${colLetter(osdColIndex)}:${colLetter(osdColIndex)}`)]?.values    || []) : []
    const agencyValues   = agencyColIndex !== -1 ? (batchResp.data.valueRanges?.[colsToFetch.indexOf(`'${sheetName}'!${colLetter(agencyColIndex)}:${colLetter(agencyColIndex)}`)]?.values || []) : []
    const notesValues    = notesColIndex  !== -1 ? (batchResp.data.valueRanges?.[colsToFetch.indexOf(`'${sheetName}'!${colLetter(notesColIndex)}:${colLetter(notesColIndex)}`)]?.values  || []) : []

    type ExistingRow = { row: number; status: string; osd: string; agency: string; notes: string }
    const existingMap = new Map<string, ExistingRow>()
    for (let i = 1; i < idValues.length; i++) {
      const id = String(idValues[i]?.[0] || "").trim()
      if (!id) continue
      existingMap.set(id, {
        row: i + 1,
        status: String(statusValues[i]?.[0] || "").toLowerCase().trim(),
        osd:    String(osdValues[i]?.[0]    || "").trim(),
        agency: String(agencyValues[i]?.[0] || "").trim(),
        notes:  String(notesValues[i]?.[0]  || "").trim(),
      })
    }

    // 3. Load agency→zone map.
    const zoneAgencyMap = await loadAgencyZoneMap(spreadsheetId)

    // 4. Map upload columns to sheet column indices.
    // Upload column order: off_code, MRU, Consumer Id, Name, Address,
    //                      Base Class, Device, O/S Duedate Range, D2 Net O/S, Mobile Number
    const uploadColCandidates: string[][] = [
      ["off_code","offcode"],
      ["mru"],
      ["consumer id","consumerid","consumer_id"],
      ["name","consumer name"],
      ["address"],
      ["base class","baseclass"],
      ["device"],
      ["o/s duedate range","os duedate range","due date range"],
      ["d2 net o/s","d2 net os","outstanding"],
      ["mobile number","mobile","phone"],
    ]
    const uploadToSheetCol = uploadColCandidates.map(cands => findColumn(headers, cands))

    // Base-only columns that are always safe to update (billing data from DC list).
    // Status, disconDate, notes, reading, imageUrl, latitude, longitude are NOT included.
    const BASE_FIELD_UPLOAD_INDICES = [0, 1, 3, 4, 5, 6, 7, 8, 9] // skip index 2 (ID — already known)

    const todayStr = today()
    const updateWrites: sheets_v4.Schema$ValueRange[] = []
    const insertRows: string[][] = []
    const historyRows: string[][] = []       // legacy raw rows (for archive)
    const historyEntries: Parameters<typeof appendHistory>[0] = []
    let protectedCount = 0
    let autoAssignedCount = 0
    const ts = nowTimestamp()

    // Build the upload-row id set for marking removed consumers
    const uploadIdSet = new Set<string>()

    for (const uploadRow of uploadRows) {
      const consumerId = String(uploadRow[2] || "").trim()
      if (!consumerId) continue
      uploadIdSet.add(consumerId)

      const mru = String(uploadRow[1] || "").trim()
      const zone = mruToZone(mru)
      const mappedAgency = zoneAgencyMap.get(zone) || ""

      const existing = existingMap.get(consumerId)

      if (!existing) {
        // --- INSERT: new consumer ---
        const newRow: string[] = new Array(headers.length).fill("")
        uploadRow.forEach((val, i) => {
          const sheetCol = uploadToSheetCol[i]
          if (sheetCol !== -1) newRow[sheetCol] = val ?? ""
        })
        // Default status to "connected" so it shows up in the list
        if (statusColIndex !== -1) newRow[statusColIndex] = "connected"
        if (agencyColIndex !== -1 && mappedAgency) { newRow[agencyColIndex] = mappedAgency; autoAssignedCount++ }
        if (lastUpdColIndex !== -1) newRow[lastUpdColIndex] = todayStr
        insertRows.push(newRow)
      } else {
        // --- UPDATE: existing consumer ---
        const isAdminHold  = ADMIN_HOLD_STATUSES.has(existing.status)
        const isFieldWork  = FIELD_WORK_STATUSES.has(existing.status)
        const newOsd = uploadRow[8] ?? ""
        const osdChanged = newOsd && existing.osd &&
          String(parseFloat(newOsd.replace(/,/g,"")) || 0) !== String(parseFloat(existing.osd.replace(/,/g,"")) || 0)

        // Snapshot history for every consumer with meaningful field-work status.
        // This is the core audit trail: "consumer had status X with image Y on date Z
        // before this DC list upload". Saved regardless of whether we reset or not.
        if (isFieldWork) {
          historyEntries.push({
            timestamp: ts,
            consumerId,
            name: uploadRow[3] || "",
            action: osdChanged ? "in_new_list_osd_changed" : "in_new_list",
            oldStatus: existing.status,
            newStatus: "", // filled after status decision below
            oldOsd: existing.osd,
            oldNotes: existing.notes,
            oldImageUrl: "",  // imageUrl not in batchGet — stored in sheet separately
            changedBy: "upload",
          })
        }

        // Decide whether to reset status to "connected"
        const shouldReset = !isAdminHold && newCycle && isFieldWork && (
          existing.status === "visited" || existing.status === "not found" || osdChanged
        )

        if (isAdminHold || (isFieldWork && !shouldReset)) {
          // Base-only update: update billing fields, NEVER touch status/notes/evidence
          protectedCount++
          BASE_FIELD_UPLOAD_INDICES.forEach(i => {
            const sheetCol = uploadToSheetCol[i]
            const val = uploadRow[i] ?? ""
            if (sheetCol !== -1 && val) {
              updateWrites.push({
                range: `'${sheetName}'!${colLetter(sheetCol)}${existing.row}`,
                values: [[val]],
              })
            }
          })
          if (osdColIndex !== -1 && newOsd) {
            updateWrites.push({
              range: `'${sheetName}'!${colLetter(osdColIndex)}${existing.row}`,
              values: [[newOsd]],
            })
          }
        } else {
          // Full update: either blank/connected status, or new-cycle reset
          uploadRow.forEach((val, i) => {
            const sheetCol = uploadToSheetCol[i]
            if (sheetCol !== -1) {
              updateWrites.push({
                range: `'${sheetName}'!${colLetter(sheetCol)}${existing.row}`,
                values: [[val ?? ""]],
              })
            }
          })
          // Reset status to connected on new-cycle reset
          if (shouldReset && statusColIndex !== -1) {
            updateWrites.push({
              range: `'${sheetName}'!${colLetter(statusColIndex)}${existing.row}`,
              values: [["connected"]],
            })
            // Update the newStatus on the snapshot we already pushed above
            const snap = historyEntries.findLast?.(h => h.consumerId === consumerId) ??
              historyEntries.slice().reverse().find(h => h.consumerId === consumerId)
            if (snap) snap.newStatus = "connected"
          }
          // Auto-assign agency if not yet assigned
          if (agencyColIndex !== -1 && mappedAgency && !existing.agency) {
            updateWrites.push({
              range: `'${sheetName}'!${colLetter(agencyColIndex)}${existing.row}`,
              values: [[mappedAgency]],
            })
            autoAssignedCount++
          }
        }
        if (lastUpdColIndex !== -1) {
          updateWrites.push({
            range: `'${sheetName}'!${colLetter(lastUpdColIndex)}${existing.row}`,
            values: [[todayStr]],
          })
        }
      }
    }

    // 5. Identify consumers in sheet but NOT in new upload — archive to history,
    //    mark them with "&" status so they are hidden from agency views.
    let archivedCount = 0
    if (statusColIndex !== -1) {
      existingMap.forEach((existing, consumerId) => {
        if (!uploadIdSet.has(consumerId)) {
          // Archive: write a history row before changing anything
          historyRows.push([
            todayStr, consumerId,
            "",
            existing.status, existing.osd, existing.agency, existing.notes,
            "removed-from-upload",
          ])
          historyEntries.push({
            timestamp: ts, consumerId, name: "",
            action: "removed_from_upload",
            oldStatus: existing.status, newStatus: "&",
            oldOsd: existing.osd, oldNotes: existing.notes, oldImageUrl: "",
            changedBy: "upload",
          })
          // Mark as "&" — this hides from agency views per existing app logic
          updateWrites.push({
            range: `'${sheetName}'!${colLetter(statusColIndex)}${existing.row}`,
            values: [["&"]],
          })
          if (lastUpdColIndex !== -1) {
            updateWrites.push({
              range: `'${sheetName}'!${colLetter(lastUpdColIndex)}${existing.row}`,
              values: [[todayStr]],
            })
          }
          archivedCount++
        }
      })
    }

    // 6. Write history rows to DC_History tab.
    if (historyRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${HISTORY_TAB}!A:H`,
        valueInputOption: "RAW",
        requestBody: { values: historyRows },
      })
    }

    // 7. Execute updates (batch) and inserts (append) — max 2 Sheets API calls.
    if (updateWrites.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: "USER_ENTERED", data: updateWrites },
      })
    }
    if (insertRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${sheetName}'!A:A`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: insertRows },
      })
    }

    invalidateConsumerCache()

    // Append history entries (fire-and-forget — non-critical path)
    if (historyEntries.length > 0) {
      appendHistory(historyEntries)
        .then(() => invalidateHistoryCache())
        .catch(e => console.warn("History append failed (non-critical):", e))
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: uploadRows.length,
        inserted: insertRows.length,
        updated: uploadRows.length - insertRows.length,
        protectedStatusSkipped: protectedCount,
        autoAssigned: autoAssignedCount,
        archivedNotInUpload: archivedCount,
      },
    })
  } catch (error: any) {
    console.error("bulk-upsert error:", error)
    return NextResponse.json({ error: error?.message || "Bulk upsert failed" }, { status: 500 })
  }
}
