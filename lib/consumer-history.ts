import { google } from "googleapis"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"

const sheets = google.sheets({ version: "v4", auth })

export const HISTORY_TAB = "DC_History"

// Schema: Timestamp | ConsumerId | Name | Action | OldStatus | NewStatus | OldOSD | OldNotes | OldImageUrl | ChangedBy | Amount | EventDate
export const HISTORY_HEADERS = [
  "Timestamp", "Consumer Id", "Name", "Action",
  "Old Status", "New Status", "Old OSD", "Old Notes", "Old Image URL", "Changed By",
  "Amount", "Event Date",
]

export interface HistoryEntry {
  timestamp: string
  consumerId: string
  name: string
  action: string        // "in_new_list" | "removed_from_upload" | "status_changed" | "paid" | ...
  oldStatus: string
  newStatus: string
  oldOsd: string
  oldNotes: string
  oldImageUrl: string
  changedBy: string
  amount?: string       // payment amount (for "paid" events)
  eventDate?: string    // date the event occurred (e.g. paid date, disconnect date)
}

// Warm-function in-memory cache. History reads are rare (user-triggered) but
// when the consumer form is open, several rows may be requested in sequence.
// 30s TTL matches the consumer data cache.
const HISTORY_MEMO_TTL_MS = 30_000
let historyMemo: { at: number; data: HistoryEntry[] } | null = null

export function invalidateHistoryCache() {
  historyMemo = null
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
    return
  }
  // Migration: if an existing tab still has the old 10-column header,
  // rewrite row 1 to include the new Amount / Event Date columns.
  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId, range: `${HISTORY_TAB}!A1:L1`,
  })
  const currentHeader = headerResp.data.values?.[0] || []
  if (currentHeader.length < HISTORY_HEADERS.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${HISTORY_TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [HISTORY_HEADERS] },
    })
  }
}

async function fetchAllHistory(): Promise<HistoryEntry[]> {
  const id = getSpreadsheetId()
  await ensureHistoryTab(id)
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: `${HISTORY_TAB}!A:L`,
  })
  const rows = (resp.data.values || []).slice(1) // skip header
  return rows.map(r => ({
    timestamp:   String(r[0] || ""),
    consumerId:  String(r[1] || ""),
    name:        String(r[2] || ""),
    action:      String(r[3] || ""),
    oldStatus:   String(r[4] || ""),
    newStatus:   String(r[5] || ""),
    oldOsd:      String(r[6] || ""),
    oldNotes:    String(r[7] || ""),
    oldImageUrl: String(r[8] || ""),
    changedBy:   String(r[9] || ""),
    amount:      String(r[10] || ""),
    eventDate:   String(r[11] || ""),
  }))
}

// Public read — uses memo so repeated calls within 30s cost 0 API calls.
export async function getHistoryForConsumer(consumerId: string): Promise<HistoryEntry[]> {
  const now = Date.now()
  if (!historyMemo || now - historyMemo.at > HISTORY_MEMO_TTL_MS) {
    const all = await fetchAllHistory()
    historyMemo = { at: now, data: all }
  }
  return historyMemo.data
    .filter(h => h.consumerId === consumerId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)) // newest first
}

// Append history rows. Called from update route and bulk-upsert.
// Batches multiple entries into a single append call.
export async function appendHistory(entries: HistoryEntry[]): Promise<void> {
  if (!entries.length) return
  const id = getSpreadsheetId()
  await ensureHistoryTab(id)
  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${HISTORY_TAB}!A:L`,
    valueInputOption: "RAW",
    requestBody: {
      values: entries.map(e => [
        e.timestamp, e.consumerId, e.name, e.action,
        e.oldStatus, e.newStatus, e.oldOsd, e.oldNotes, e.oldImageUrl, e.changedBy,
        e.amount ?? "", e.eventDate ?? "",
      ]),
    },
  })
  // Invalidate memo so the new entry shows on next read
  historyMemo = null
}

export function nowTimestamp(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
}
