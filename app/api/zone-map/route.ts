import { NextResponse, type NextRequest } from "next/server"
import { google } from "googleapis"
import { auth } from "@/lib/google-drive"
import { getSpreadsheetId } from "@/lib/google-sheets-api"
import { verifySession } from "@/lib/session"

const TAB = "AgencyZoneMap"
const sheets = google.sheets({ version: "v4", auth })

// Ensure the AgencyZoneMap tab exists with Zone | Agency headers.
async function ensureTab(spreadsheetId: string) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = meta.data.sheets?.some(
    (s) => s.properties?.title === TAB
  )
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: TAB } } }],
      },
    })
    // Write headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${TAB}!A1:B1`,
      valueInputOption: "RAW",
      requestBody: { values: [["Zone", "Agency"]] },
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
    await ensureTab(id)
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: `${TAB}!A:B`,
    })
    const rows = (resp.data.values || []).slice(1) // skip header
    const data = rows
      .map((r) => ({ zone: String(r[0] || "").trim().toUpperCase(), agency: String(r[1] || "").trim().toUpperCase() }))
      .filter((r) => r.zone && r.agency)
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
    const { rows } = await request.json()
    const id = getSpreadsheetId()
    await ensureTab(id)
    // Clear data rows (keep header row 1), then write fresh.
    await sheets.spreadsheets.values.clear({
      spreadsheetId: id,
      range: `${TAB}!A2:B`,
    })
    if (rows && rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: `${TAB}!A2:B`,
        valueInputOption: "RAW",
        requestBody: {
          values: rows.map((r: { zone: string; agency: string }) => [
            r.zone.toUpperCase(),
            r.agency.toUpperCase(),
          ]),
        },
      })
    }
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
