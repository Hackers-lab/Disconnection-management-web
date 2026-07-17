import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { fetchReplacements, addReplacement } from "@/lib/meter-replacement-service"
import { checkApiPermission } from "@/lib/permissions"

export async function GET() {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { authorized, error, status } = await checkApiPermission("meter_replacement", "read")
  if (!authorized) return NextResponse.json({ error }, { status })

  const all = await fetchReplacements()

  if (session.role === "agency") {
    const upper = session.agencies.map((a: string) => a.toUpperCase())
    return NextResponse.json(all.filter(r => upper.includes((r.agency || "").toUpperCase())))
  }
  return NextResponse.json(all)
}

export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { authorized, error, status } = await checkApiPermission("meter_replacement", "create")
  if (!authorized) return NextResponse.json({ error }, { status })

  try {
    const body = await request.json()
    const { consumerId, consumerName, address, mobile, agency, purpose, remarks, attachmentUrl, oldMeterNo } = body

    if (!consumerId || !consumerName || !address || !purpose) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const replacementId = await addReplacement({
      consumerId,
      consumerName,
      address,
      mobile: mobile || "",
      agency: agency || "",
      purpose,
      remarks: remarks || "",
      attachmentUrl: attachmentUrl || "",
      oldMeterNo: oldMeterNo || ""
    })

    return NextResponse.json({ success: true, replacementId })
  } catch (e: any) {
    console.error("Create replacement error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
