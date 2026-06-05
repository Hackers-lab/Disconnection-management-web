import { google } from "googleapis"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"

const sheets = google.sheets({ version: "v4", auth })
const TAB = "Reconnection"

export const RECONNECTION_HEADERS = [
  "Request ID", "Created At", "Consumer ID", "Name", "Address",
  "Mobile", "Agency", "Device", "Source", "Status",
  "Updated At", "Updated By", "Image URL", "Request Image URL",
  "Reading", "Remarks",
]

export interface ReconnectionRequest {
  requestId: string
  createdAt: string
  consumerId: string
  name: string
  address: string
  mobile: string
  agency: string
  device: string
  source: "dc_list" | "manual"
  status: "pending" | "reconnected" | "door_locked" | "cancelled"
  updatedAt: string
  updatedBy: string
  imageUrl: string
  requestImageUrl: string
  reading: string
  remarks: string
}

// 60s memo
const MEMO_TTL = 60_000
let memo: { at: number; data: ReconnectionRequest[] } | null = null
let tabReady = false

export function invalidateReconnectionCache() { memo = null }

// ─── Tab bootstrap ────────────────────────────────────────────────────────────
async function ensureTab(id: string) {
  if (tabReady) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
  const exists = meta.data.sheets?.some(s => s.properties?.title === TAB)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: [{ addSheet: { properties: { title: TAB } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: `${TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [RECONNECTION_HEADERS] },
    })
  }
  tabReady = true
}

// ─── Parse rows ───────────────────────────────────────────────────────────────
function parseRow(r: string[]): ReconnectionRequest {
  return {
    requestId:       r[0]  || "",
    createdAt:       r[1]  || "",
    consumerId:      r[2]  || "",
    name:            r[3]  || "",
    address:         r[4]  || "",
    mobile:          r[5]  || "",
    agency:          r[6]  || "",
    device:          r[7]  || "",
    source:         (r[8]  || "dc_list") as ReconnectionRequest["source"],
    status:         (r[9]  || "pending") as ReconnectionRequest["status"],
    updatedAt:       r[10] || "",
    updatedBy:       r[11] || "",
    imageUrl:        r[12] || "",
    requestImageUrl: r[13] || "",
    reading:         r[14] || "",
    remarks:         r[15] || "",
  }
}

// ─── Fetch all ────────────────────────────────────────────────────────────────
export async function fetchReconnectionData(): Promise<ReconnectionRequest[]> {
  if (memo && Date.now() - memo.at < MEMO_TTL) return memo.data
  const id = getSpreadsheetId()
  await ensureTab(id)
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${TAB}!A:P` })
  const rows = (res.data.values || []).slice(1)
  const data = rows.filter(r => r[0]).map(r => parseRow(r.map(String)))
  memo = { at: Date.now(), data }
  return data
}

// ─── Next Request ID ──────────────────────────────────────────────────────────
async function nextRequestId(id: string): Promise<string> {
  const all = await fetchReconnectionData()
  const max = all.reduce((m, r) => {
    const n = parseInt(r.requestId.replace("REC-", ""), 10)
    return isNaN(n) ? m : Math.max(m, n)
  }, 0)
  return `REC-${String(max + 1).padStart(4, "0")}`
}

// ─── Create request ───────────────────────────────────────────────────────────
export async function createReconnectionRequest(
  req: Omit<ReconnectionRequest, "requestId" | "createdAt" | "status" | "updatedAt" | "updatedBy" | "imageUrl" | "reading">
): Promise<string> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const requestId = await nextRequestId(id)
  const now = nowTs()
  await sheets.spreadsheets.values.append({
    spreadsheetId: id,
    range: `${TAB}!A:P`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        requestId, now, req.consumerId, req.name, req.address,
        req.mobile, req.agency, req.device, req.source, "pending",
        "", "", "", req.requestImageUrl || "", "", req.remarks || "",
      ]],
    },
  })
  invalidateReconnectionCache()
  return requestId
}

// ─── Update status ────────────────────────────────────────────────────────────
export async function updateReconnectionStatus(update: {
  requestId: string
  status: "reconnected" | "door_locked" | "cancelled"
  updatedBy: string
  imageUrl?: string
  reading?: string
  remarks?: string
}): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const all = await fetchReconnectionData()
  const idx = all.findIndex(r => r.requestId === update.requestId)
  if (idx === -1) throw new Error("Request not found")
  const sheetRow = idx + 2 // 1-based + header
  const now = nowTs()

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${TAB}!J${sheetRow}`, values: [[update.status]] },
        { range: `${TAB}!K${sheetRow}`, values: [[now]] },
        { range: `${TAB}!L${sheetRow}`, values: [[update.updatedBy]] },
        { range: `${TAB}!M${sheetRow}`, values: [[update.imageUrl || ""]] },
        { range: `${TAB}!O${sheetRow}`, values: [[update.reading || ""]] },
        { range: `${TAB}!P${sheetRow}`, values: [[update.remarks || ""]] },
      ],
    },
  })
  invalidateReconnectionCache()
}

// ─── Blocked consumer IDs (pending > 30 hours) ───────────────────────────────
export async function getBlockedConsumerIds(): Promise<string[]> {
  const all = await fetchReconnectionData()
  const cutoff = Date.now() - 30 * 60 * 60 * 1000
  return all
    .filter(r => r.status === "pending" && parseTs(r.createdAt) < cutoff)
    .map(r => r.consumerId)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function nowTs(): string {
  const d = new Date()
  return [
    String(d.getDate()).padStart(2, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    d.getFullYear(),
  ].join("-") + " " + [
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
  ].join(":")
}

// Parse "DD-MM-YYYY HH:MM" → epoch ms
function parseTs(ts: string): number {
  if (!ts) return 0
  try {
    const [datePart, timePart] = ts.split(" ")
    const [d, m, y] = datePart.split("-").map(Number)
    const [h, min] = (timePart || "00:00").split(":").map(Number)
    return new Date(y, m - 1, d, h, min).getTime()
  } catch { return 0 }
}
