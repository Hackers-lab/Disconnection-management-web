// Server-only — imports googleapis. Never import in "use client" components.
import { google } from "googleapis"
import { unstable_cache, revalidateTag } from "next/cache"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"

const sheets = google.sheets({ version: "v4", auth })

export const MASTER_TAB = "Consumer_Master"
const MASTER_TAG        = "consumer-master"
const MASTER_REVALIDATE = 3600 // 1 hour — changes rarely

export const MASTER_HEADERS = [
  "Consumer ID", "Name", "C/O", "Address", "Class",
  "Meter No", "Zone", "Mobile", "Latitude", "Longitude",
]

export interface ConsumerMasterRow {
  consumerId:  string
  name:        string
  careOf:      string
  address:     string
  baseClass:   string
  meterNo:     string
  zone:        string
  mobile:      string
  latitude:    string
  longitude:   string
}

let tabReady = false

async function ensureTab(id: string) {
  if (tabReady) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
  const existing = (meta.data.sheets || []).map(s => s.properties?.title)
  if (!existing.includes(MASTER_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: [{ addSheet: { properties: { title: MASTER_TAB } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: id, range: `${MASTER_TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [MASTER_HEADERS] },
    })
  }
  tabReady = true
}

function parseRow(r: string[]): ConsumerMasterRow {
  return {
    consumerId: r[0] || "",
    name:       r[1] || "",
    careOf:     r[2] || "",
    address:    r[3] || "",
    baseClass:  r[4] || "",
    meterNo:    r[5] || "",
    zone:       r[6] || "",
    mobile:     r[7] || "",
    latitude:   r[8] || "",
    longitude:  r[9] || "",
  }
}

// ── Raw fetch (used by write paths so they see live data) ─────────────────────
async function _fetchMasterRaw(): Promise<ConsumerMasterRow[]> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${MASTER_TAB}!A:J` })
  return (res.data.values || []).slice(1).filter(r => r[0]).map(r => parseRow(r.map(String)))
}

// ── Cached read ───────────────────────────────────────────────────────────────
export const fetchMasterData = unstable_cache(
  _fetchMasterRaw,
  ["consumer-master-data"],
  { revalidate: MASTER_REVALIDATE, tags: [MASTER_TAG] },
)

export function invalidateMasterCache() { revalidateTag(MASTER_TAG) }

// ── Upload (replaces entire sheet data) ──────────────────────────────────────
export async function uploadMasterData(rows: ConsumerMasterRow[]): Promise<{ count: number }> {
  const id = getSpreadsheetId()
  await ensureTab(id)

  // Clear existing data (keep header row)
  await sheets.spreadsheets.values.clear({
    spreadsheetId: id,
    range: `${MASTER_TAB}!A2:J`,
  })

  if (rows.length === 0) {
    invalidateMasterCache()
    return { count: 0 }
  }

  // Write in batches of 1000 to avoid payload limits
  const BATCH = 1000
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const values = batch.map(r => [
      r.consumerId, r.name, r.careOf, r.address, r.baseClass,
      r.meterNo, r.zone, r.mobile, r.latitude, r.longitude,
    ])
    await sheets.spreadsheets.values.append({
      spreadsheetId: id,
      range: `${MASTER_TAB}!A:J`,
      valueInputOption: "RAW",
      requestBody: { values },
    })
  }

  invalidateMasterCache()
  return { count: rows.length }
}
