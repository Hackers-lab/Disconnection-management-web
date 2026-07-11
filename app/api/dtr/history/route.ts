import { NextRequest, NextResponse } from "next/server"
import { checkApiPermission } from "@/lib/permissions"
import { fetchDTRHistory } from "@/lib/dtr-history"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("dtr", "read")
  if (!authorized) return NextResponse.json({ error }, { status })

  try {
    const { searchParams } = new URL(request.url)
    const dtrCode = searchParams.get("dtrCode")
    if (!dtrCode) {
      return NextResponse.json({ error: "dtrCode parameter is required" }, { status: 400 })
    }

    const history = await fetchDTRHistory(dtrCode)
    return NextResponse.json(history)
  } catch (e: any) {
    console.error("💥 DTR history fetch error:", e)
    return NextResponse.json({ error: e.message || "Failed to fetch DTR history" }, { status: 500 })
  }
}
