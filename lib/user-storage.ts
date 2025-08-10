import { google } from "googleapis"

const SHEET_ID = process.env.GOOGLE_SHEET_ID!
const SHEET_NAME = "User" // Change to your sheet name

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
    return rows.map(([id, username, password, role, agencies]) => ({
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
    // Delete the row by clearing it (Google Sheets API doesn't support row deletion directly)
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${idx + 2}:E${idx + 2}`,
    })
    return users[idx]
  }
}

export const userStorage = UserStorage.getInstance()