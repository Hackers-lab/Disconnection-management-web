// app/api/sheets/route.ts
import { google } from "googleapis";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { sheetName, data, headers } = await request.json();

    if (!sheetName || !data) {
      return NextResponse.json(
        { error: "Missing sheetName or data" },
        { status: 400 }
      );
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    
    const values = headers ? [headers, ...data] : data;

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.LIST_SHEET_ID,
      range: `${sheetName}!A:Z`,
      valueInputOption: "RAW",
      requestBody: { values },
    });

    return NextResponse.json({ success: true, data: response.data });
    
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload data" },
      { status: 500 }
    );
  }
}

// Add this to prevent GET requests
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}