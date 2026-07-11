import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { checkApiPermission } from "@/lib/permissions"

export const dynamic = "force-dynamic"
import { fetchDTRData, updateDTRRecord, uploadDTRData, DTRRecord } from "@/lib/dtr-service"
import { nowTs } from "@/lib/date-utils"

export async function GET() {
  const { authorized, error, status } = await checkApiPermission("dtr", "read")
  if (!authorized) return NextResponse.json({ error }, { status })

  try {
    const all = await fetchDTRData()
    return NextResponse.json(all)
  } catch (e: any) {
    console.error("💥 DTR fetch error:", e)
    return NextResponse.json({ error: e.message || "Failed to fetch DTR data" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { authorized, error, status, session } = await checkApiPermission("dtr", "update")
  if (!authorized) return NextResponse.json({ error }, { status })

  try {
    const body = await request.json()
    if (!body.dtrCode) {
      return NextResponse.json({ error: "DTR Code is required" }, { status: 400 })
    }

    const record: DTRRecord = {
      dtrCode:        String(body.dtrCode).trim(),
      feederName:     String(body.feederName || "").trim(),
      locationName:   String(body.locationName || "").trim(),
      kvCapacity:     String(body.kvCapacity || "").trim(),
      status:         String(body.status || "").trim(),
      actualFeeder:   String(body.actualFeeder || "").trim(),
      actualRating:   String(body.actualRating || "").trim(),
      actualLocation: String(body.actualLocation || "").trim(),
      supplyOffice:   String(body.supplyOffice || "").trim(),
      latlong:        String(body.latlong || "").trim(),
      long:           String(body.long || "").trim(),
      image:          String(body.image || "").trim(),
      painting:       String(body.painting || "").trim(),
      kiosk:          String(body.kiosk || "").trim(),
      la:             String(body.la || "").trim(),
      ne:             String(body.ne || "").trim(),
      loadR:          String(body.loadR || "").trim(),
      loadY:          String(body.loadY || "").trim(),
      loadB:          String(body.loadB || "").trim(),
      loadN:          String(body.loadN || "").trim(),
      verifiedBy:     session.username || "system",
      verifiedAt:     nowTs(),
      remarks:        String(body.remarks || "").trim(),
    }

    await updateDTRRecord(record)
    return NextResponse.json({ success: true, record })
  } catch (e: any) {
    console.error("💥 DTR update error:", e)
    return NextResponse.json({ error: e.message || "Failed to update DTR record" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const { authorized, error, status } = await checkApiPermission("dtr", "create")
  if (!authorized) return NextResponse.json({ error }, { status })

  try {
    const body = await request.json()
    const rows = body.rows || []
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: "rows must be an array" }, { status: 400 })
    }

    const dtrRows = rows.map((r: any) => ({
      dtrCode:        String(r.dtrCode || "").trim(),
      feederName:     String(r.feederName || "").trim(),
      locationName:   String(r.locationName || "").trim(),
      kvCapacity:     String(r.kvCapacity || "").trim(),
      status:         String(r.status || "").trim(),
      actualFeeder:   String(r.actualFeeder || "").trim(),
      actualRating:   String(r.actualRating || "").trim(),
      actualLocation: String(r.actualLocation || "").trim(),
      supplyOffice:   String(r.supplyOffice || "").trim(),
      latlong:        String(r.latlong || "").trim(),
      long:           String(r.long || "").trim(),
      image:          String(r.image || "").trim(),
      painting:       String(r.painting || "Pending").trim(),
      kiosk:          String(r.kiosk || "Good").trim(),
      la:             String(r.la || "Good").trim(),
      ne:             String(r.ne || "Good").trim(),
      loadR:          String(r.loadR || "").trim(),
      loadY:          String(r.loadY || "").trim(),
      loadB:          String(r.loadB || "").trim(),
      loadN:          String(r.loadN || "").trim(),
      remarks:        String(r.remarks || "").trim(),
    }))

    const count = await uploadDTRData(dtrRows, true)
    return NextResponse.json({ success: true, count })
  } catch (e: any) {
    console.error("💥 DTR bulk upload error:", e)
    return NextResponse.json({ error: e.message || "Failed to upload DTR data" }, { status: 500 })
  }
}
