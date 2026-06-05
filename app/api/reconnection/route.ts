import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import {
  fetchReconnectionData,
  createReconnectionRequest,
} from "@/lib/reconnection-service"

export async function GET() {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const all = await fetchReconnectionData()

  // Agency: only their own
  if (session.role === "agency") {
    const upper = session.agencies.map((a: string) => a.toUpperCase())
    return NextResponse.json(all.filter(r => upper.includes(r.agency.toUpperCase())))
  }

  return NextResponse.json(all)
}

export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || !["admin", "executive"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const requestId = await createReconnectionRequest({
      consumerId:      body.consumerId || "",
      name:            body.name || "",
      address:         body.address || "",
      mobile:          body.mobile || "",
      agency:          body.agency || "",
      device:          body.device || "",
      source:          body.source || "dc_list",
      requestImageUrl: body.requestImageUrl || "",
      remarks:         body.remarks || "",
    })
    return NextResponse.json({ success: true, requestId })
  } catch (e: any) {
    console.error("Reconnection create error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
