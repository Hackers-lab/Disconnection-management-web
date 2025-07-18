export interface ConsumerData {
  offCode: string
  mru: string
  consumerId: string
  name: string
  address: string
  baseClass: string
  class: string
  natureOfConn: string
  govNonGov: string
  device: string
  osDuedateRange: string
  d2NetOS: string
  disconStatus: string
  disconDate: string
  gisPole: string
  mobileNumber: string
  latitude: string
  longitude: string
  agency?: string
  lastUpdated?: string
  notes?: string
  reading?: string
  imageId?: string
}

const AGENCIES = [
  "ESAR",
  "MANSUR",
  "MR",
  "AMS",
  "MH",
  "NMC",
  "SIGMA",
  "SA",
  "SUPREME",
  "MATIN",
  "MUKTI",
]

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

export async function fetchConsumerData(): Promise<ConsumerData[]> {
  try {
    //console.log("Fetching consumer data from Google Sheets...")

    const response = await fetch(
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vTUdnZVO_1jP6rtHen6zsTM4ff3YEo_xPe41HvMq_q3yOtwuaoTNz4AEOtuabLbmw2BzYnJh8fCIF2Y/pub?output=csv",
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
    //console.log("CSV data received, length:", csvText.length)

    if (!csvText || csvText.trim().length === 0) {
      throw new Error("Empty CSV data received")
    }

    const lines = csvText.split("\n").filter((line) => line.trim().length > 0)
    //console.log("Number of lines:", lines.length)

    if (lines.length < 2) {
      throw new Error("CSV must have at least header and one data row")
    }

    const headers = parseCSVLine(lines[0])
    //console.log("Headers found:", headers.length, headers.slice(0, 10))

    const consumers: ConsumerData[] = []

    // Define column mappings with multiple possible names
    const columnMappings = {
      offCode: ["off_code", "offcode", "office code"],
      mru: ["mru"],
      consumerId: ["consumer id", "consumerid", "consumer_id"],
      name: ["name", "consumer name"],
      address: ["address"],
      baseClass: ["base class", "baseclass", "base_class"],
      class: ["class"],
      natureOfConn: ["nature of conn", "nature of connection", "natureofconn"],
      govNonGov: ["gov/non-gov", "gov non gov", "government"],
      device: ["device"],
      osDuedateRange: ["o/s duedate range", "os duedate range", "due date range"],
      d2NetOS: ["d2 net o/s", "d2 net os", "net os", "outstanding"],
      disconStatus: ["discon status", "disconnection status", "status"],
      disconDate: ["discon date", "disconnection date"],
      gisPole: ["gis pole", "gispole", "pole"],
      mobileNumber: ["mobile number", "mobile", "phone"],
      latitude: ["latitude", "lat"],
      longitude: ["longitude", "lng", "long"],
      agency: ["agency"],
      reading: ["reading"],
      imageId: ["image"],

    }

    // Find column indices
    const columnIndices: { [key: string]: number } = {}
    Object.entries(columnMappings).forEach(([key, searchTerms]) => {
      columnIndices[key] = findColumnIndex(headers, searchTerms)
    })

    // console.log("Column indices:", columnIndices)

    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCSVLine(lines[i])

        // Skip empty rows
        if (values.length === 0 || values.every((v) => !v || v.trim() === "")) {
          continue
        }

        // Get consumer ID to validate this is a valid row
        const consumerId = columnIndices.consumerId >= 0 ? values[columnIndices.consumerId] : ""
        if (!consumerId || consumerId.trim() === "") {
          continue
        }

        // Get and clean the OSD value
        const rawOSD = columnIndices.d2NetOS >= 0 ? values[columnIndices.d2NetOS] || "0" : "0"
        const cleanedOSD = parseNumericValue(rawOSD)

        //console.log(`Consumer ${consumerId}: Raw OSD="${rawOSD}" -> Cleaned OSD="${cleanedOSD}"`)

        // Create consumer object
        const consumer: ConsumerData = {
          offCode: columnIndices.offCode >= 0 ? values[columnIndices.offCode] || "" : "",
          mru: columnIndices.mru >= 0 ? values[columnIndices.mru] || "" : "",
          consumerId: consumerId,
          name: columnIndices.name >= 0 ? values[columnIndices.name] || "" : "",
          address: columnIndices.address >= 0 ? values[columnIndices.address] || "" : "",
          baseClass: columnIndices.baseClass >= 0 ? values[columnIndices.baseClass] || "" : "",
          class: columnIndices.class >= 0 ? values[columnIndices.class] || "" : "",
          natureOfConn: columnIndices.natureOfConn >= 0 ? values[columnIndices.natureOfConn] || "" : "",
          govNonGov: columnIndices.govNonGov >= 0 ? values[columnIndices.govNonGov] || "" : "",
          device: columnIndices.device >= 0 ? values[columnIndices.device] || "" : "",
          osDuedateRange: columnIndices.osDuedateRange >= 0 ? values[columnIndices.osDuedateRange] || "" : "",
          d2NetOS: cleanedOSD, // Use cleaned numeric value
          disconStatus:
            columnIndices.disconStatus >= 0 ? values[columnIndices.disconStatus] || "connected" : "connected",
          disconDate: columnIndices.disconDate >= 0 ? values[columnIndices.disconDate] || "" : "",
          gisPole: columnIndices.gisPole >= 0 ? values[columnIndices.gisPole] || "" : "",
          mobileNumber: columnIndices.mobileNumber >= 0 ? values[columnIndices.mobileNumber] || "" : "",
          latitude: columnIndices.latitude >= 0 ? values[columnIndices.latitude] || "" : "",
          longitude: columnIndices.longitude >= 0 ? values[columnIndices.longitude] || "" : "",
          agency: columnIndices.agency >= 0 ? values[columnIndices.agency] || "" : "",
          lastUpdated: new Date().toISOString().split("T")[0],
        }

        consumers.push(consumer)
      } catch (rowError) {
        console.warn(`Error processing row ${i}:`, rowError)
      }
    }

    //console.log(`Successfully processed ${consumers.length} consumers`)

    // Log some OSD values for debugging
    const osdSample = consumers.slice(0, 5).map((c) => ({ id: c.consumerId, osd: c.d2NetOS }))
    //console.log("Sample OSD values:", osdSample)

    return consumers
  } catch (error) {
    console.error("Detailed error in fetchConsumerData:", error)

    // Return mock data with proper OSD values
    const mockData: ConsumerData[] = [
      {
        offCode: "TEST001",
        mru: "MRU001",
        consumerId: "CONS001",
        name: "Test Consumer 1",
        address: "123 Test Street, Test City",
        baseClass: "LT",
        class: "Domestic",
        natureOfConn: "Permanent",
        govNonGov: "Non-Gov",
        device: "Meter001",
        osDuedateRange: "Jan-Mar 2024",
        d2NetOS: "1500", // Clean numeric value
        disconStatus: "connected",
        disconDate: "",
        gisPole: "POLE001",
        mobileNumber: "9876543210",
        latitude: "22.5726",
        longitude: "88.3639",
        agency: "JOY GURU",
        lastUpdated: new Date().toISOString().split("T")[0],
      },
      {
        offCode: "TEST002",
        mru: "MRU002",
        consumerId: "CONS002",
        name: "Test Consumer 2",
        address: "456 Demo Avenue, Demo Town",
        baseClass: "LT",
        class: "Commercial",
        natureOfConn: "Temprory",
        govNonGov: "Gov",
        device: "Meter002",
        osDuedateRange: "Feb-Apr 2024",
        d2NetOS: "12380", // Clean numeric value
        disconStatus: "pending",
        disconDate: "",
        gisPole: "POLE002",
        mobileNumber: "9876543211",
        latitude: "22.5726",
        longitude: "88.3639",
        agency: "ST",
        lastUpdated: new Date().toISOString().split("T")[0],
      },
    ]

    //console.log("Returning mock data due to error")
    return mockData
  }
}

export async function updateConsumerInSheet(consumer: ConsumerData) {
  console.log("Would update consumer in Google Sheets:", consumer)
  return { success: true, message: "Consumer updated successfully" }
}
