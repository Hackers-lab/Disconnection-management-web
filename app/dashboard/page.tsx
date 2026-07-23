import { redirect } from "next/navigation"
import { verifySession } from "@/lib/session"
import DashboardClient from "@/components/dashboard-client"
import { NewYearPopup } from "@/components/new-year-popup"
import { MigrationPopup } from "@/components/migration-popup"

export default async function DashboardPage() {
  const session = await verifySession()

  if (!session) {
    redirect("/login")
  }

  return (
    <>
      <MigrationPopup />
      <NewYearPopup userId={session.userId} />
      <DashboardClient role={session.role} agencies={session.agencies} />
    </>
  )
}
