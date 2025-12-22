import { google } from "googleapis"
import { Readable } from "stream"

// Shared Auth client for Drive and Sheets
const client_email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL
const private_key = process.env.GOOGLE_SHEETS_PRIVATE_KEY
const client_id = process.env.GOOGLE_CLIENT_ID
const client_secret = process.env.GOOGLE_CLIENT_SECRET
const refresh_token = process.env.GOOGLE_REFRESH_TOKEN

export const auth =
  client_id && client_secret && refresh_token
    ? (() => {
        const oauth2Client = new google.auth.OAuth2(client_id, client_secret)
        oauth2Client.setCredentials({ refresh_token })
        return oauth2Client
      })()
    : new google.auth.GoogleAuth({
        credentials: {
          client_email,
          private_key: private_key?.replace(/\\n/g, "\n"),
        },
        scopes: [
          "https://www.googleapis.com/auth/drive",
          "https://www.googleapis.com/auth/spreadsheets",
        ],
      })


const drive = google.drive({ version: "v3", auth })

export async function uploadImageToDrive(file: File, consumerId: string): Promise<string> {
  try {
    const hasServiceAccount = client_email && private_key
    const hasOAuth = client_id && client_secret && refresh_token

    if (!hasServiceAccount && !hasOAuth) {
      throw new Error(
        "Missing Google credentials. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env.local",
      )
    }

    // Convert File to Buffer/Stream
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const stream = Readable.from(buffer)

    const fileName = `${consumerId}_${Date.now()}.jpg`
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
    
    if (!folderId) {
      throw new Error("GOOGLE_DRIVE_FOLDER_ID is not set in .env.local")
    }

    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    }

    const media = {
      mimeType: file.type,
      body: stream,
    }

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, webViewLink",
      supportsAllDrives: true,
    })

    const fileId = response.data.id
    if (!fileId) throw new Error("No file ID returned from Drive")

    // Make the file publicly readable so it can be displayed in the app
    await drive.permissions.create({
      fileId: fileId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    })

    // Return a direct view URL instead of the webViewLink (which is a HTML page)
    return `https://drive.google.com/uc?export=view&id=${fileId}`
  } catch (error) {
    console.error("Drive upload failed:", error)
    throw error
  }
}