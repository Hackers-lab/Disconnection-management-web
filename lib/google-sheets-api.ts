import { google } from "googleapis"
import { auth } from "./google-drive"
import type { ConsumerData } from "./google-sheets"

const sheets = google.sheets({ version: "v4", auth })

export async function updateConsumerInGoogleSheet(consumer: ConsumerData) {
  try {
    // Prioritize DISCONNECTION_SHEET for the consumer list, fallback to generic USERS_SHEET
    const spreadsheetId = process.env.DISCONNECTION_SHEET?.trim() || process.env.USERS_SHEET?.trim()
    if (!spreadsheetId) throw new Error("DISCONNECTION_SHEET (or USERS_SHEET) not set in .env.local")
    
    if (spreadsheetId.includes("google.com") || spreadsheetId.includes("/")) {
      throw new Error("Sheet ID appears to be a URL. Please use only the ID string (e.g., '1BxiMVs0...').")
    }

    const sheetName = process.env.GOOGLE_SHEET_NAME || "Sheet1"
    // Use single quotes to handle sheet names with spaces
    const headerRange = `'${sheetName}'!1:1`

    // 1. Fetch only headers first to map columns (much faster than fetching whole sheet)
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: headerRange,
    }).catch((error) => {
      if (error.code === 404) {
        throw new Error(
          `Spreadsheet not found (404).\n` +
          `ID used: "${spreadsheetId}"\n` +
          `Possible causes:\n` +
          `1. The authenticated user (OAuth Personal Email) does not have permission to view this sheet. Share the sheet with your Gmail.\n` +
          `2. The ID is incorrect.`
        )
      }
      if (error.code === 400) {
        throw new Error(`Invalid Sheet Name or Range. Check GOOGLE_SHEET_NAME (default: Sheet1). Error: ${error.message}`)
      }
      throw error
    })

    const headers = headerResponse.data.values?.[0]
    if (!headers || headers.length === 0) throw new Error("Sheet headers not found")
    
    // Helper to find column index loosely
    const getColIndex = (name: string) => headers.findIndex((h: string) => 
      h.toLowerCase().replace(/[^a-z0-9]/g, "") === name.toLowerCase().replace(/[^a-z0-9]/g, "")
    )

    const idColIndex = getColIndex("consumerId")
    if (idColIndex === -1) throw new Error("Consumer ID column not found")

    // Helper to convert 0-based index to A1 notation (e.g., 0 -> A, 26 -> AA)
    const getColumnLetter = (colIndex: number) => {
      let letter = '';
      let temp = colIndex;
      while (temp >= 0) {
        letter = String.fromCharCode((temp % 26) + 65) + letter;
        temp = Math.floor(temp / 26) - 1;
      }
      return letter;
    }

    const idColLetter = getColumnLetter(idColIndex)
    
    // 2. Fetch ONLY the Consumer ID column to find the row
    const idColumnResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!${idColLetter}:${idColLetter}`,
    })

    const idRows = idColumnResponse.data.values
    if (!idRows) throw new Error("No data in Consumer ID column")

    // Find the row index (0-based in array, 1-based in Sheet)
    const rowIndex = idRows.findIndex((row: string[]) => row[0] === consumer.consumerId)
    if (rowIndex === -1) throw new Error(`Consumer ID ${consumer.consumerId} not found`)

    // 3. Prepare the updates
    // Map of ConsumerData keys to possible Sheet Header names (arrays allow for variations)
    const fieldMap: Partial<Record<keyof ConsumerData, string[]>> = {
      disconStatus: ["disconStatus", "disconnectionStatus", "status"],
      disconDate: ["disconDate", "disconnectionDate"],
      reading: ["reading", "meterReading"],
      notes: ["notes", "remarks", "comments"],
      imageUrl: ["imageUrl", "image", "photo", "url", "link"],
      lastUpdated: ["lastUpdated", "updatedAt"],
      agency: ["agency"],
      latitude: ["latitude", "lat"],
      longitude: ["longitude", "lng", "long"]
    }

    // We will perform batch updates for specific cells to avoid overwriting other columns
    // or fetching the whole row first.
    const dataToUpdate: { range: string; values: string[][] }[] = []

    Object.entries(fieldMap).forEach(([key, headerNames]) => {
      let colIndex = -1
      for (const name of headerNames) {
        colIndex = getColIndex(name)
        if (colIndex !== -1) break
      }

      const val = consumer[key as keyof ConsumerData]
      
      if (colIndex !== -1 && val !== undefined && val !== null) {
        const colLetter = getColumnLetter(colIndex)
        dataToUpdate.push({
          range: `'${sheetName}'!${colLetter}${rowIndex + 1}`,
          values: [[String(val)]]
        })
      }
    })

    // 4. Execute Batch Update
    if (dataToUpdate.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: dataToUpdate
        }
      })
    }

    return { success: true }
  } catch (error) {
    console.error("Sheet update error:", error)
    throw error
  }
}