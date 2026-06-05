import { NextResponse } from "next/server"
import { getBlockedConsumerIds } from "@/lib/reconnection-service"

// Lightweight endpoint — returns just an array of consumer ID strings.
// consumer-list fetches this on mount to block the update button for
// consumers whose reconnection has been pending for more than 30 hours.
export async function GET() {
  try {
    const ids = await getBlockedConsumerIds()
    return NextResponse.json(ids, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    })
  } catch (e) {
    console.error("blocked-ids error:", e)
    return NextResponse.json([], { status: 500 })
  }
}
