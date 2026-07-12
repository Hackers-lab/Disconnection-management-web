import { google } from "googleapis"

const SHEET_ID = process.env.USERS_SHEET!
const SHEET_NAME = "AppRoles"

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

export interface RolePermissions {
  role: string
  disconnection: string[]
  reconnection: string[]
  deemed: string[]
  dtr: string[]
  meter: string[]
  nsc: string[]
  consumer_master: string[]
  admin: string[]
  meter_replacement: string[]
  dtr_painting: string[]
}

const MODULES = [
  "disconnection",
  "reconnection",
  "deemed",
  "dtr",
  "meter",
  "nsc",
  "consumer_master",
  "admin",
  "meter_replacement",
  "dtr_painting",
] as const

const DEFAULT_ROLES: RolePermissions[] = [
  {
    role: "admin",
    disconnection: ["read", "create", "update", "delete"],
    reconnection: ["read", "create", "update", "delete"],
    deemed: ["read", "create", "update", "delete"],
    dtr: ["read", "create", "update", "delete"],
    meter: ["read", "create", "update", "delete"],
    nsc: ["read", "create", "update", "delete"],
    consumer_master: ["read", "create", "update", "delete"],
    admin: ["read", "create", "update", "delete"],
    meter_replacement: ["read", "create", "update", "delete"],
    dtr_painting: ["read", "create", "update", "delete"],
  },
  {
    role: "viewer",
    disconnection: ["read"],
    reconnection: ["read"],
    deemed: ["read"],
    dtr: ["read"],
    meter: ["read"],
    nsc: ["read"],
    consumer_master: ["read"],
    admin: [],
    meter_replacement: ["read"],
    dtr_painting: ["read"],
  },
  {
    role: "agency",
    disconnection: ["read", "update"],
    reconnection: ["read", "update"],
    deemed: ["read", "update"],
    dtr: ["read", "update"],
    meter: ["read", "update"],
    nsc: ["read", "update"],
    consumer_master: ["read"],
    admin: [],
    meter_replacement: ["read", "update"],
    dtr_painting: ["read", "update"],
  },
  {
    role: "technical",
    disconnection: [],
    reconnection: [],
    deemed: [],
    dtr: ["read", "update"],
    meter: [],
    nsc: [],
    consumer_master: [],
    admin: [],
    meter_replacement: [],
    dtr_painting: [],
  },
  {
    role: "painter",
    disconnection: [],
    reconnection: [],
    deemed: [],
    dtr: [],
    meter: [],
    nsc: [],
    consumer_master: [],
    admin: [],
    meter_replacement: [],
    dtr_painting: ["read", "update"],
  },
  {
    role: "executive",
    disconnection: ["read", "create", "update", "delete"],
    reconnection: ["read", "create", "update", "delete"],
    deemed: ["read", "create", "update", "delete"],
    dtr: ["read", "create", "update", "delete"],
    meter: ["read", "create", "update", "delete"],
    nsc: ["read", "create", "update", "delete"],
    consumer_master: ["read", "create", "update", "delete"],
    admin: [],
    meter_replacement: ["read", "create", "update", "delete"],
    dtr_painting: ["read", "create", "update", "delete"],
  },
]

type CachedRoles = { roles: RolePermissions[]; timestamp: number }

export class RoleStorage {
  static instance: RoleStorage
  private _cache: CachedRoles | null = null
  private readonly _CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

  static getInstance() {
    if (!RoleStorage.instance) RoleStorage.instance = new RoleStorage()
    return RoleStorage.instance
  }

  invalidateCache() {
    this._cache = null
  }

  private _parseRows(rows: any[][]): RolePermissions[] {
    return rows
      .filter((row) => row && row.length > 0 && row[0])
      .map(([role, ...perms]) => {
        const result: Partial<RolePermissions> = { role: String(role).trim() }
        MODULES.forEach((mod, idx) => {
          const val = perms[idx] ? String(perms[idx]).trim() : ""
          result[mod] = val ? val.split(",").map((s) => s.trim()).filter(Boolean) : []
        })
        return result as RolePermissions
      })
  }

  private async _ensureTab(sheets: any) {
    try {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
      const tabExists = spreadsheet.data.sheets?.some(
        (s: any) => s.properties?.title === SHEET_NAME
      )

      if (!tabExists) {
        console.log(`Creating missing tab "${SHEET_NAME}"...`)
        // Add tab
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SHEET_ID,
          requestBody: {
            requests: [{ addSheet: { properties: { title: SHEET_NAME } } }],
          },
        })

        // Add headers and defaults
        const headers = ["Role", ...MODULES]
        const values = [
          headers,
          ...DEFAULT_ROLES.map((r) => [
            r.role,
            ...MODULES.map((mod) => r[mod].join(",")),
          ]),
        ]

        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!A1`,
          valueInputOption: "RAW",
          requestBody: { values },
        })
      } else {
        // Tab exists. Let's check headers.
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!A1:K`,
        })
        const allRows = res.data.values || []
        const headers = allRows[0] || []

        if (!headers.includes("meter_replacement") || !headers.includes("dtr_painting")) {
          console.log(`Updating "${SHEET_NAME}" with new headers and default permissions for missing columns...`)
          
          // 1. Update header row
          const newHeaders = ["Role", ...MODULES]
          await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: `${SHEET_NAME}!A1`,
            valueInputOption: "RAW",
            requestBody: { values: [newHeaders] },
          })

          // 2. Update existing rows with defaults for new columns if they exist
          const dataRows = allRows.slice(1)
          const updatedRows = dataRows.map((row: any[]) => {
            const roleName = String(row[0] || "").trim()
            const defaultRole = DEFAULT_ROLES.find(dr => dr.role.toLowerCase() === roleName.toLowerCase())
            
            const rowValues = [roleName]
            MODULES.forEach((mod, idx) => {
              if (idx < row.length - 1) {
                rowValues.push(row[idx + 1] || "")
              } else {
                const defaultPerms = defaultRole ? (defaultRole[mod] || []) : []
                rowValues.push(defaultPerms.join(","))
              }
            })
            return rowValues
          })

          if (updatedRows.length > 0) {
            await sheets.spreadsheets.values.update({
              spreadsheetId: SHEET_ID,
              range: `${SHEET_NAME}!A2`,
              valueInputOption: "RAW",
              requestBody: { values: updatedRows },
            })
          }
        }
      }
    } catch (e) {
      console.error("Failed to ensure roles tab exists:", e)
    }
  }

  async getRoles(): Promise<RolePermissions[]> {
    if (this._cache && Date.now() - this._cache.timestamp < this._CACHE_TTL_MS) {
      return this._cache.roles
    }
    const sheets = await getSheetsClient()
    await this._ensureTab(sheets)

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A2:K`,
    })
    const rows = res.data.values || []
    const roles = this._parseRows(rows)

    // Ensure at least admin exists if sheet was manually emptied
    if (roles.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A2`,
        valueInputOption: "RAW",
        requestBody: {
          values: [
            [
              "admin",
              ...MODULES.map((mod) => "read,create,update,delete"),
            ],
          ],
        },
      })
      this.invalidateCache()
      return this.getRoles()
    }

    this._cache = { roles, timestamp: Date.now() }
    return roles
  }

  async getPermissionsForRole(roleName: string): Promise<Record<string, string[]> | null> {
    const roles = await this.getRoles()
    const r = roles.find((x) => x.role.toLowerCase() === roleName.toLowerCase())
    if (!r) return null

    const perms: Record<string, string[]> = {}
    MODULES.forEach((mod) => {
      perms[mod] = r[mod] || []
    })
    return perms
  }

  async addOrUpdateRole(role: RolePermissions) {
    const sheets = await getSheetsClient()
    await this._ensureTab(sheets)
    const roles = await this.getRoles()

    const idx = roles.findIndex(
      (x) => x.role.toLowerCase() === role.role.toLowerCase()
    )
    const rowValues = [role.role, ...MODULES.map((mod) => (role[mod] || []).join(","))]

    if (idx === -1) {
      // Append
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A:K`,
        valueInputOption: "RAW",
        requestBody: {
          values: [rowValues],
        },
      })
    } else {
      // Update
      const rowNum = idx + 2 // A2 starts at index 0, so row is index + 2
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A${rowNum}:K${rowNum}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [rowValues],
        },
      })
    }
    this.invalidateCache()
    return role
  }

  async deleteRole(roleName: string) {
    const sheets = await getSheetsClient()
    await this._ensureTab(sheets)
    const roles = await this.getRoles()
    const idx = roles.findIndex(
      (x) => x.role.toLowerCase() === roleName.toLowerCase()
    )
    if (idx === -1) return null

    // Get spreadsheet tab property sheetId for deletion batch update
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
    const sheet = spreadsheet.data.sheets?.find(
      (s: any) => s.properties?.title === SHEET_NAME
    )
    const targetSheetId = sheet?.properties?.sheetId

    if (targetSheetId === undefined || targetSheetId === null) {
      throw new Error(`Sheet tab "${SHEET_NAME}" not found`)
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: targetSheetId,
                dimension: "ROWS",
                startIndex: idx + 1, // 0-based: Row 2 (A2) is index 1
                endIndex: idx + 2,
              },
            },
          },
        ],
      },
    })
    this.invalidateCache()
    return roles[idx]
  }
}

export const roleStorage = RoleStorage.getInstance()
