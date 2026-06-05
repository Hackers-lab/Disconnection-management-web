import { NextResponse } from "next/server"
import { verifySession } from "@/lib/session"
import { fetchConsumerData } from "@/lib/google-sheets"
import { fetchReconnectionData } from "@/lib/reconnection-service"
import { fetchIssues } from "@/lib/meter-service"
import { fetchApplications } from "@/lib/nsc-service"

// Lightweight count endpoint — all four fetches use server-side memo caches,
// so repeated calls within the TTL window are near-instant.
export async function GET() {
  const session = await verifySession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const isAdmin  = session.role === "admin" || session.role === "executive"
  const upper    = (session.agencies || []).map((a: string) => a.toUpperCase())

  let urgentDC          = 0
  let reconnectionPending = 0
  let meterPending      = 0
  let nscPending        = 0

  await Promise.allSettled([
    (async () => {
      const consumers = await fetchConsumerData()
      urgentDC = consumers.filter(c => {
        if ((c.priority || "").toLowerCase() !== "urgent") return false
        if (isAdmin) return true
        return upper.includes((c.agency || "").toUpperCase())
      }).length
    })(),

    (async () => {
      const rc = await fetchReconnectionData()
      reconnectionPending = rc.filter(r => {
        if (r.status !== "pending") return false
        if (isAdmin) return true
        return upper.includes(((r as any).agency || "").toUpperCase())
      }).length
    })(),

    (async () => {
      const issues = await fetchIssues()
      const target = isAdmin ? "installation_done" : "issued"
      meterPending = issues.filter(m => {
        if (m.status !== target) return false
        if (isAdmin) return true
        return upper.includes((m.agency || "").toUpperCase())
      }).length
    })(),

    (async () => {
      const apps = await fetchApplications()
      const target = isAdmin ? "inspected" : "pending"
      nscPending = apps.filter(a => {
        if (a.status !== target) return false
        if (isAdmin) return true
        return upper.includes((a.agency || "").toUpperCase())
      }).length
    })(),
  ])

  return NextResponse.json({ urgentDC, reconnectionPending, meterPending, nscPending, ts: Date.now() })
}
