// c:\Users\Pc\Documents\GitHub\Disconnection-management-web\app\api\system\row-count\route.ts
import { google } from "googleapis"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') || 'consumer'

    // Determine Tab Name based on type
    // Default 'consumer' -> Sheet1
    // 'dd' -> DD
    let range = "Sheet1!A:A"
    
    if (type === 'dd') {
      range = "DD!A:A"
    }

    const client_email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const private_key = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, "\n")
    const spreadsheetId = process.env.DISCONNECTION_SHEET || process.env.GOOGLE_SHEET_ID

    if (!client_email || !private_key || !spreadsheetId) {
      throw new Error("Missing required environment variables (GOOGLE_SHEETS_CLIENT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY, or DISCONNECTION_SHEET)")
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email,
        private_key,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    })

    const sheets = google.sheets({ version: "v4", auth })

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: range,
    })

    const rows = response.data.values || []
    // Count non-empty rows in Column A
    // Ensure row exists and has content
    const count = rows.filter((row: any[]) => row && row[0] && String(row[0]).trim() !== "").length

    return NextResponse.json({ count })
  } catch (error) {
    console.error("Row count fetch failed:", error)
    return NextResponse.json({ count: 0 }, { status: 500 })
  }
}
