// c:\Users\Pc\Documents\GitHub\Disconnection-management-web\app\api\system\row-count\route.ts
import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') || 'consumer'

    // Fetch Column C for consumer ID
    let range = type === 'dd' ? "DD!C:C" : "Sheet1!C:C";

    const client_email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const private_key = (process.env.GOOGLE_SHEETS_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, "\n")
    const spreadsheetId = process.env.DISCONNECTION_SHEET || process.env.GOOGLE_SHEET_ID

    if (!client_email || !private_key || !spreadsheetId) {
      throw new Error("Missing required environment variables for Google Sheets API")
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
    
    // Filter for non-empty rows first to ensure consistency
    const nonEmptyRows = rows.filter((row: any[]) => 
      row && row[0] && String(row[0]).trim() !== ""
    );

    // Count is the length of the filtered array
    const count = nonEmptyRows.length;
    
    // Generate MD5 hash of only the non-empty data for stable hashing
    const dataString = JSON.stringify(nonEmptyRows);
    const hash = crypto.createHash('md5').update(dataString).digest('hex');

    return NextResponse.json({ count, version: hash })
  } catch (error) {
    console.error(`API Error: Failed to fetch row count or generate hash for '${(request.nextUrl.searchParams.get('type') || 'consumer')}':`, error)
    return NextResponse.json({ count: 0, version: null }, { status: 500 })
  }
}
