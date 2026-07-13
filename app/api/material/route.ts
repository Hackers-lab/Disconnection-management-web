import { NextResponse } from "next/server"
import { checkApiPermission } from "@/lib/permissions"
import { getStock, getCatalogue } from "@/lib/material-service"

export async function GET() {
  const { authorized, error, status } = await checkApiPermission("material", "read")
  if (!authorized) return NextResponse.json({ error }, { status: status || 403 })

  try {
    const [stock, catalogue] = await Promise.all([getStock(), getCatalogue()])
    return NextResponse.json({ stock, catalogue })
  } catch (e: any) {
    console.error("Material stock error:", e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
