// Pure types — no Node.js deps, safe to import in "use client" components

export type NSCAppliedClass = "domestic" | "commercial" | "stw" | "industrial"
export type NSCPhase        = "1P" | "3P"
export type NSCStatus       = "pending" | "inspected" | "quotation_issued" | "dispute_issued"
export type NSCDecision     = "accepted" | "rejected" | ""

export const NSC_CLASSES: { value: NSCAppliedClass; label: string }[] = [
  { value: "domestic",   label: "LT Domestic" },
  { value: "commercial", label: "LT Commercial" },
  { value: "stw",        label: "STW" },
  { value: "industrial", label: "LT Industrial" },
]

export const NSC_PHASES: { value: NSCPhase; label: string }[] = [
  { value: "1P", label: "Single Phase (1P)" },
  { value: "3P", label: "Three Phase (3P)" },
]

export const NSC_STATUS_LABELS: Record<string, string> = {
  pending:          "Pending Inspection",
  inspected:        "Inspected",
  quotation_issued: "Quotation Issued",
  dispute_issued:   "Dispute Issued",
}

export const NSC_STATUS_COLORS: Record<string, string> = {
  pending:          "bg-yellow-100 text-yellow-800",
  inspected:        "bg-blue-100 text-blue-800",
  quotation_issued: "bg-green-100 text-green-800",
  dispute_issued:   "bg-red-100 text-red-800",
}

export interface NSCApplication {
  // Core application details
  receiveNo:         string
  receivedDate:      string
  applicantName:     string
  careOf:            string
  address:           string
  mobile:            string
  appliedClass:      string
  phase:             string
  agency:            string
  status:            string
  createdBy:         string
  createdAt:         string
  // Inspection — verification of submitted details
  verifyName:        string   // "ok" | corrected value
  verifyCO:          string   // "ok" | corrected value
  verifyAddress:     string   // "ok" | corrected value
  verifyClass:       string   // "ok" | corrected value
  // Inspection — site conditions
  existingMeter:     string   // "yes" | "no"
  existingMeterNo:   string
  existingMeterImg:  string
  validPartition:    string   // "yes" | "no"
  partitionImg:      string
  dispute:           string
  // Inspection — technical
  load:              string   // kW
  serviceLength:     string   // metres
  poleRequired:      string   // "yes" | "no"
  poleDrawingImg:    string
  dtrCapacity:       string
  dtrLoad:           string
  siteImg:           string
  inspectionFormImg: string
  // Inspection — agency decision
  agencyDecision:    string   // "accepted" | "rejected"
  agencyRemarks:     string
  inspectedAt:       string
  inspectedBy:       string
  // Admin processing
  adminDecision:     string   // "accepted" | "rejected"
  adminRemarks:      string
  finalAction:       string   // "quotation" | "dispute_letter" | "reassign"
  memoNo:            string
  applicationNo:     string   // 10-digit for quotation
  finalizedAt:       string
  finalizedBy:       string
}
