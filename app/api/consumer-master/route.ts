import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import {
  fetchMasterData,
  uploadMasterData,
  type ConsumerMasterRow,
} from "@/lib/consumer-master-service"

// All roles can read the consumer master
export async function GET() {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const data = await fetchMasterData()
    return NextResponse.json(data)
  } catch (e: any) {
    console.error("Consumer master fetch error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}

// Only admin can replace/upload the master data
export async function POST(request: NextRequest) {
  const session = await verifySession()
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const body = await request.json()
    if (!Array.isArray(body.rows)) {
      return NextResponse.json({ error: "rows array required" }, { status: 400 })
    }
    const rows = body.rows as ConsumerMasterRow[]
    const result = await uploadMasterData(rows)
    return NextResponse.json({ success: true, count: result.count })
  } catch (e: any) {
    console.error("Consumer master upload error:", e)
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
