export interface ConsumerData {
  _syncStatus: string
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
  imageUrl?: string
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

// lib/google-sheets.ts
export async function getAgencyLastUpdates(): Promise<
  { name: string; lastUpdate: string; lastUpdateCount: number }[]
> {
  const consumers = await fetchConsumerData();

  interface AgencyInfo {
    latest: Date;
    count: number;
  }

  const agencyMap = new Map<string, AgencyInfo>();

  const dateFormats = [
    {
      pattern: /^(\d{2})-(\d{2})-(\d{4})$/,
      handler: (d: RegExpMatchArray) => new Date(`${d[3]}-${d[2]}-${d[1]}`), // DD-MM-YYYY
    },
    {
      pattern: /^(\d{2})-(\d{2})-(\d{4})$/,
      handler: (d: RegExpMatchArray) => new Date(`${d[3]}-${d[1]}-${d[2]}`), // MM-DD-YYYY
    },
    {
      pattern: /^(\d{4})-(\d{2})-(\d{2})$/,
      handler: (d: RegExpMatchArray) => new Date(`${d[1]}-${d[2]}-${d[3]}`), // YYYY-MM-DD
    },
  ];

  consumers.forEach((consumer) => {
    if (!consumer.agency || !consumer.disconDate) return;

    // Parse the date
    let parsedDate: Date | null = null;
    for (const format of dateFormats) {
      const match = consumer.disconDate.match(format.pattern);
      if (match) {
        parsedDate = format.handler(match);
        break;
      }
    }
    if (!parsedDate || isNaN(parsedDate.getTime())) return;

    const info = agencyMap.get(consumer.agency);

    if (!info) {
      // first record for this agency
      agencyMap.set(consumer.agency, { latest: parsedDate, count: 1 });
    } else {
      if (parsedDate > info.latest) {
        // found a newer date → reset count
        agencyMap.set(consumer.agency, { latest: parsedDate, count: 1 });
      } else if (
        parsedDate.getFullYear() === info.latest.getFullYear() &&
        parsedDate.getMonth() === info.latest.getMonth() &&
        parsedDate.getDate() === info.latest.getDate()
      ) {
        // same as latest date → increment count
        info.count++;
        agencyMap.set(consumer.agency, info);
      }
      // if older → ignore
    }
  });

  // Format output
  return Array.from(agencyMap.entries())
    .map(([name, info]) => ({
      name,
      lastUpdate: `${String(info.latest.getDate()).padStart(2, "0")}-${String(
        info.latest.getMonth() + 1
      ).padStart(2, "0")}-${info.latest.getFullYear()}`,
      lastUpdateCount: info.count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}



export async function fetchConsumerData(): Promise<ConsumerData[]> {
  try {
    const csvUrl = process.env.DISCONNECTION_CSV
    if (!csvUrl) throw new Error("DISCONNECTION_CSV env variable not set")

    const response = await fetch(
      csvUrl,
      {
        // OPTIMIZATION: Cache the CSV from Google for 60 seconds.
        // This reduces the Patch API time from ~3.6s to ~100ms.
        next: { revalidate: 60 },
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; NextJS-App/1.0)",
        },
      } as any, // Cast to any to allow 'next' property if types are strict
    )

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const csvText = await response.text()

    if (!csvText || csvText.trim().length === 0) {
      throw new Error("Empty CSV data received")
    }

    const lines = csvText.split("\n").filter((line) => line.trim().length > 0)

    if (lines.length < 2) {
      throw new Error("CSV must have at least header and one data row")
    }

    const headers = parseCSVLine(lines[0])

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
      imageUrl: ["image", "photo", "link", "url", "imageurl", "imagelink"],
      notes: ["notes"],
      lastUpdated: ["last updated", "last_updated", "timestamp", "modified", "updated_at"],

    }

    // Find column indices
    const columnIndices: { [key: string]: number } = {}
    Object.entries(columnMappings).forEach(([key, searchTerms]) => {
      columnIndices[key] = findColumnIndex(headers, searchTerms)
    })

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

        // Determine Last Updated Date
        // 1. Try explicit 'Last Updated' column
        let lastUpdatedVal = columnIndices.lastUpdated >= 0 ? values[columnIndices.lastUpdated] : ""
        
        // 2. If missing, fallback to 'Disconnection Date'
        if (!lastUpdatedVal || lastUpdatedVal.trim() === "") {
           lastUpdatedVal = columnIndices.disconDate >= 0 ? values[columnIndices.disconDate] || "" : ""
        }

        // 3. Normalize date to YYYY-MM-DD for comparison
        // If the CSV date is DD-MM-YYYY, we need to flip it. 
        // Assuming standard ISO or keeping as string if format matches.
        if (lastUpdatedVal && lastUpdatedVal.match(/^\d{2}-\d{2}-\d{4}$/)) {
           const [d, m, y] = lastUpdatedVal.split("-");
           lastUpdatedVal = `${y}-${m}-${d}`;
        }

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
          lastUpdated: lastUpdatedVal, 
          notes: columnIndices.notes >= 0 ? values[columnIndices.notes] || "" : "",
          reading: columnIndices.reading >= 0 ? values[columnIndices.reading] || "" : "",
          imageUrl: columnIndices.imageUrl >= 0 ? values[columnIndices.imageUrl] || "" : "",
        }

        consumers.push(consumer)
      } catch (rowError) {
        console.warn(`Error processing row ${i}:`, rowError)
      }
    }

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
