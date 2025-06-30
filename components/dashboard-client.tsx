"use client"

import { useState } from "react"
import { DashboardShell } from "@/components/dashboard-shell"

interface DashboardClientProps {
  role: string
  agencies: string[]
}

export default function DashboardClient({ role, agencies }: DashboardClientProps) {
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [activeTab, setActiveTab] = useState<"dashboard" | "consumers">("dashboard")

  return (
    <DashboardShell
      role={role}
      agencies={agencies}
      showAdminPanel={showAdminPanel}
      openAdmin={() => setShowAdminPanel(true)}
      closeAdmin={() => setShowAdminPanel(false)}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
    />
  )
}
