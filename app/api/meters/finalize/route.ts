import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { finalizeMeterInstallation } from "@/lib/meter-service"

export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || !["admin", "executive"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await request.json()
    if (!body.issueId)       return NextResponse.json({ error: "issueId required" }, { status: 400 })
    if (!body.completionRef) return NextResponse.json({ error: "Completion reference required" }, { status: 400 })

    await finalizeMeterInstallation({
      issueId:        body.issueId,
      completionRef:  body.completionRef,
      installationNo: body.installationNo || "",
      finalizedBy:    `${session.role}:${session.username}`,
    })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("Finalize error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
