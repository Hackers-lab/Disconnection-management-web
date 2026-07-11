import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { fetchIssues, issueMeter } from "@/lib/meter-service"

export async function GET() {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const all = await fetchIssues()

  if (session.role === "agency") {
    const upper = session.agencies.map((a: string) => a.toUpperCase())
    return NextResponse.json(all.filter(i => upper.includes(i.agency.toUpperCase())))
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
    const issueId = await issueMeter({
      serialNo:     body.serialNo,
      purpose:      body.purpose,
      consumerId:   body.consumerId  || "",
      nscReceiveNo: body.nscReceiveNo || "",
      consumerName: body.consumerName || "",
      agency:       body.agency,
      remarks:      body.remarks || "",
      address:      body.address || "",
      mobile:       body.mobile  || "",
      replacementId: body.replacementId || "",
    })
    return NextResponse.json({ success: true, issueId })
  } catch (e: any) {
    console.error("Issue meter error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
