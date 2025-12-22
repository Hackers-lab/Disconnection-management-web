import { google } from "googleapis"

const SHEET_ID = process.env.USERS_SHEET!
const SHEET_NAME = "User" // Change to your sheet name
const LIST_SHEET_ID = process.env.GOOGLE_LIST_SHEET_ID!

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

export class UserStorage {
  static instance: UserStorage

  static getInstance() {
    if (!UserStorage.instance) UserStorage.instance = new UserStorage()
    return UserStorage.instance
  }

  async getUsers() {
    const sheets = await getSheetsClient()
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:E`,
    })
    const rows = res.data.values || []
    // Filter out empty rows or rows where the username (index 1) is missing
    return rows
      .filter(row => row && row.length > 0 && row[1])
      .map(([id, username, password, role, agencies]) => ({
      id,
      username,
      password,
      role,
      agencies: agencies ? agencies.split(",") : [],
    }))
  }

  async findUserByCredentials(username: string, password: string) {
    const users = await this.getUsers()
    return users.find(u => u.username === username && u.password === password) || null
  }

  async addUser(user: { username: string; password: string; role: string; agencies: string[] }) {
    const users = await this.getUsers()
    const newId = (Math.max(0, ...users.map(u => Number(u.id))) + 1).toString()
    const sheets = await getSheetsClient()
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:E`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[newId, user.username, user.password, user.role, user.agencies.join(",")]],
      },
    })
    return { id: newId, ...user }
  }

  async updateUser(id: string, updates: Partial<{ username: string; password: string; role: string; agencies: string[] }>) {
    const sheets = await getSheetsClient()
    const users = await this.getUsers()
    const idx = users.findIndex(u => u.id === id)
    if (idx === -1) return null
    const updated = { ...users[idx], ...updates }
    // Update the row in the sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${idx + 2}:E${idx + 2}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[updated.id, updated.username, updated.password, updated.role, updated.agencies.join(",")]],
      },
    })
    return updated
  }

  async deleteUser(id: string) {
    const sheets = await getSheetsClient()
    const users = await this.getUsers()
    const idx = users.findIndex(u => u.id === id)
    if (idx === -1) return null

    // To delete a row completely, we first need the numeric sheetId of the tab
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
    })
    const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === SHEET_NAME)
    const targetSheetId = sheet?.properties?.sheetId

    if (targetSheetId === undefined || targetSheetId === null) {
      throw new Error(`Sheet tab "${SHEET_NAME}" not found`)
    }

    // Use batchUpdate with deleteDimension to remove the row entirely from the sheet
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: targetSheetId,
              dimension: "ROWS",
              startIndex: idx + 1, // 0-based index: Row 1 is 0, Row 2 (A2) is 1
              endIndex: idx + 2
            }
          }
        }]
      }
    })

    return users[idx]
  }
}

export const userStorage = UserStorage.getInstance()