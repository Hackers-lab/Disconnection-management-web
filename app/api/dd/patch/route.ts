import { NextResponse } from "next/server"
import { getDDUpdates } from "@/lib/dd-service"

export const dynamic = "force-dynamic"

export async function GET() {
  const updates = await getDDUpdates()
  
  return NextResponse.json(updates, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}
