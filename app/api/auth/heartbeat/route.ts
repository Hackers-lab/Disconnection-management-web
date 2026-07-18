import { NextRequest, NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { withTenant } from "@/lib/tenant-context"

const COOKIE = "_audit_ts"

export const GET = withTenant(async function GET(request: NextRequest) {
  const session = await verifySession()
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })

  const today = new Date().toISOString().split("T")[0] // YYYY-MM-DD
  const lastSeen = request.cookies.get(COOKIE)?.value

  // Already logged today — nothing to do
  if (lastSeen === today) return NextResponse.json({ ok: true, logged: false })

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  const userAgent = request.headers.get("user-agent") || "unknown"
  const deployment = request.headers.get("host") || "unknown"
  const deviceId = request.cookies.get("deviceId")?.value

  // Fire-and-forget — never block the response. Lazy-import so the heavy
  // googleapis module only loads on the once-a-day path that actually logs,
  // not on every early-return heartbeat.
  import("@/lib/login-logger").then(({ appendLoginLog }) => appendLoginLog({
    action: "login",
    status: "success",
    deployment,
    userId: session.userId,
    username: session.username,
    role: session.role,
    agencies: session.agencies,
    ip,
    userAgent,
    deviceId,
  })).catch(() => {})

  const response = NextResponse.json({ ok: true, logged: true })
  // Refresh the cookie so it resets each day
  response.cookies.set(COOKIE, today, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 8, // 8 days — slightly longer than session TTL
  })
  return response
})
