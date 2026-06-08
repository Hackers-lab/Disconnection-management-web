import { NextResponse } from "next/server"
import { getBlockedConsumerIds } from "@/lib/reconnection-service"

// Lightweight endpoint — returns just an array of consumer ID strings.
// consumer-list fetches this on mount to block the update button for
// consumers whose reconnection has been pending for more than 30 hours.
export async function GET() {
  try {
    const ids = await getBlockedConsumerIds()
    return NextResponse.json(ids, {
      // The blocked-ids set only changes when a reconnection crosses the 30h
      // threshold — 5-min CDN freshness is plenty and lets the edge serve most
      // hits without invoking the function. No per-user data, so fully cacheable.
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    })
  } catch (e) {
    console.error("blocked-ids error:", e)
    return NextResponse.json([], { status: 500 })
  }
}
