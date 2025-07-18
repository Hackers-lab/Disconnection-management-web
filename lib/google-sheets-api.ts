"use server"

import { google } from "googleapis"
import type { ConsumerData } from "./google-sheets"

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

async function getGoogleSheetsClient() {
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n")
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL

  if (!privateKey || !clientEmail) {
    throw new Error("Google Sheets credentials not configured")
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      private_key: privateKey,
      client_email: clientEmail,
    },
    scopes: SCOPES,
  })

  return google.sheets({ version: "v4", auth })
}

export async function updateConsumerInGoogleSheet(consumer: ConsumerData) {
  try {
    const sheets = await getGoogleSheetsClient()
    const spreadsheetId = process.env.GOOGLE_SHEET_ID

    if (!spreadsheetId) {
      throw new Error("Google Sheet ID not configured")
    }

    // First, find the row with the matching Consumer ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:Z", // Adjust range as needed
    })

    const rows = response.data.values || []
    const headers = rows[0] || []

    // Find the row index for this consumer
    const consumerRowIndex = rows.findIndex(
      (row, index) => index > 0 && row[headers.indexOf("Consumer Id")] === consumer.consumerId,
    )

    if (consumerRowIndex === -1) {
      throw new Error("Consumer not found in sheet")
    }

    // Prepare the update data
    const updateData = [...rows[consumerRowIndex]]

    // Update specific columns
    const columnUpdates = {
      "Discon Status": consumer.disconStatus,
      "Discon Date": consumer.disconDate,
      "Mobile Number": consumer.mobileNumber,
      "D2 Net O/S": consumer.d2NetOS,
      "Notes": consumer.notes || "",
      "Reading": consumer.reading || "",
      "Agency": consumer.agency,
      "Image": consumer.imageId || "", // Assuming imageId is the identifier for the uploaded image
    }

    Object.entries(columnUpdates).forEach(([columnName, value]) => {
      const columnIndex = headers.indexOf(columnName)
      if (columnIndex !== -1) {
        updateData[columnIndex] = value
      }
    })

    // Update the row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Sheet1!A${consumerRowIndex + 1}:Z${consumerRowIndex + 1}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [updateData],
      },
    })

    return { success: true, message: "Consumer updated in Google Sheets" }
  } catch (error) {
    console.error("Error updating Google Sheets:", error)
    throw new Error("Failed to update Google Sheets")
  }
}
