export interface DeemedVisitData {
  consumerId: string
  name: string
  address: string
  mobileNumber: string
  totalArrears: string // Mapped from 'Outstanding' or 'd2NetOS'
  disconStatus: string
  disconDate?: string
  remarks?: string
  visitDate?: string
  reading?: string
  agency?: string
  lastUpdated?: string
  // Additional fields for filtering/display matching ConsumerData
  offCode?: string
  mru?: string
  baseClass?: string
  device?: string
  osDuedateRange?: string
  imageUrl?: string
  _syncStatus?: 'syncing' | 'error'
}

export async function fetchDDData(): Promise<DeemedVisitData[]> {
  const url = process.env.DD_CSV
  if (!url) {
    console.warn("DD_CSV environment variable is not set")
    return []
  }

  try {
    const res = await fetch(url, { next: { revalidate: 10 } })
    if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.statusText}`)
    
    const text = await res.text()
    const rows = text.split(/\r?\n/).filter(row => row.trim() !== "")
    
    if (rows.length < 2) return []

    // Helper to clean and parse numeric values (Cloned from google-sheets.ts)
    const parseNumericValue = (value: string): string => {
      if (!value || typeof value !== "string") return "0"
      const cleaned = value.replace(/[,\s₹$]/g, "").replace(/[^\d.-]/g, "")
      const parsed = Number.parseFloat(cleaned)
      return isNaN(parsed) ? "0" : parsed.toString()
    }

    // Helper to parse CSV line handling quotes (Cloned from google-sheets.ts)
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = []
      let current = ""
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]

        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"'
            i++ 
          } else {
            inQuotes = !inQuotes
          }
        } else if (char === "," && !inQuotes) {
          result.push(current.trim())
          current = ""
        } else {
          current += char
        }
      }
      result.push(current.trim())
      return result
    }

    const headers = parseCSVLine(rows[0]).map(h => h.replace(/^"|"$/g, "").trim().toLowerCase())
    
    return rows.slice(1).map(row => {
      const values = parseCSVLine(row).map(v => v.replace(/^"|"$/g, "").trim())
      
      const data: any = {}
      
      headers.forEach((header, index) => {
        const value = values[index] || ""
        
        // Strict mapping based on provided CSV headers
        if (header === "consumer id" || header === "consumerid") data.consumerId = value
        else if (header === "name") data.name = value
        else if (header === "address") data.address = value
        else if (header === "mobile number" || header === "mobile") data.mobileNumber = value
        else if (header === "d2 net o/s" || header === "outstanding" || header === "d2netos") data.totalArrears = parseNumericValue(value)
        else if (header === "discon status" || header === "status") data.disconStatus = value
        else if (header === "discon date" || header === "date") data.disconDate = value
        else if (header === "remarks" || header === "notes") data.remarks = value
        else if (header === "visit date" || header === "visitdate") data.visitDate = value
        else if (header === "reading" || header === "meter reading" || header === "meterreading") data.reading = value
        else if (header === "agency") data.agency = value
        else if (header === "mru") data.mru = value
        else if (header === "base class" || header === "class") data.baseClass = value
        else if (header === "device") data.device = value
        else if (header === "o/s duedate range" || header === "due date") data.osDuedateRange = value
        else if (header === "image" || header === "imageurl") data.imageUrl = value
        else if (header === "off_code" || header === "offcode") data.offCode = value
        else if (header === "last updated") data.lastUpdated = value
      })

      // Defaults
      if (!data.disconStatus) data.disconStatus = "Deemed Disconnected"
      if (!data.totalArrears) data.totalArrears = "0"

      return data as DeemedVisitData
    })
  } catch (error) {
    console.error("Error fetching Deemed Visit data:", error)
    return []
  }
}

export async function getDDUpdates() {
  const allData = await fetchDDData()
  const today = new Date().toISOString().split("T")[0]
  // Return rows updated today (Delta Sync logic)
  return allData.filter(d => d.lastUpdated && d.lastUpdated.includes(today))
}