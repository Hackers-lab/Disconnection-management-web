import { google } from "googleapis"
import { auth } from "./google-drive"

const LOG_SHEET_NAME = "Login_Logs"

const LOG_HEADERS = [
  "Timestamp", "Deployment", "Action", "Status",
  "User ID", "Username", "Role", "Agencies",
  "IP", "User Agent", "Device ID",
]

export interface LoginLogEntry {
  action: "login"
  status: "success" | "failed"
  deployment?: string
  userId?: string
  username: string
  role?: string
  agencies?: string[]
  ip?: string
  userAgent?: string
  deviceId?: string
}

const sheets = google.sheets({ version: "v4", auth })

// Per-container flag so ensureLogTab only hits the Sheets API once per cold start.
let tabReady = false

async function ensureLogTab(spreadsheetId: string): Promise<void> {
  if (tabReady) return
  const meta = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = meta.data.sheets?.some(s => s.properties?.title === LOG_SHEET_NAME)
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: LOG_SHEET_NAME } } }] },
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${LOG_SHEET_NAME}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [LOG_HEADERS] },
    })
  }
  tabReady = true
}

function nowTimestamp(): string {
  const d = new Date()
  return [
    String(d.getDate()).padStart(2, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    d.getFullYear(),
  ].join("-") + " " + [
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join(":")
}

/**
 * Append one row to the central Login_Logs tab.
 * Safe to call without await — errors are swallowed so they never
 * block or crash the login flow.
 */
const AUDIT_LOG_SHEET_ID = "1uHfdusljMxcbFFow4EMQqsSAUuVC59tyFFvUNRf1ZHY"

export async function appendLoginLog(entry: LoginLogEntry): Promise<void> {
  const spreadsheetId = AUDIT_LOG_SHEET_ID

  try {
    await ensureLogTab(spreadsheetId)

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${LOG_SHEET_NAME}!A:K`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          nowTimestamp(),
          entry.deployment || "unknown",
          entry.action,
          entry.status,
          entry.userId ?? "",
          entry.username,
          entry.role ?? "",
          (entry.agencies ?? []).join(", "),
          entry.ip ?? "",
          entry.userAgent ?? "",
          entry.deviceId ?? "",
        ]],
      },
    })
  } catch (e) {
    console.warn("[login-logger] write failed (non-critical):", e)
  }
}
