import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { updateReconnectionStatus } from "@/lib/reconnection-service"

export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const body = await request.json()
    const { requestId, status, imageUrl, reading, remarks } = body

    if (!requestId || !status) {
      return NextResponse.json({ error: "requestId and status required" }, { status: 400 })
    }

    const validStatuses = ["reconnected", "door_locked", "cancelled"]
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    // Cancelled only by admin/executive
    if (status === "cancelled" && !["admin", "executive"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await updateReconnectionStatus({
      requestId,
      status,
      updatedBy: `${session.role}:${session.username}`,
      imageUrl,
      reading,
      remarks,
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("Reconnection update error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
