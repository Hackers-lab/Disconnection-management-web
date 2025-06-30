"use client"

import { DashboardStats } from "./dashboard-stats"
import { ConsumerList } from "./consumer-list"
import type { ConsumerData } from "@/lib/google-sheets"

interface DashboardShellProps {
  consumers: ConsumerData[]
  userRole: string
  userAgency?: string
  onRefresh: () => void
  loading: boolean
}

export function DashboardShell({ consumers, userRole, userAgency, onRefresh, loading }: DashboardShellProps) {
  return (
    <div className="space-y-6">
      {/* Dashboard Stats */}
      <DashboardStats consumers={consumers} />

      {/* Consumer List */}
      <ConsumerList
        consumers={consumers}
        userRole={userRole}
        userAgency={userAgency}
        onRefresh={onRefresh}
        loading={loading}
      />
    </div>
  )
}
