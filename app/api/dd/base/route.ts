import { NextResponse } from "next/server"
import { fetchDDData } from "@/lib/dd-service"

export async function GET() {
  const data = await fetchDDData()
  
  return NextResponse.json(data, {
    headers: {
      // CHANGE THIS: Disable aggressive caching
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "CDN-Cache-Control": "no-store",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  })
}
