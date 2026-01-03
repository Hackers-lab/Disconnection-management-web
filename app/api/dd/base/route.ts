import { NextResponse } from "next/server"
import { fetchDDData } from "@/lib/dd-service"

export async function GET() {
  const data = await fetchDDData()
  
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=300",
      "CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=300",
      "Vercel-CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=300",
    },
  })
}
