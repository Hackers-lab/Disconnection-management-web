import { NextResponse } from "next/server"
import { getDDUpdates } from "@/lib/dd-service"

export async function GET() {
  const updates = await getDDUpdates()

  return NextResponse.json(updates, {
    headers: {
      // CDN-cache 15s with SWR so concurrent tabs share one origin call.
      "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
    },
  })
}
