"use client"

import { Header } from "@/components/header"
import { ViewType } from "@/components/app-sidebar"

interface DashboardShellProps {
  role: string
  agencies: string[]
  showAdminPanel: boolean
  openAdmin: () => void
  closeAdmin: () => void
  activeView: ViewType | "home"
  setActiveView: (view: ViewType | "home") => void
  children: React.ReactNode
  onDownload?: () => void
  onDownloadDefaulters?: () => void
}

export function DashboardShell({ 
  role, 
  agencies, 
  showAdminPanel, 
  openAdmin, 
  closeAdmin, 
  activeView, 
  setActiveView,
  children,
  onDownload,
  onDownloadDefaulters
}: DashboardShellProps) {
  
  return (
    <>
      <Header 
        userRole={role} 
        userAgencies={agencies}
        onAdminClick={role === "admin" ? openAdmin : undefined} 
        onDownload={onDownload} 
        onDownloadDefaulters={onDownloadDefaulters}
        activeView={activeView}
        setActiveView={setActiveView}
      />
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Render whatever is passed as children (Menu, List, etc.) */}
        {children} 
      </main>
    </>
  )
}