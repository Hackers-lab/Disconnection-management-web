import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { fetchApplications, createApplication } from "@/lib/nsc-service"

export async function GET() {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const all = await fetchApplications()

  if (session.role === "agency") {
    const upper = (session.agencies || []).map((a: string) => a.toUpperCase())
    return NextResponse.json(all.filter(a => upper.includes(a.agency.toUpperCase())))
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
    if (!body.applicantName) return NextResponse.json({ error: "Applicant name required" }, { status: 400 })
    if (!body.address)       return NextResponse.json({ error: "Address required" }, { status: 400 })
    if (!body.mobile)        return NextResponse.json({ error: "Mobile required" }, { status: 400 })
    if (!body.appliedClass)  return NextResponse.json({ error: "Applied class required" }, { status: 400 })
    if (!body.phase)         return NextResponse.json({ error: "Phase required" }, { status: 400 })
    if (!body.agency)        return NextResponse.json({ error: "Agency required" }, { status: 400 })

    const receiveNo = await createApplication({
      applicantName: body.applicantName,
      careOf:        body.careOf        || "",
      address:       body.address,
      mobile:        body.mobile,
      appliedClass:  body.appliedClass,
      phase:         body.phase,
      agency:        body.agency,
      createdBy:     `${session.role}:${session.username}`,
    })
    return NextResponse.json({ success: true, receiveNo })
  } catch (e: any) {
    console.error("NSC create error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
