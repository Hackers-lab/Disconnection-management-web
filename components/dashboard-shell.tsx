"use client"

import { Header } from "@/components/header"
import { ConsumerList } from "@/components/consumer-list"

interface DashboardShellProps {
  role: string
  agencies: string[]
  showAdminPanel: boolean
  openAdmin: () => void
  closeAdmin: () => void
}

export function DashboardShell({ role, agencies, showAdminPanel, openAdmin, closeAdmin }: DashboardShellProps) {
  return (
    <>
      <Header userRole={role} onAdminClick={role === "admin" ? openAdmin : undefined} />

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-600">
            {role === "admin" ? "Manage all consumers across agencies" : `Manage consumers for: ${agencies.join(", ")}`}
          </p>
        </div>

        <ConsumerList
          userRole={role}
          userAgencies={agencies}
          onAdminClick={openAdmin}
          showAdminPanel={showAdminPanel}
          onCloseAdminPanel={closeAdmin}
        />
      </main>
    </>
  )
}
