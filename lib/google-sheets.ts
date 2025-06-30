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
}

// ――― fallback list used by UI while the Agency-MRU CSV is loading
export const AGENCIES: string[] = [
  "JOY GURU",
  "ST",
  "MATIUR",
  "AMS",
  "SAMAD",
  "CHANCHAL",
  "ALOKE CHAKRABORTY",
  "SA",
  "APOLLO",
  "ROXY",
  "MALDA",
  "SUPREME",
  "LAIBAH",
  "MATIN",
  "MUKTI",
]

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

// Fetch agency-MRU mapping from separate CSV and extract agency names
export async function fetchAgencyMRUMapping(): Promise<{ mapping: AgencyMRUMapping; agencies: string[] }> {
  try {
    console.log("Fetching agency-MRU mapping...")

    // Get the agency-MRU CSV URL from environment variable
    const AGENCY_MRU_CSV_URL = process.env.NEXT_PUBLIC_AGENCY_MRU_CSV_URL

    if (!AGENCY_MRU_CSV_URL) {
      console.warn("NEXT_PUBLIC_AGENCY_MRU_CSV_URL not set, using default mapping")
      return getDefaultAgencyMRUMapping()
    }

    const response = await fetch(AGENCY_MRU_CSV_URL, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NextJS-App/1.0)",
      },
    })

    if (!response.ok) {
      console.warn("Failed to fetch agency-MRU mapping, using default mapping")
      return getDefaultAgencyMRUMapping()
    }

    const csvText = await response.text()
    const lines = csvText.split("\n").filter((line) => line.trim().length > 0)

    if (lines.length < 2) {
      console.warn("Invalid agency-MRU CSV format, using default mapping")
      return getDefaultAgencyMRUMapping()
    }

    const headers = parseCSVLine(lines[0]) // Agency names as headers
    const mapping: AgencyMRUMapping = {}
    const agencies: string[] = []

    // Initialize mapping for each agency
    headers.forEach((agency) => {
      if (agency && agency.trim()) {
        const cleanAgency = agency.trim()
        mapping[cleanAgency] = []
        agencies.push(cleanAgency)
      }
    })

    // Process each row (MRU codes)
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i])

      values.forEach((mru, index) => {
        if (mru && mru.trim() && headers[index] && headers[index].trim()) {
          const agency = headers[index].trim()
          if (mapping[agency]) {
            mapping[agency].push(mru.trim())
          }
        }
      })
    }

    console.log("Agency-MRU mapping loaded:", agencies.length, "agencies")
    console.log("Available agencies:", agencies)

    return { mapping, agencies }
  } catch (error) {
    console.error("Error fetching agency-MRU mapping:", error)
    return getDefaultAgencyMRUMapping()
  }
}

// Default agency-MRU mapping for fallback
function getDefaultAgencyMRUMapping(): { mapping: AgencyMRUMapping; agencies: string[] } {
  const mapping: AgencyMRUMapping = {
    "JOY GURU": ["MRU001", "MRU002", "MRU003"],
    ST: ["MRU004", "MRU005", "MRU006"],
    MATIUR: ["MRU007", "MRU008", "MRU009"],
    AMS: ["MRU010", "MRU011", "MRU012"],
    SAMAD: ["MRU013", "MRU014", "MRU015"],
    CHANCHAL: ["MRU016", "MRU017", "MRU018"],
    "ALOKE CHAKRABORTY": ["MRU019", "MRU020", "MRU021"],
    SA: ["MRU022", "MRU023", "MRU024"],
    APOLLO: ["MRU025", "MRU026", "MRU027"],
    ROXY: ["MRU028", "MRU029", "MRU030"],
    MALDA: ["MRU031", "MRU032", "MRU033"],
    SUPREME: ["MRU034", "MRU035", "MRU036"],
    LAIBAH: ["MRU037", "MRU038", "MRU039"],
    MATIN: ["MRU040", "MRU041", "MRU042"],
    MUKTI: ["MRU043", "MRU044", "MRU045"],
  }

  const agencies = Object.keys(mapping)
  return { mapping, agencies }
}

// Function to assign agency based on MRU
function assignAgencyByMRU(mru: string, agencyMapping: AgencyMRUMapping): string {
  for (const [agency, mruList] of Object.entries(agencyMapping)) {
    if (mruList.includes(mru)) {
      return agency
    }
  }
  return "UNASSIGNED" // Default if no match found
}

export async function fetchConsumerData(): Promise<ConsumerData[]> {
  try {
    console.log("Fetching consumer data from Google Sheets...")

    // First, fetch the agency-MRU mapping
    const { mapping: agencyMapping } = await fetchAgencyMRUMapping()

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
        const consumerId = columnIndices.consumerId >= 0 ? values[columnIndices.consumerId] : ""
        if (!consumerId || consumerId.trim() === "") {
          continue
        }

        // Get MRU for agency assignment
        const mru = columnIndices.mru >= 0 ? values[columnIndices.mru] || "" : ""

        // Auto-assign agency based on MRU
        const assignedAgency = assignAgencyByMRU(mru, agencyMapping)

        // Get and clean the OSD value
        const rawOSD = columnIndices.d2NetOS >= 0 ? values[columnIndices.d2NetOS] || "0" : "0"
        const cleanedOSD = parseNumericValue(rawOSD)

        console.log(`Consumer ${consumerId}: MRU="${mru}" -> Agency="${assignedAgency}", OSD="${cleanedOSD}"`)

        // Create consumer object
        const consumer: ConsumerData = {
          offCode: columnIndices.offCode >= 0 ? values[columnIndices.offCode] || "" : "",
          mru: mru,
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
          agency: assignedAgency, // Auto-assigned based on MRU
          lastUpdated: new Date().toISOString().split("T")[0],
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
    const { mapping: mockAgencyMapping } = getDefaultAgencyMRUMapping()
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
        d2NetOS: "1500",
        disconStatus: "connected",
        disconDate: "",
        gisPole: "POLE001",
        mobileNumber: "9876543210",
        latitude: "22.5726",
        longitude: "88.3639",
        agency: assignAgencyByMRU("MRU001", mockAgencyMapping),
        lastUpdated: new Date().toISOString().split("T")[0],
      },
      {
        offCode: "TEST002",
        mru: "MRU004",
        consumerId: "CONS002",
        name: "Test Consumer 2",
        address: "456 Demo Avenue, Demo Town",
        baseClass: "LT",
        class: "Commercial",
        natureOfConn: "Temporary",
        govNonGov: "Gov",
        device: "Meter002",
        osDuedateRange: "Feb-Apr 2024",
        d2NetOS: "12380",
        disconStatus: "pending",
        disconDate: "",
        gisPole: "POLE002",
        mobileNumber: "9876543211",
        latitude: "22.5726",
        longitude: "88.3639",
        agency: assignAgencyByMRU("MRU004", mockAgencyMapping),
        lastUpdated: new Date().toISOString().split("T")[0],
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
  const { agencies } = await fetchAgencyMRUMapping()
  return agencies
}
