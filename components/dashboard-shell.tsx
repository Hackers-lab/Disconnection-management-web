"use client"

import { Header } from "@/components/header"
import { ConsumerList } from "@/components/consumer-list"
import { Button } from "@/components/ui/button"
import { BarChart3, Users } from "lucide-react"

interface DashboardShellProps {
  role: string
  agencies: string[]
  showAdminPanel: boolean
  openAdmin: () => void
  closeAdmin: () => void
  activeTab: "dashboard" | "consumers"
  setActiveTab: (tab: "dashboard" | "consumers") => void
}

export function DashboardShell({
  role,
  agencies,
  showAdminPanel,
  openAdmin,
  closeAdmin,
  activeTab,
  setActiveTab,
}: DashboardShellProps) {
  return (
    <>
      <Header userRole={role} onAdminClick={role === "admin" ? openAdmin : undefined} />

      {/* Mobile Tab Navigation */}
      <div className="md:hidden bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex">
          <Button
            variant={activeTab === "dashboard" ? "default" : "ghost"}
            className={`flex-1 rounded-none h-12 ${
              activeTab === "dashboard"
                ? "bg-blue-600 text-white border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
            onClick={() => setActiveTab("dashboard")}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
          <Button
            variant={activeTab === "consumers" ? "default" : "ghost"}
            className={`flex-1 rounded-none h-12 ${
              activeTab === "consumers"
                ? "bg-blue-600 text-white border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
            onClick={() => setActiveTab("consumers")}
          >
            <Users className="h-4 w-4 mr-2" />
            Consumers
          </Button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Desktop: Always show title */}
        <div className="mb-4 hidden md:block">
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-600">
            {role === "admin" ? "Manage all consumers across agencies" : `Manage consumers for: ${agencies.join(", ")}`}
          </p>
        </div>

        {/* Mobile: Show title based on active tab */}
        <div className="mb-4 md:hidden">
          <h1 className="text-xl font-bold text-gray-900">{activeTab === "dashboard" ? "Dashboard" : "Consumers"}</h1>
          <p className="text-sm text-gray-600">
            {activeTab === "dashboard"
              ? role === "admin"
                ? "Overview of all consumers"
                : `Overview for: ${agencies.join(", ")}`
              : role === "admin"
                ? "Manage all consumers across agencies"
                : `Manage consumers for: ${agencies.join(", ")}`}
          </p>
        </div>

        <ConsumerList
          userRole={role}
          userAgencies={agencies}
          onAdminClick={openAdmin}
          showAdminPanel={showAdminPanel}
          onCloseAdminPanel={closeAdmin}
          activeTab={activeTab}
        />
      </main>
    </>
  )
}
