// c:\Users\Pc\Documents\GitHub\Disconnection-management-web\app\api\consumers\base\route.ts
import { NextResponse } from "next/server"
import { fetchConsumerData } from "@/lib/google-sheets"

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Fetch full consumer data
    const data = await fetchConsumerData()

    // Return data with NO caching so updates appear immediately
    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    })
  } catch (error) {
    console.error("💥 API /consumers/base error:", error)
    return NextResponse.json(
      { error: "Failed to fetch base data" },
      { status: 500 }
    )
  }
}
