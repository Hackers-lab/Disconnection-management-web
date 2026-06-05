// Server-only — imports googleapis. Never import this in "use client" components.
// Client components should import types from lib/meter-types.ts instead.
import { google } from "googleapis"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"
import { METER_TYPES } from "./meter-types"
import type {
  MeterStock, MeterIssue, StockSummary,
  MeterTypeLabel, MeterCondition, IssuePurpose, IssueStatus,
} from "./meter-types"

// Re-export so API routes only need one import
export { METER_TYPES }
export type { MeterStock, MeterIssue, StockSummary, MeterTypeLabel, MeterCondition, IssuePurpose, IssueStatus }

const sheets = google.sheets({ version: "v4", auth })

// ─── Sheet names ──────────────────────────────────────────────────────────────
export const STOCK_TAB  = "Meter_Stock"
export const ISSUES_TAB = "Meter_Issues"

const STOCK_HEADERS = [
  "Serial No", "Type Label", "Phase", "Ampere", "Smart",
  "Condition", "Received Date", "Batch Remarks", "Last Updated",
]
const ISSUES_HEADERS = [
  "Issue ID", "Issue Date", "Purpose", "Consumer ID", "NSC Receive No",
  "Consumer Name", "Agency", "Serial No", "Meter Type", "Status",
  "Before Image", "After Image", "Last Reading", "New Reading",
  "Completion Ref", "Completed At", "Completed By", "Remarks", "Installation No",
]

// ─── Memo cache ───────────────────────────────────────────────────────────────
const TTL = 30_000
let stockMemo:  { at: number; data: MeterStock[]  } | null = null
let issuesMemo: { at: number; data: MeterIssue[] } | null = null
let tabsReady = false

export function invalidateMeterCache() { stockMemo = null; issuesMemo = null }

// ─── Tab bootstrap ────────────────────────────────────────────────────────────
async function ensureTabs(id: string) {
  if (tabsReady) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
  const existing = meta.data.sheets?.map(s => s.properties?.title) || []
  const toCreate = [STOCK_TAB, ISSUES_TAB].filter(t => !existing.includes(t))
  if (toCreate.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: toCreate.map(t => ({ addSheet: { properties: { title: t } } })) },
    })
    for (const tab of toCreate) {
      const headers = tab === STOCK_TAB ? STOCK_HEADERS : ISSUES_HEADERS
      await sheets.spreadsheets.values.update({
        spreadsheetId: id, range: `${tab}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      })
    }
  }
  tabsReady = true
}

// ─── Parsers ──────────────────────────────────────────────────────────────────
function parseStock(r: string[]): MeterStock {
  return {
    serialNo:     r[0]  || "",
    typeLabel:    (r[1]  || "") as MeterTypeLabel,
    phase:        r[2]  || "",
    ampere:       r[3]  || "",
    smart:        (r[4]  || "").toLowerCase() === "yes",
    condition:    (r[5]  || "available") as MeterCondition,
    receivedDate: r[6]  || "",
    batchRemarks: r[7]  || "",
    lastUpdated:  r[8]  || "",
  }
}
function parseIssue(r: string[]): MeterIssue {
  return {
    issueId:       r[0]  || "",
    issueDate:     r[1]  || "",
    purpose:       (r[2]  || "faulty_replacement") as IssuePurpose,
    consumerId:    r[3]  || "",
    nscReceiveNo:  r[4]  || "",
    consumerName:  r[5]  || "",
    agency:        r[6]  || "",
    serialNo:      r[7]  || "",
    meterType:     r[8]  || "",
    status:        (r[9]  || "issued") as IssueStatus,
    beforeImage:   r[10] || "",
    afterImage:    r[11] || "",
    lastReading:   r[12] || "",
    newReading:    r[13] || "",
    completionRef:  r[14] || "",
    completedAt:    r[15] || "",
    completedBy:    r[16] || "",
    remarks:        r[17] || "",
    installationNo: r[18] || "",
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────
export async function fetchStock(): Promise<MeterStock[]> {
  if (stockMemo && Date.now() - stockMemo.at < TTL) return stockMemo.data
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${STOCK_TAB}!A:I` })
  const data = (res.data.values || []).slice(1).filter(r => r[0]).map(r => parseStock(r.map(String)))
  stockMemo = { at: Date.now(), data }
  return data
}

export async function fetchIssues(): Promise<MeterIssue[]> {
  if (issuesMemo && Date.now() - issuesMemo.at < TTL) return issuesMemo.data
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${ISSUES_TAB}!A:S` })
  const data = (res.data.values || []).slice(1).filter(r => r[0]).map(r => parseIssue(r.map(String)))
  issuesMemo = { at: Date.now(), data }
  return data
}

// ─── Stock summary ────────────────────────────────────────────────────────────
export async function getStockSummary(): Promise<StockSummary[]> {
  const all = await fetchStock()
  return METER_TYPES.map(t => {
    const rows = all.filter(m => m.typeLabel === t.label)
    return {
      label:     t.label,
      available: rows.filter(m => m.condition === "available").length,
      issued:    rows.filter(m => m.condition === "issued").length,
      installed: rows.filter(m => m.condition === "installed").length,
      faulty:    rows.filter(m => m.condition === "faulty").length,
      total:     rows.length,
    }
  })
}

// ─── Add stock ────────────────────────────────────────────────────────────────
export async function addMeterStock(meters: Array<{
  serialNo:     string
  typeLabel:    MeterTypeLabel
  batchRemarks?: string
}>): Promise<number> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const typeMap = new Map(METER_TYPES.map(t => [t.label, t]))
  const today = nowDate()
  const rows = meters.map(m => {
    const t = typeMap.get(m.typeLabel)!
    return [m.serialNo, m.typeLabel, t.phase, t.ampere, t.smart ? "yes" : "no", "available", today, m.batchRemarks || "", today]
  })
  await sheets.spreadsheets.values.append({
    spreadsheetId: id, range: `${STOCK_TAB}!A:I`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  })
  invalidateMeterCache()
  return rows.length
}

// ─── Next Issue ID ────────────────────────────────────────────────────────────
async function nextIssueId(id: string): Promise<string> {
  const all = await fetchIssues()
  const max = all.reduce((m, i) => {
    const n = parseInt(i.issueId.replace("MI-", ""), 10)
    return isNaN(n) ? m : Math.max(m, n)
  }, 0)
  return `MI-${String(max + 1).padStart(4, "0")}`
}

// ─── Issue meter ──────────────────────────────────────────────────────────────
export async function issueMeter(req: {
  serialNo:     string
  purpose:      IssuePurpose
  consumerId:   string
  nscReceiveNo?: string
  consumerName: string
  agency:       string
  remarks?:     string
}): Promise<string> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const stock = await fetchStock()
  const idx = stock.findIndex(m => m.serialNo === req.serialNo)
  if (idx === -1) throw new Error("Serial number not found in stock")
  if (stock[idx].condition !== "available") throw new Error("Meter is not available")
  const issueId = await nextIssueId(id)
  const today = nowDate()
  await sheets.spreadsheets.values.append({
    spreadsheetId: id, range: `${ISSUES_TAB}!A:R`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[issueId, today, req.purpose, req.consumerId, req.nscReceiveNo || "",
        req.consumerName, req.agency, req.serialNo, stock[idx].typeLabel, "issued",
        "", "", "", "", "", "", "", req.remarks || ""]],
    },
  })
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${STOCK_TAB}!F${idx + 2}`, values: [["issued"]] },
        { range: `${STOCK_TAB}!I${idx + 2}`, values: [[today]] },
      ],
    },
  })
  invalidateMeterCache()
  return issueId
}

// ─── Agency: mark installation done (no completionRef yet) ───────────────────
export async function completeMeterInstallation(req: {
  issueId:     string
  afterImage:  string
  beforeImage?: string
  lastReading?: string
  newReading?:  string
  completedBy:  string
  remarks?:     string
}): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const issues = await fetchIssues()
  const issueIdx = issues.findIndex(i => i.issueId === req.issueId)
  if (issueIdx === -1) throw new Error("Issue not found")
  const row = issueIdx + 2
  const now = nowDate()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${ISSUES_TAB}!J${row}`, values: [["installation_done"]] },
        { range: `${ISSUES_TAB}!K${row}`, values: [[req.beforeImage || ""]] },
        { range: `${ISSUES_TAB}!L${row}`, values: [[req.afterImage]] },
        { range: `${ISSUES_TAB}!M${row}`, values: [[req.lastReading || ""]] },
        { range: `${ISSUES_TAB}!N${row}`, values: [[req.newReading || ""]] },
        { range: `${ISSUES_TAB}!P${row}`, values: [[now]] },
        { range: `${ISSUES_TAB}!Q${row}`, values: [[req.completedBy]] },
        { range: `${ISSUES_TAB}!R${row}`, values: [[req.remarks || ""]] },
      ],
    },
  })
  invalidateMeterCache()
}

// ─── Admin/Executive: finalize with completionRef ────────────────────────────
export async function finalizeMeterInstallation(req: {
  issueId:        string
  completionRef:  string
  installationNo?: string
  finalizedBy:    string
}): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const issues = await fetchIssues()
  const issueIdx = issues.findIndex(i => i.issueId === req.issueId)
  if (issueIdx === -1) throw new Error("Issue not found")
  const issue = issues[issueIdx]
  const row = issueIdx + 2
  const now = nowDate()
  const updates: any[] = [
    { range: `${ISSUES_TAB}!J${row}`, values: [["installed"]] },
    { range: `${ISSUES_TAB}!O${row}`, values: [[req.completionRef]] },
    { range: `${ISSUES_TAB}!P${row}`, values: [[now]] },
    { range: `${ISSUES_TAB}!Q${row}`, values: [[req.finalizedBy]] },
  ]
  if (req.installationNo) {
    updates.push({ range: `${ISSUES_TAB}!S${row}`, values: [[req.installationNo]] })
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: "RAW", data: updates },
  })
  // Mark stock as installed
  const stock = await fetchStock()
  const si = stock.findIndex(m => m.serialNo === issue.serialNo)
  if (si !== -1) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: `${STOCK_TAB}!F${si + 2}`, values: [["installed"]] },
          { range: `${STOCK_TAB}!I${si + 2}`, values: [[now]] },
        ],
      },
    })
  }
  invalidateMeterCache()
}

// ─── Bulk finalize: one fetch, two batchUpdates total ────────────────────────
export async function bulkFinalizeMeterInstallations(req: {
  issueIds:        string[]
  completionRef:   string
  installationNo?: string
  finalizedBy:     string
}): Promise<{ succeeded: number; failed: string[] }> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const [issues, stock] = await Promise.all([fetchIssues(), fetchStock()])
  const now = nowDate()

  const issueUpdates: { range: string; values: any[][] }[] = []
  const stockUpdates: { range: string; values: any[][] }[] = []
  const failed: string[] = []

  for (const issueId of req.issueIds) {
    const issueIdx = issues.findIndex(i => i.issueId === issueId)
    if (issueIdx === -1) { failed.push(issueId); continue }
    const row = issueIdx + 2
    issueUpdates.push(
      { range: `${ISSUES_TAB}!J${row}`, values: [["installed"]] },
      { range: `${ISSUES_TAB}!O${row}`, values: [[req.completionRef]] },
      { range: `${ISSUES_TAB}!P${row}`, values: [[now]] },
      { range: `${ISSUES_TAB}!Q${row}`, values: [[req.finalizedBy]] },
    )
    if (req.installationNo) {
      issueUpdates.push({ range: `${ISSUES_TAB}!S${row}`, values: [[req.installationNo]] })
    }
    const si = stock.findIndex(m => m.serialNo === issues[issueIdx].serialNo)
    if (si !== -1) {
      stockUpdates.push(
        { range: `${STOCK_TAB}!F${si + 2}`, values: [["installed"]] },
        { range: `${STOCK_TAB}!I${si + 2}`, values: [[now]] },
      )
    }
  }

  if (issueUpdates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: { valueInputOption: "RAW", data: issueUpdates },
    })
  }
  if (stockUpdates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: { valueInputOption: "RAW", data: stockUpdates },
    })
  }
  invalidateMeterCache()
  return { succeeded: req.issueIds.length - failed.length, failed }
}

// ─── Return to stock ──────────────────────────────────────────────────────────
export async function returnMeterToStock(req: {
  issueId: string
  remarks: string
  faulty:  boolean
}): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTabs(id)
  const issues = await fetchIssues()
  const issueIdx = issues.findIndex(i => i.issueId === req.issueId)
  if (issueIdx === -1) throw new Error("Issue not found")
  const issue = issues[issueIdx]
  const row = issueIdx + 2
  const now = nowDate()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${ISSUES_TAB}!J${row}`, values: [["returned"]] },
        { range: `${ISSUES_TAB}!R${row}`, values: [[req.remarks]] },
        { range: `${ISSUES_TAB}!P${row}`, values: [[now]] },
      ],
    },
  })
  const stock = await fetchStock()
  const si = stock.findIndex(m => m.serialNo === issue.serialNo)
  if (si !== -1) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        valueInputOption: "RAW",
        data: [
          { range: `${STOCK_TAB}!F${si + 2}`, values: [[req.faulty ? "faulty" : "available"]] },
          { range: `${STOCK_TAB}!H${si + 2}`, values: [[req.remarks]] },
          { range: `${STOCK_TAB}!I${si + 2}`, values: [[now]] },
        ],
      },
    })
  }
  invalidateMeterCache()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function nowDate(): string {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return [String(d.getUTCDate()).padStart(2, "0"), String(d.getUTCMonth() + 1).padStart(2, "0"), d.getUTCFullYear()].join("-")
}

export function expandSerialRange(prefix: string, start: string, end: string): string[] {
  const s = parseInt(start, 10), e = parseInt(end, 10)
  if (isNaN(s) || isNaN(e) || e < s) return []
  const pad = Math.max(start.length, end.length)
  const result: string[] = []
  for (let i = s; i <= e; i++) result.push(prefix + String(i).padStart(pad, "0"))
  return result
}
