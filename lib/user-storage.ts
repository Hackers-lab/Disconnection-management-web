import { google } from "googleapis"

const SHEET_ID = process.env.MASTER_CONFIG_SHEET!
const SHEET_NAME = "Master_Credentials"

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

export interface MasterUser {
  id: string
  username: string
  password: string
  role: string
  cccCode: string
  name: string
  agencies: string[]
}

type CachedUsers = { users: MasterUser[], timestamp: number }

export class UserStorage {
  static instance: UserStorage
  private _cache: CachedUsers | null = null
  private readonly _CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

  static getInstance() {
    if (!UserStorage.instance) UserStorage.instance = new UserStorage()
    return UserStorage.instance
  }

  _parseRows(rows: any[][]): MasterUser[] {
    return rows
      .filter(row => row && row.length > 0 && row[1])
      .map(([id, username, password, role, cccCode, name, agencies]) => ({
        id: String(id || ""),
        username: String(username || ""),
        password: String(password || ""),
        role: String(role || ""),
        cccCode: String(cccCode || ""),
        name: String(name || ""),
        agencies: agencies ? String(agencies).split(",") : [] as string[],
      }))
  }

  invalidateCache() {
    this._cache = null
  }

  async getUsers(): Promise<MasterUser[]> {
    if (!SHEET_ID) {
      throw new Error("MASTER_CONFIG_SHEET environment variable is not defined")
    }
    if (this._cache && Date.now() - this._cache.timestamp < this._CACHE_TTL_MS) {
      return this._cache.users
    }
    const sheets = await getSheetsClient()
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:G`,
    })
    const rows = res.data.values || []
    const users = this._parseRows(rows)
    this._cache = { users, timestamp: Date.now() }
    return users
  }

  async findUserByCredentials(username: string, password: string): Promise<MasterUser | null> {
    const users = await this.getUsers()
    return users.find(u => u.username === username && u.password === password) || null
  }

  async addUser(user: Omit<MasterUser, "id">): Promise<MasterUser> {
    const users = await this.getUsers()
    const newId = (Math.max(0, ...users.map(u => Number(u.id) || 0)) + 1).toString()
    const sheets = await getSheetsClient()
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:G`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[newId, user.username, user.password, user.role, user.cccCode, user.name, user.agencies.join(",")]],
      },
    })
    this.invalidateCache()
    return { id: newId, ...user }
  }

  async updateUser(id: string, updates: Partial<Omit<MasterUser, "id">>): Promise<MasterUser | null> {
    const sheets = await getSheetsClient()
    const users = await this.getUsers()
    const idx = users.findIndex(u => u.id === id)
    if (idx === -1) return null
    const updated = { ...users[idx], ...updates }
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A${idx + 2}:G${idx + 2}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[updated.id, updated.username, updated.password, updated.role, updated.cccCode, updated.name, updated.agencies.join(",")]],
      },
    })
    this.invalidateCache()
    return updated
  }

  async deleteUser(id: string): Promise<MasterUser | null> {
    const sheets = await getSheetsClient()
    const users = await this.getUsers()
    const idx = users.findIndex(u => u.id === id)
    if (idx === -1) return null

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
    })
    const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === SHEET_NAME)
    const targetSheetId = sheet?.properties?.sheetId

    if (targetSheetId === undefined || targetSheetId === null) {
      throw new Error(`Sheet tab "${SHEET_NAME}" not found`)
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: targetSheetId,
              dimension: "ROWS",
              startIndex: idx + 1,
              endIndex: idx + 2
            }
          }
        }]
      }
    })

    this.invalidateCache()
    return users[idx]
  }
}

export const userStorage = UserStorage.getInstance()