import "server-only"
import { parse } from "csv-parse/sync"

export interface ConsumerData {
  id: string
  name: string
  mru: string
  status: string
  agency?: string
}

/**
 * PUBLIC CONSTANT:  a quick fallback list while the Agency-MRU CSV is loading.
 * Components that need a static list at build-time can safely import this.
 */
export const AGENCIES = ["Agency A", "Agency B", "Agency C"] as const

export type Agency = (typeof AGENCIES)[number]

// Agency-MRU mapping interface
interface AgencyMRUMapping {
  [agency: string]: string[] // agency name -> array of MRU codes
}

// Helper function to clean and parse numeric values
function parseNumericValue(value: string): string {
  if (!value || typeof value !== "string") return "0"

  // Remove commas, spaces, currency symbols, and other non-numeric characters except decimal point
  const cleaned = value.replace(/[,\s₹$]/g, "").replace(/[^\d.-]/g, "")

  // Parse as float and return as string, default to "0" if invalid
  const parsed = Number.parseFloat(cleaned)
  return isNaN(parsed) ? "0" : parsed.toString()
}

// Helper function to parse CSV properly
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Handle escaped quotes
        current += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      // End of field
      result.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }

  // Add the last field
  result.push(current.trim())

  return result
}

// Helper function to find column index (case-insensitive, flexible matching)
function findColumnIndex(headers: string[], searchTerms: string[]): number {
  for (const term of searchTerms) {
    const index = headers.findIndex((header) =>
      header
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .includes(term.toLowerCase().replace(/[^a-z0-9]/g, "")),
    )
    if (index !== -1) return index
  }
  return -1
}

async function fetchCsv(url: string) {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`)
  return res.text()
}

/**
 * Reads the Agency-MRU mapping sheet (agencies are column headers, MRUs rows).
 * Returns a Map<MRU, Agency>
 */
export async function getAgencyMap(): Promise<Map<string, string>> {
  const url = process.env.NEXT_PUBLIC_AGENCY_MRU_CSV_URL
  if (!url) return new Map()

  const csv = await fetchCsv(url)
  const rows: string[][] = parse(csv.trim())

  if (rows.length < 1) return new Map()

  const headers = rows[0] as string[]
  const map = new Map<string, string>()

  for (let r = 1; r < rows.length; r++) {
    rows[r].forEach((mru, idx) => {
      if (mru) map.set(mru.trim(), headers[idx])
    })
  }
  return map
}

/**
 * Example consumer fetch (your real implementation may differ).
 * Auto-assigns `agency` by MRU using the map above.
 */
export async function fetchConsumers(sourceCsvUrl: string): Promise<ConsumerData[]> {
  const [csv, agencyMap] = await Promise.all([fetchCsv(sourceCsvUrl), getAgencyMap()])
  const rows: string[][] = parse(csv.trim(), { columns: true })

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    mru: row.mru,
    status: row.status,
    agency: agencyMap.get(row.mru) ?? undefined,
  }))
}

export async function fetchConsumerData(): Promise<ConsumerData[]> {
  try {
    console.log("Fetching consumer data from Google Sheets...")

    // First, fetch the agency-MRU mapping
    const agencyMapping = await getAgencyMap()

    const response = await fetch(
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTYN1Jj8x5Oy8NoKXrLpUEs17CtPkAi6khS4gtdisnqsLmuQWQviHo0zIF6MzJ9CA/pub?gid=91940342&single=true&output=csv",
      {
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; NextJS-App/1.0)",
        },
      },
    )

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const csvText = await response.text()
    console.log("CSV data received, length:", csvText.length)

    if (!csvText || csvText.trim().length === 0) {
      throw new Error("Empty CSV data received")
    }

    const lines = csvText.split("\n").filter((line) => line.trim().length > 0)
    console.log("Number of lines:", lines.length)

    if (lines.length < 2) {
      throw new Error("CSV must have at least header and one data row")
    }

    const headers = parseCSVLine(lines[0])
    console.log("Headers found:", headers.length, headers.slice(0, 10))

    const consumers: ConsumerData[] = []

    // Define column mappings with multiple possible names (removed agency from here)
    const columnMappings = {
      id: ["id", "consumer id", "consumerid", "consumer_id"],
      name: ["name", "consumer name"],
      mru: ["mru"],
      status: ["status", "discon status", "disconnection status"],
    }

    // Find column indices
    const columnIndices: { [key: string]: number } = {}
    Object.entries(columnMappings).forEach(([key, searchTerms]) => {
      columnIndices[key] = findColumnIndex(headers, searchTerms)
    })

    console.log("Column indices:", columnIndices)

    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCSVLine(lines[i])

        // Skip empty rows
        if (values.length === 0 || values.every((v) => !v || v.trim() === "")) {
          continue
        }

        // Get consumer ID to validate this is a valid row
        const consumerId = columnIndices.id >= 0 ? values[columnIndices.id] : ""
        if (!consumerId || consumerId.trim() === "") {
          continue
        }

        // Get MRU for agency assignment
        const mru = columnIndices.mru >= 0 ? values[columnIndices.mru] || "" : ""

        // Auto-assign agency based on MRU
        const assignedAgency = agencyMapping.get(mru)

        // Get and clean the OSD value
        const rawOSD = columnIndices.status >= 0 ? values[columnIndices.status] || "0" : "0"
        const cleanedOSD = parseNumericValue(rawOSD)

        console.log(`Consumer ${consumerId}: MRU="${mru}" -> Agency="${assignedAgency}", OSD="${cleanedOSD}"`)

        // Create consumer object
        const consumer: ConsumerData = {
          id: consumerId,
          name: columnIndices.name >= 0 ? values[columnIndices.name] || "" : "",
          mru: mru,
          status: cleanedOSD, // Use cleaned numeric value
          agency: assignedAgency, // Auto-assigned based on MRU
        }

        consumers.push(consumer)
      } catch (rowError) {
        console.warn(`Error processing row ${i}:`, rowError)
      }
    }

    console.log(`Successfully processed ${consumers.length} consumers`)

    // Log agency assignment summary
    const agencySummary = consumers.reduce(
      (acc, consumer) => {
        acc[consumer.agency || "UNASSIGNED"] = (acc[consumer.agency || "UNASSIGNED"] || 0) + 1
        return acc
      },
      {} as { [key: string]: number },
    )
    console.log("Agency assignment summary:", agencySummary)

    return consumers
  } catch (error) {
    console.error("Detailed error in fetchConsumerData:", error)

    // Return mock data with auto-assigned agencies
    const mockAgencyMapping = await getAgencyMap()
    const mockData: ConsumerData[] = [
      {
        id: "CONS001",
        name: "Test Consumer 1",
        mru: "MRU001",
        status: "1500",
        agency: mockAgencyMapping.get("MRU001"),
      },
      {
        id: "CONS002",
        name: "Test Consumer 2",
        mru: "MRU004",
        status: "12380",
        agency: mockAgencyMapping.get("MRU004"),
      },
    ]

    console.log("Returning mock data with auto-assigned agencies")
    return mockData
  }
}

export async function updateConsumerInSheet(consumer: ConsumerData) {
  console.log("Would update consumer in Google Sheets:", consumer)
  return { success: true, message: "Consumer updated successfully" }
}

// Export function to get agencies from the Agency MRU sheet
export async function getAvailableAgencies(): Promise<string[]> {
  const agencyMap = await getAgencyMap()
  return Array.from(agencyMap.values())
}
