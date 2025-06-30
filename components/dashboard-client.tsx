"use client"

import { useState } from "react"
import { DashboardShell } from "./dashboard-shell"
import type { ConsumerData } from "@/lib/google-sheets"

interface DashboardClientProps {
  initialConsumers: ConsumerData[]
  userRole: string
  userAgency?: string
}

export function DashboardClient({ initialConsumers, userRole, userAgency }: DashboardClientProps) {
  const [consumers, setConsumers] = useState<ConsumerData[]>(initialConsumers)
  const [loading, setLoading] = useState(false)

  const refreshData = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/consumers")
      if (response.ok) {
        const data = await response.json()
        setConsumers(data)
      }
    } catch (error) {
      console.error("Failed to refresh data:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DashboardShell
      consumers={consumers}
      userRole={userRole}
      userAgency={userAgency}
      onRefresh={refreshData}
      loading={loading}
    />
  )
}

export default DashboardClient
