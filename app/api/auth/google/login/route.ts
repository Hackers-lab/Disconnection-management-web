import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { google } from "googleapis"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 401 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: "Google OAuth is not configured on the server. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI." },
      { status: 500 }
    )
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)

  // Generate the consent URL requesting offline access to get the refresh token
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
    state: session.cccCode, // State contains cccCode to prevent CSRF and identify tenant
  })

  return NextResponse.redirect(url)
}
