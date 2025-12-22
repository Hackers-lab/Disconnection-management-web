import { google } from "googleapis"

const SHEET_ID = process.env.USERS_SHEET!
const AGENCY_SHEET_NAME = "Agencies" // Change if your sheet name is different

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  return google.sheets({ version: "v4", auth })
}

export async function getAgencies() {
  const sheets = await getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${AGENCY_SHEET_NAME}!A2:D`,
  })
  const rows = res.data.values || []
  // Get all rows, including empty ones, to track real row numbers
  // Use sheets.spreadsheets.values.get to get all rows, then filter in-place
  let realRow = 2
  return rows
    .map(row => {
      const agency = row[0]
        ? {
            id: row[0],
            name: row[1],
            description: row[2],
            isActive: row[3] === "true" || row[3] === true,
            _sheetRow: realRow, // Track the actual sheet row number
          }
        : null
      realRow++
      return agency
    })
    .filter(Boolean)
}

export async function addAgency({ name, description, isActive }: { name: string; description: string; isActive: boolean }) {
  const agencies = await getAgencies()
  const newId = (Math.max(0, ...agencies.map(a => Number(a.id))) + 1).toString()
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${AGENCY_SHEET_NAME}!A:D`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[newId, name, description, isActive ? "true" : "false"]],
    },
  })
  return { id: newId, name, description, isActive }
}

export async function updateAgency({ id, name, description, isActive }: { id: string; name: string; description: string; isActive: boolean }) {
  const agencies = await getAgencies()
  const agency = agencies.find(a => a.id === id)
  if (!agency) return null
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${AGENCY_SHEET_NAME}!A${agency._sheetRow}:D${agency._sheetRow}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[id, name, description, isActive ? "true" : "false"]],
    },
  })
  return { id, name, description, isActive }
}

export async function deleteAgency(id: string) {
  const agencies = await getAgencies()
  const agency = agencies.find(a => a.id === id)
  if (!agency) return null
  const sheets = await getSheetsClient()
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: `${AGENCY_SHEET_NAME}!A${agency._sheetRow}:D${agency._sheetRow}`,
  })
  return agency
}