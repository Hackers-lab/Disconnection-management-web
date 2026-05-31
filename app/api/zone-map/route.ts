import { NextResponse, type NextRequest } from "next/server"
import { google } from "googleapis"
import { auth } from "@/lib/google-drive"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { verifySession } from "@/lib/session"

const TAB = "AgencyZoneMap"
const HISTORY_TAB = "ZoneMapHistory"
const sheets = google.sheets({ version: "v4", auth })

const todayStr = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`
}

async function ensureTab(spreadsheetId: string, title: string, headers: string[]) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = meta.data.sheets?.some(s => s.properties?.title === title)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    })
  }
}

export async function GET() {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const id = getSpreadsheetId()
    await ensureTab(id, TAB, ["Zone", "Agency", "Updated On"])
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${TAB}!A:C` })
    const rows = (resp.data.values || []).slice(1)
    const data = rows
      .map(r => ({
        zone:      String(r[0] || "").trim().toUpperCase(),
        agency:    String(r[1] || "").trim().toUpperCase(),
        updatedOn: String(r[2] || "").trim(),
      }))
      .filter(r => r.zone && r.agency)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const { rows } = await request.json() as { rows: { zone: string; agency: string }[] }
    const id = getSpreadsheetId()

    // Ensure both tabs
    await Promise.all([
      ensureTab(id, TAB, ["Zone", "Agency", "Updated On"]),
      ensureTab(id, HISTORY_TAB, ["Date", "Zone", "Previous Agency", "New Agency", "Changed By"]),
    ])

    // Read existing to detect changes for history
    const existing = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${TAB}!A:C` })
    const existingRows = (existing.data.values || []).slice(1)
    const existingMap = new Map<string, string>()
    existingRows.forEach(r => {
      const z = String(r[0] || "").trim().toUpperCase()
      const a = String(r[1] || "").trim().toUpperCase()
      if (z && a) existingMap.set(z, a)
    })

    const historyEntries: string[][] = []
    const date = todayStr()
    const changedBy = session.userId || "admin"

    ;(rows || []).forEach(r => {
      const zone   = (r.zone   || "").trim().toUpperCase()
      const agency = (r.agency || "").trim().toUpperCase()
      const prev = existingMap.get(zone)
      if (prev && prev !== agency) {
        historyEntries.push([date, zone, prev, agency, changedBy])
      } else if (!prev && agency) {
        historyEntries.push([date, zone, "", agency, changedBy])
      }
    })

    // Clear data and rewrite
    await sheets.spreadsheets.values.clear({ spreadsheetId: id, range: `${TAB}!A2:C` })
    if (rows && rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: `${TAB}!A2:C`,
        valueInputOption: "RAW",
        requestBody: {
          values: rows.map(r => [
            (r.zone || "").trim().toUpperCase(),
            (r.agency || "").trim().toUpperCase(),
            date,
          ]),
        },
      })
    }

    if (historyEntries.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: id,
        range: `${HISTORY_TAB}!A:E`,
        valueInputOption: "RAW",
        requestBody: { values: historyEntries },
      })
    }

    return NextResponse.json({ success: true, historyEntries: historyEntries.length })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
