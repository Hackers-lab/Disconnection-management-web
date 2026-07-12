// Server-only — imports googleapis. Never import in "use client" components.
import { google } from "googleapis"
import { unstable_cache, revalidateTag } from "next/cache"
import { auth } from "./google-drive"
import { getSpreadsheetId } from "./google-sheets-api"
import type { NSCApplication } from "./nsc-types"
import { nowTs, currentFY } from "./date-utils"

export type { NSCApplication }

const sheets = google.sheets({ version: "v4", auth })

export const NSC_TAB = "NSC_Applications"

// 46 columns A–AU
const NSC_HEADERS = [
  "Receive No", "Received Date", "Applicant Name", "C/O", "Address",
  "Mobile", "Applied Class", "Phase", "Agency", "Status",
  "Created By", "Created At",
  // Inspection — verification
  "Verify Name", "Verify C/O", "Verify Address", "Verify Class",
  // Inspection — site conditions
  "Existing Meter", "Existing Meter No", "Existing Meter Image",
  "Valid Partition", "Partition Image", "Dispute",
  // Inspection — technical
  "Load (kW)", "Service Length (m)", "Pole Required", "Pole Drawing Image",
  "DTR Capacity", "DTR Load", "Site Image", "Inspection Form Image",
  // Inspection — decision
  "Agency Decision", "Agency Remarks", "Inspected At", "Inspected By",
  // Admin processing
  "Admin Decision", "Admin Remarks", "Final Action",
  "Memo No", "Application No", "Finalized At", "Finalized By",
  // Meter & connection milestones
  "Meter Issued At", "Connection Effected At", "Meter Serial No",
  // Added columns (AS–AV) — safe to append, never break existing data
  "Office Ref No", "Project ID", "Is Legacy", "Existing Consumer ID",
]

// ─── Shared cross-instance cache (Next.js Data Cache) ─────────────────────────
// Read paths use the cached wrapper; write paths use the raw fetch so row
// positions / next receive numbers are always computed against live data.
const NSC_TAG = "nsc"
const NSC_REVALIDATE_S = 60
let tabReady = false

export function invalidateNSCCache() { revalidateTag(NSC_TAG) }

// ─── Tab bootstrap ────────────────────────────────────────────────────────────
async function ensureTab(id: string) {
  if (tabReady) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id })
  const existing = meta.data.sheets?.map(s => s.properties?.title) || []
  if (!existing.includes(NSC_TAB)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: [{ addSheet: { properties: { title: NSC_TAB } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId: id, range: `${NSC_TAB}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [NSC_HEADERS] },
    })
  }
  tabReady = true
}

// ─── Parser ──────────────────────────────────────────────────────────────────
function parseRow(r: string[]): NSCApplication {
  return {
    receiveNo:         r[0]  || "",
    receivedDate:      r[1]  || "",
    applicantName:     r[2]  || "",
    careOf:            r[3]  || "",
    address:           r[4]  || "",
    mobile:            r[5]  || "",
    appliedClass:      r[6]  || "",
    phase:             r[7]  || "",
    agency:            r[8]  || "",
    status:            r[9]  || "pending",
    createdBy:         r[10] || "",
    createdAt:         r[11] || "",
    verifyName:        r[12] || "",
    verifyCO:          r[13] || "",
    verifyAddress:     r[14] || "",
    verifyClass:       r[15] || "",
    existingMeter:     r[16] || "",
    existingMeterNo:   r[17] || "",
    existingMeterImg:  r[18] || "",
    validPartition:    r[19] || "",
    partitionImg:      r[20] || "",
    dispute:           r[21] || "",
    load:              r[22] || "",
    serviceLength:     r[23] || "",
    poleRequired:      r[24] || "",
    poleDrawingImg:    r[25] || "",
    dtrCapacity:       r[26] || "",
    dtrLoad:           r[27] || "",
    siteImg:           r[28] || "",
    inspectionFormImg: r[29] || "",
    agencyDecision:    r[30] || "",
    agencyRemarks:     r[31] || "",
    inspectedAt:       r[32] || "",
    inspectedBy:       r[33] || "",
    adminDecision:     r[34] || "",
    adminRemarks:      r[35] || "",
    finalAction:       r[36] || "",
    memoNo:            r[37] || "",
    applicationNo:     r[38] || "",
    finalizedAt:          r[39] || "",
    finalizedBy:          r[40] || "",
    meterIssuedAt:        r[41] || "",
    connectionEffectedAt: r[42] || "",
    meterSerialNo:        r[43] || "",
    officeRefNo:          r[44] || "",
    projectId:            r[45] || "",
    isLegacy:             r[46] || "",
    existingConsumerId:   r[47] || "",
  }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function _fetchApplicationsRaw(): Promise<NSCApplication[]> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${NSC_TAB}!A:AV` })
  return (res.data.values || []).slice(1).filter(r => r[0]).map(r => parseRow(r.map(String)))
}

// Cached read for list/count endpoints (notifications, GET).
export const fetchApplications = unstable_cache(
  _fetchApplicationsRaw,
  ["nsc-data"],
  { revalidate: NSC_REVALIDATE_S, tags: [NSC_TAG] },
)

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────────
// nextReceiveNo now embeds phase: NSC/26-27/1P/0001 or NSC/26-27/3P/0001
// Separate counters per phase per FY prevent gaps when one type is common.
async function nextReceiveNo(id: string, phase: string): Promise<string> {
  const all = await _fetchApplicationsRaw()
  const fy  = currentFY()
  // Support legacy format (no phase segment) AND new format
  const phaseSegment = phase === "3P" ? "3P" : "1P"
  const newPrefix    = `NSC/${fy}/${phaseSegment}/`
  const legacyPrefix = `NSC/${fy}/`
  // Count only rows matching the same phase prefix (new format)
  const newNums = all
    .filter(a => a.receiveNo.startsWith(newPrefix))
    .map(a => parseInt(a.receiveNo.slice(newPrefix.length), 10))
    .filter(n => !isNaN(n))
  // Also check legacy rows that don't have phase segment but same phase value
  const legacyNums = all
    .filter(a => a.receiveNo.startsWith(legacyPrefix) && !a.receiveNo.slice(legacyPrefix.length).includes("/") && a.phase === phase)
    .map(a => parseInt(a.receiveNo.slice(legacyPrefix.length), 10))
    .filter(n => !isNaN(n))
  const allNums = [...newNums, ...legacyNums]
  const max = allNums.length ? Math.max(...allNums) : 0
  return `${newPrefix}${String(max + 1).padStart(4, "0")}`
}


// ─── Create application ───────────────────────────────────────────────────────
export async function createApplication(req: {
  applicantName: string
  careOf:        string
  address:       string
  mobile:        string
  appliedClass:  string
  phase:         string
  agency:        string
  createdBy:     string
  officeRefNo?:  string
}): Promise<string> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const receiveNo = await nextReceiveNo(id, req.phase)
  const now = nowTs()
  const row = new Array(48).fill("")
  row[0]  = receiveNo
  row[1]  = now.split(" ")[0]
  row[2]  = req.applicantName
  row[3]  = req.careOf
  row[4]  = req.address
  row[5]  = req.mobile
  row[6]  = req.appliedClass
  row[7]  = req.phase
  row[8]  = req.agency
  row[9]  = "pending"
  row[10] = req.createdBy
  row[11] = now
  row[44] = req.officeRefNo || ""
  await sheets.spreadsheets.values.append({
    spreadsheetId: id, range: `${NSC_TAB}!A:AV`,
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  })
  invalidateNSCCache()
  return receiveNo
}

// ─── Submit inspection (agency) ───────────────────────────────────────────────
export async function submitInspection(req: {
  receiveNo:         string
  verifyName:        string
  verifyCO:          string
  verifyAddress:     string
  verifyClass:       string
  existingMeter:     string
  existingMeterNo:   string
  existingMeterImg:  string
  validPartition:    string
  partitionImg:      string
  dispute:           string
  load:              string
  serviceLength:     string
  poleRequired:      string
  poleDrawingImg:    string
  dtrCapacity:       string
  dtrLoad:           string
  siteImg:           string
  inspectionFormImg: string
  agencyDecision:    string
  agencyRemarks:     string
  inspectedBy:       string
}): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const all = await _fetchApplicationsRaw()
  const idx = all.findIndex(a => a.receiveNo === req.receiveNo)
  if (idx === -1) throw new Error("Application not found")
  const row = idx + 2
  const now = nowTs()
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${NSC_TAB}!J${row}`,  values: [["inspected"]] },
        { range: `${NSC_TAB}!M${row}`,  values: [[req.verifyName]] },
        { range: `${NSC_TAB}!N${row}`,  values: [[req.verifyCO]] },
        { range: `${NSC_TAB}!O${row}`,  values: [[req.verifyAddress]] },
        { range: `${NSC_TAB}!P${row}`,  values: [[req.verifyClass]] },
        { range: `${NSC_TAB}!Q${row}`,  values: [[req.existingMeter]] },
        { range: `${NSC_TAB}!R${row}`,  values: [[req.existingMeterNo]] },
        { range: `${NSC_TAB}!S${row}`,  values: [[req.existingMeterImg]] },
        { range: `${NSC_TAB}!T${row}`,  values: [[req.validPartition]] },
        { range: `${NSC_TAB}!U${row}`,  values: [[req.partitionImg]] },
        { range: `${NSC_TAB}!V${row}`,  values: [[req.dispute]] },
        { range: `${NSC_TAB}!W${row}`,  values: [[req.load]] },
        { range: `${NSC_TAB}!X${row}`,  values: [[req.serviceLength]] },
        { range: `${NSC_TAB}!Y${row}`,  values: [[req.poleRequired]] },
        { range: `${NSC_TAB}!Z${row}`,  values: [[req.poleDrawingImg]] },
        { range: `${NSC_TAB}!AA${row}`, values: [[req.dtrCapacity]] },
        { range: `${NSC_TAB}!AB${row}`, values: [[req.dtrLoad]] },
        { range: `${NSC_TAB}!AC${row}`, values: [[req.siteImg]] },
        { range: `${NSC_TAB}!AD${row}`, values: [[req.inspectionFormImg]] },
        { range: `${NSC_TAB}!AE${row}`, values: [[req.agencyDecision]] },
        { range: `${NSC_TAB}!AF${row}`, values: [[req.agencyRemarks]] },
        { range: `${NSC_TAB}!AG${row}`, values: [[now]] },
        { range: `${NSC_TAB}!AH${row}`, values: [[req.inspectedBy]] },
      ],
    },
  })
  invalidateNSCCache()
}

// ─── Process application (admin/exec) ─────────────────────────────────────────
export async function processApplication(req: {
  receiveNo:          string
  adminDecision:      string
  adminRemarks:       string
  finalAction:        string   // "quotation" | "dispute_letter" | "reassign"
  memoNo?:            string
  applicationNo?:     string
  newAgency?:         string   // only for reassign
  existingConsumerId?: string
  finalizedBy:        string
}): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const all = await _fetchApplicationsRaw()
  const idx = all.findIndex(a => a.receiveNo === req.receiveNo)
  if (idx === -1) throw new Error("Application not found")
  const row = idx + 2
  const now = nowTs()

  const newStatus =
    req.finalAction === "quotation"      ? "quotation_issued" :
    req.finalAction === "dispute_letter" ? "dispute_issued"   : "pending"

  const updates: any[] = [
    { range: `${NSC_TAB}!J${row}`,  values: [[newStatus]] },
    { range: `${NSC_TAB}!AI${row}`, values: [[req.adminDecision]] },
    { range: `${NSC_TAB}!AJ${row}`, values: [[req.adminRemarks]] },
    { range: `${NSC_TAB}!AK${row}`, values: [[req.finalAction]] },
    { range: `${NSC_TAB}!AN${row}`, values: [[now]] },
    { range: `${NSC_TAB}!AO${row}`, values: [[req.finalizedBy]] },
  ]
  if (req.memoNo)            updates.push({ range: `${NSC_TAB}!AL${row}`, values: [[req.memoNo]] })
  if (req.applicationNo)     updates.push({ range: `${NSC_TAB}!AM${row}`, values: [[req.applicationNo]] })
  if (req.newAgency)         updates.push({ range: `${NSC_TAB}!I${row}`,  values: [[req.newAgency]] })
  if (req.existingConsumerId !== undefined)
    updates.push({ range: `${NSC_TAB}!AV${row}`, values: [[req.existingConsumerId]] })

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: "RAW", data: updates },
  })
  invalidateNSCCache()
}

// ─── Called by meter-service when a meter is issued for NSC ──────────────────
export async function updateNSCMeterIssued(receiveNo: string, serialNo: string, agency: string): Promise<void> {
  if (!receiveNo) return
  const id = getSpreadsheetId()
  await ensureTab(id)
  const all = await _fetchApplicationsRaw()
  const idx = all.findIndex(a => a.receiveNo === receiveNo)
  if (idx === -1) return
  const row = idx + 2
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${NSC_TAB}!J${row}`,  values: [["meter_issued"]] },
        { range: `${NSC_TAB}!AP${row}`, values: [[nowTs()]] },
        { range: `${NSC_TAB}!AR${row}`, values: [[serialNo]] },
        { range: `${NSC_TAB}!I${row}`,  values: [[agency]] },
      ],
    },
  })
  invalidateNSCCache()
}

// ─── Called by meter-service when NSC meter installation is finalized ────────
export async function updateNSCConnectionEffected(receiveNo: string): Promise<void> {
  if (!receiveNo) return
  const id = getSpreadsheetId()
  await ensureTab(id)
  const all = await _fetchApplicationsRaw()
  const idx = all.findIndex(a => a.receiveNo === receiveNo)
  if (idx === -1) return
  const row = idx + 2
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `${NSC_TAB}!J${row}`,  values: [["connection_effected"]] },
        { range: `${NSC_TAB}!AQ${row}`, values: [[nowTs()]] },
      ],
    },
  })
  invalidateNSCCache()
}

// ─── Called by meter-service when NSC meter is returned to stock ─────────────
export async function updateNSCMeterReturned(receiveNo: string): Promise<void> {
  if (!receiveNo) return
  const id = getSpreadsheetId()
  await ensureTab(id)
  const all = await _fetchApplicationsRaw()
  const idx = all.findIndex(a => a.receiveNo === receiveNo)
  if (idx === -1) return
  const row = idx + 2
  await sheets.spreadsheets.values.update({
    spreadsheetId: id, range: `${NSC_TAB}!J${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [["meter_returned"]] },
  })
  invalidateNSCCache()
}

// ─── Update office reference number (always editable) ────────────────────────
export async function updateOfficeRefNo(receiveNo: string, officeRefNo: string): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const all = await _fetchApplicationsRaw()
  const idx = all.findIndex(a => a.receiveNo === receiveNo)
  if (idx === -1) throw new Error("Application not found")
  const row = idx + 2
  await sheets.spreadsheets.values.update({
    spreadsheetId: id, range: `${NSC_TAB}!AS${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[officeRefNo]] },
  })
  invalidateNSCCache()
}

// ─── Link an application to a project ────────────────────────────────────────
export async function updateNSCProjectLink(receiveNo: string, projectId: string, newStatus?: string): Promise<void> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const all = await _fetchApplicationsRaw()
  const idx = all.findIndex(a => a.receiveNo === receiveNo)
  if (idx === -1) throw new Error("Application not found")
  const row = idx + 2
  const updates: any[] = [
    { range: `${NSC_TAB}!AT${row}`, values: [[projectId]] },
  ]
  if (newStatus) updates.push({ range: `${NSC_TAB}!J${row}`, values: [[newStatus]] })
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: "RAW", data: updates },
  })
  invalidateNSCCache()
}

// ─── Bulk legacy import ───────────────────────────────────────────────────────
export interface LegacyImportRow {
  applicantName: string
  careOf:        string
  address:       string
  mobile:        string
  appliedClass:  string
  phase:         string
  agency:        string
  officeRefNo:   string   // original serial from Excel
  receivedDate:  string   // original date (YYYY-MM-DD)
  status:        string   // current status if known
  createdBy:     string
}

export async function importLegacyApplications(rows: LegacyImportRow[]): Promise<number> {
  const id = getSpreadsheetId()
  await ensureTab(id)
  const existing = await _fetchApplicationsRaw()
  const fy = currentFY()
  const prefix = `NSC/${fy}/`
  const nums = existing
    .filter(a => a.receiveNo.startsWith(prefix))
    .map(a => parseInt(a.receiveNo.slice(prefix.length), 10))
    .filter(n => !isNaN(n))
  let counter = nums.length ? Math.max(...nums) : 0

  const values = rows.map(r => {
    counter++
    const receiveNo = `${prefix}${String(counter).padStart(4, "0")}`
    const row = new Array(48).fill("")
    row[0]  = receiveNo
    row[1]  = r.receivedDate
    row[2]  = r.applicantName
    row[3]  = r.careOf
    row[4]  = r.address
    row[5]  = r.mobile
    row[6]  = r.appliedClass
    row[7]  = r.phase
    row[8]  = r.agency
    row[9]  = r.status || "pending"
    row[10] = r.createdBy
    row[11] = nowTs()
    row[44] = r.officeRefNo
    row[46] = "true"   // isLegacy
    return row
  })

  // Append in batches
  const BATCH = 200
  for (let i = 0; i < values.length; i += BATCH) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: id, range: `${NSC_TAB}!A:AV`,
      valueInputOption: "RAW",
      requestBody: { values: values.slice(i, i + BATCH) },
    })
  }
  invalidateNSCCache()
  return values.length
}
