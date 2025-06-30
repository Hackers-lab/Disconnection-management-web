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
  const [consumers, setConsumers] = useState(initialConsumers)
  const [loading, setLoading] = useState(false)

  async function refreshData() {
    setLoading(true)
    try {
      const res = await fetch("/api/consumers")
      if (res.ok) {
        const data = (await res.json()) as ConsumerData[]
        setConsumers(data)
      }
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

/* default export required by the error message */
export default DashboardClient
