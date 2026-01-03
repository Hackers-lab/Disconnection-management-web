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
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=300",
        "CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=300",
        "Vercel-CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=300",
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
