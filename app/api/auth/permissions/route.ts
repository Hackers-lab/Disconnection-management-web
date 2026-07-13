import { NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { roleStorage } from "@/lib/role-storage"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const session = await verifySession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const permissions = await roleStorage.getPermissionsForRole(session.role)
    if (!permissions) {
      // Default to empty permissions if role is not configured
      return NextResponse.json({
        role: session.role,
        permissions: {
          disconnection: [],
          reconnection: [],
          deemed: [],
          dtr: [],
          meter: [],
          nsc: [],
          consumer_master: [],
          admin: [],
          meter_replacement: [],
          material: [],
        },
      })
    }

    return NextResponse.json({
      role: session.role,
      permissions,
    })
  } catch (error) {
    console.error("Error in permissions API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
