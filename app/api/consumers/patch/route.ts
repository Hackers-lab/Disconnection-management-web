// c:\Users\Pc\Documents\GitHub\Disconnection-management-web\app\api\consumers\patch\route.ts
import { NextResponse } from "next/server"
import { fetchConsumerData } from "@/lib/google-sheets"

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await fetchConsumerData()

    // Filter for rows updated today (YYYY-MM-DD)
    const today = new Date().toISOString().split("T")[0]
    const patchData = data.filter((consumer) => consumer.lastUpdated?.startsWith(today))

    return NextResponse.json(patchData, {
      status: 200,
      headers: {
        // No caching for patch data to ensure real-time updates
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    })
  } catch (error) {
    console.error("💥 API /consumers/patch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch patch data" },
      { status: 500 }
    )
  }
}
