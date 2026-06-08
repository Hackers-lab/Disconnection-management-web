import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getConsumerCountAndVersion } from "@/lib/google-sheets";

const SERVER_CACHE_TTL_MS = 20_000
const serverCache = new Map<string, { data: { count: number; version: string | null }; timestamp: number }>()

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') || 'consumer'

    // Consumer counts reuse the shared, cross-instance cache of parsed consumer
    // data — no second Sheets fetch and no full-JSON MD5. The version hashes
    // only the consumer-ID set (same semantics as the old column-C hash).
    if (type === 'consumer') {
      const data = await getConsumerCountAndVersion()
      return NextResponse.json(data, {
        headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" },
      })
    }

    const cached = serverCache.get(type)
    if (cached && Date.now() - cached.timestamp < SERVER_CACHE_TTL_MS) {
      return NextResponse.json(cached.data, {
        headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" },
      })
    }

    // Fetch Column C for consumer ID (DD sheet)
    let range = "DD!C:C";

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

    const responseData = { count, version: hash }
    serverCache.set(type, { data: responseData, timestamp: Date.now() })

    return NextResponse.json(responseData, {
      headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60" },
    })
  } catch (error) {
    console.error(`API Error: Failed to fetch row count or generate hash for '${(request.nextUrl.searchParams.get('type') || 'consumer')}':`, error)
    return NextResponse.json({ count: 0, version: null }, { status: 500 })
  }
}
