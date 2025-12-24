import { NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

export async function GET() {
  const sheetId = process.env.DISCONNECTION_SHEET?.trim()

  if (!sheetId) {
    return NextResponse.json(
      { error: "Configuration Error: DISCONNECTION_SHEET environment variable is not set." },
      { status: 500 }
    )
  }

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
  return NextResponse.redirect(url)
}
