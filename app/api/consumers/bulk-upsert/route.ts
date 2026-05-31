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
import { verifySession } from "@/lib/session"

export const maxDuration = 60

// The ordered list of columns the upload file must supply.
// Matches the admin panel's expectedColumns list.
const UPLOAD_COLUMNS = [
  "off_code", "MRU", "Consumer Id", "Name", "Address",
  "Base Class", "Device", "O/S Duedate Range", "D2 Net O/S", "Mobile Number",
] as const

type UpsertRequest = {
  // sheetName to write into (defaults to GOOGLE_SHEET_NAME env var)
  sheetName?: string
  // Rows as ordered arrays matching UPLOAD_COLUMNS
  rows: string[][]
}

const sheets = google.sheets({ version: "v4", auth })

// Auto-detect the MRU zone from a MRU string (e.g. "AB01MR" -> "AB01").
// Convention: first 4 chars of MRU = zone code.
function mruToZone(mru: string): string {
  return (mru || "").trim().substring(0, 4).toUpperCase()
}

// Fetch the AgencyZoneMap sheet and return a Map<zone, agency>.
// Returns an empty map if the sheet doesn't exist yet (first run).
async function loadAgencyZoneMap(
  spreadsheetId: string
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "AgencyZoneMap!A:B",
    })
    const rows = resp.data.values || []
    for (let i = 1; i < rows.length; i++) {
      const zone = String(rows[i]?.[0] || "").trim().toUpperCase()
      const agency = String(rows[i]?.[1] || "").trim().toUpperCase()
      if (zone && agency) map.set(zone, agency)
    }
  } catch {
    // Sheet doesn't exist yet — that's fine, no agency assignment.
  }
  return map
}

export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: UpsertRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const uploadRows = Array.isArray(body.rows) ? body.rows : []
  if (uploadRows.length === 0) {
    return NextResponse.json({ error: "No rows supplied" }, { status: 400 })
  }

  try {
    const spreadsheetId = getSpreadsheetId()
    const sheetName = body.sheetName || getSheetName()

    // 1. Ensure all expected columns exist (item 10 — idempotent).
    const headers = await ensureHeaders(spreadsheetId, sheetName, EXPECTED_CONSUMER_HEADERS)

    // 2. Read the Consumer ID column to find existing rows.
    const idColIndex = findColumn(headers, ["consumerId", "consumer id", "consumer_id"])
    if (idColIndex === -1) {
      return NextResponse.json({ error: "Consumer ID column not found" }, { status: 500 })
    }
    const idColLetter = colLetter(idColIndex)
    const existingIdResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!${idColLetter}:${idColLetter}`,
    })
    const existingIds = (existingIdResp.data.values || []) as string[][]
    // Map consumerId -> 1-based sheet row number
    const idToRow = new Map<string, number>()
    for (let i = 1; i < existingIds.length; i++) {
      const id = String(existingIds[i]?.[0] || "").trim()
      if (id) idToRow.set(id, i + 1) // i+1 because sheet rows are 1-based
    }

    // 3. Load agency→zone map for auto-assignment (item 12).
    const zoneAgencyMap = await loadAgencyZoneMap(spreadsheetId)

    // 4. Map upload columns to sheet column indices.
    //    UPLOAD_COLUMNS order: off_code, MRU, Consumer Id, Name, Address,
    //    Base Class, Device, O/S Duedate Range, D2 Net O/S, Mobile Number
    const uploadColCandidates: string[][] = [
      ["off_code", "offcode"],
      ["mru"],
      ["consumer id", "consumerid", "consumer_id"],
      ["name", "consumer name"],
      ["address"],
      ["base class", "baseclass"],
      ["device"],
      ["o/s duedate range", "os duedate range", "due date range"],
      ["d2 net o/s", "d2 net os", "outstanding"],
      ["mobile number", "mobile", "phone"],
    ]
    const uploadToSheetCol: number[] = uploadColCandidates.map((cands) =>
      findColumn(headers, cands)
    )

    // Also find the agency column for auto-assign
    const agencyColIndex = findColumn(headers, ["agency"])
    const lastUpdatedColIndex = findColumn(headers, [
      "last updated", "last_updated", "updatedAt", "timestamp",
    ])

    const today = (() => {
      const d = new Date()
      return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`
    })()

    // 5. Split into inserts (new) vs. updates (existing).
    const insertRows: string[][] = []
    const updateWrites: sheets_v4.Schema$ValueRange[] = []
    let autoAssignedCount = 0

    for (const uploadRow of uploadRows) {
      // Consumer ID is at UPLOAD_COLUMNS index 2
      const consumerId = String(uploadRow[2] || "").trim()
      if (!consumerId) continue

      // Build a full-width row for the sheet, preserving any existing cells we
      // don't touch (leave as empty string — batchUpdate only writes non-empty
      // ranges when using update, but for new rows we provide what we have).
      const mru = String(uploadRow[1] || "").trim()
      const zone = mruToZone(mru)
      const agency = zoneAgencyMap.get(zone) || ""
      if (agency) autoAssignedCount++

      if (idToRow.has(consumerId)) {
        // UPDATE: write only the upload columns + agency + lastUpdated per cell
        const targetRow = idToRow.get(consumerId)!
        uploadRow.forEach((val, i) => {
          const sheetCol = uploadToSheetCol[i]
          if (sheetCol !== -1) {
            updateWrites.push({
              range: `'${sheetName}'!${colLetter(sheetCol)}${targetRow}`,
              values: [[val ?? ""]],
            })
          }
        })
        if (agencyColIndex !== -1 && agency) {
          updateWrites.push({
            range: `'${sheetName}'!${colLetter(agencyColIndex)}${targetRow}`,
            values: [[agency]],
          })
        }
        if (lastUpdatedColIndex !== -1) {
          updateWrites.push({
            range: `'${sheetName}'!${colLetter(lastUpdatedColIndex)}${targetRow}`,
            values: [[today]],
          })
        }
      } else {
        // INSERT: build a row array padded to the header width
        const newRow: string[] = new Array(headers.length).fill("")
        uploadRow.forEach((val, i) => {
          const sheetCol = uploadToSheetCol[i]
          if (sheetCol !== -1) newRow[sheetCol] = val ?? ""
        })
        if (agencyColIndex !== -1 && agency) newRow[agencyColIndex] = agency
        if (lastUpdatedColIndex !== -1) newRow[lastUpdatedColIndex] = today
        insertRows.push(newRow)
      }
    }

    // 6. Execute updates (batch) then inserts (append) — 2 API calls max.
    if (updateWrites.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: updateWrites,
        },
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

    return NextResponse.json({
      success: true,
      summary: {
        total: uploadRows.length,
        inserted: insertRows.length,
        updated: uploadRows.length - insertRows.length,
        autoAssigned: autoAssignedCount,
      },
    })
  } catch (error: any) {
    console.error("bulk-upsert error:", error)
    return NextResponse.json(
      { error: error?.message || "Bulk upsert failed" },
      { status: 500 }
    )
  }
}
