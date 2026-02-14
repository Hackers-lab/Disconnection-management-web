"use client"

import { useEffect, useState } from "react"
import type { ConsumerData } from "@/lib/google-sheets"
import type { DeemedVisitData } from "@/lib/dd-service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  Zap,
  RotateCcw,
  ClipboardCheck,
  UserX,
  Settings,
  LayoutDashboard,
  ArrowRight,
  RadioTower,
  X,        // Added for Modal close
  Phone     // Added for Contact icon
} from "lucide-react"
import { ViewType } from "@/components/app-sidebar"
import { getFromCache, saveToCache } from "@/lib/indexed-db"

interface DashboardMenuProps {
  onSelect: (module: ViewType) => void
  userRole: string
  userAgencies?: string[]
}

export function DashboardMenu({ onSelect, userRole, userAgencies = [] }: DashboardMenuProps) {
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [ddPendingCount, setDdPendingCount] = useState<number>(0)
  const [showDevModal, setShowDevModal] = useState(false) // State for floating window

  const modules = [
    {
      id: "disconnection",
      title: "Disconnection",
      description: "Manage disconnection lists & status",
      icon: Zap,
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "hover:border-red-200",
      allowed: ["all"],
      status: "live"
    },
    {
      id: "reconnection",
      title: "Reconnection",
      description: "Re-issue connected consumers",
      icon: RotateCcw,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "hover:border-blue-200",
      allowed: ["admin", "executive"],
      status: "soon"
    },
    {
      id: "deemed",
      title: "Deemed Visit",
      description: "View deemed disconnected consumers",
      icon: UserX,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      borderColor: "hover:border-orange-200",
      allowed: ["admin", "executive", "agency"],
      status: "live"
    },
    {
      id: "dtr",
      title: "DTR Management",
      description: "DTR inspections",
      icon: RadioTower,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      borderColor: "hover:border-orange-200",
      allowed: ["admin", "executive"],
      status: "soon"
    },
    {
      id: "nsc",
      title: "NSC Inspection",
      description: "New Service Connection checks",
      icon: ClipboardCheck,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "hover:border-green-200",
      allowed: ["admin", "executive"],
      status: "soon"
    },
    {
      id: "admin",
      title: "Admin Panel",
      description: "Manage users and settings",
      icon: Settings,
      color: "text-gray-600",
      bgColor: "bg-gray-50",
      borderColor: "hover:border-gray-300",
      allowed: ["admin"],
      status: "active"
    }
  ]

  useEffect(() => {
    async function loadPendingCount() {
      try {
        let data = await getFromCache<ConsumerData[]>("consumers_data_cache")
        if (!data || data.length === 0) {
          try {
            const res = await fetch("/api/consumers/base")
            if (res.ok) {
              data = await res.json()
              if (data) await saveToCache("consumers_data_cache", data)
            }
          } catch (err) { console.error("Auto-fetch consumers failed", err) }
        }

        if (!data) data = []
        const count = data.filter(c => {
          const isConnected = (c.disconStatus || "").toLowerCase() === "connected"
          if (!isConnected) return false
          if (userRole === "admin" || userRole === "viewer") return true
          const consumerAgency = (c.agency || "").trim().toUpperCase()
          const safeAgencies = userAgencies || []
          const userAgenciesUpper = safeAgencies.map(a => a.trim().toUpperCase())
          return userAgenciesUpper.includes(consumerAgency)
        }).length
        setPendingCount(count)

        let ddData = await getFromCache<DeemedVisitData[]>("dd_data_cache")
        if (!ddData || ddData.length === 0) {
          try {
            const res = await fetch("/api/dd/base")
            if (res.ok) {
              ddData = await res.json()
              if (ddData) await saveToCache("dd_data_cache", ddData)
            }
          } catch (err) { console.error("Auto-fetch DD failed", err) }
        }

        if (ddData) {
          const ddCount = ddData.filter(d => {
            const isPending = (d.disconStatus || "").toLowerCase() === "deemed disconnected"
            if (!isPending) return false
            if (userRole === "admin" || userRole === "viewer") return true
            const agency = (d.agency || "").trim().toUpperCase()
            const safeAgencies = userAgencies || []
            const userAgenciesUpper = safeAgencies.map(a => a.trim().toUpperCase())
            return userAgenciesUpper.includes(agency)
          }).length
          setDdPendingCount(ddCount)
        }
      } catch (e) { console.error("Failed to load pending count", e) }
    }
    loadPendingCount()
  }, [userRole, userAgencies])

  return (
    <>
      <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-[calc(100vh-80px)] flex flex-col">
        <div className="flex-grow">
          <div className="flex items-center mb-10">
            <div className="p-3 bg-blue-50 rounded-xl mr-4">
              <LayoutDashboard className="h-8 w-8 text-blue-600" />
            </div>
            <div>
               <h2 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h2>
               <p className="text-gray-500 mt-1">Select a module to get started</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
            {modules.map((module) => {
              if (module.allowed[0] !== "all" && !module.allowed.includes(userRole)) return null
              const Icon = module.icon
              return (
                <Card 
                  key={module.id} 
                  className={`group relative cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-gray-200 ${module.borderColor} overflow-hidden`}
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    onSelect(module.id as ViewType)
                  }}
                >
                  {/* Badges and Card Content logic remains same... */}
                  {module.id === "disconnection" && pendingCount > 0 && (
                    <div className="absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center bg-red-600 text-white text-[10px] md:text-xs font-bold px-1.5 py-0.5 md:px-3 md:py-1 rounded-full shadow-lg border-2 border-white">
                      {pendingCount}
                    </div>
                  )}
                  {module.id === "deemed" && ddPendingCount > 0 && (
                    <div className="absolute top-2 right-2 md:top-4 md:right-4 z-20 flex items-center justify-center bg-red-600 text-white text-[10px] md:text-xs font-bold px-1.5 py-0.5 md:px-3 md:py-1 rounded-full shadow-lg border-2 border-white">
                      {ddPendingCount}
                    </div>
                  )}

                  <div className={`absolute top-0 right-0 p-2 md:p-4 opacity-10 group-hover:opacity-20 transition-opacity duration-300`}>
                     <Icon className={`h-16 w-16 md:h-24 md:w-24 ${module.color}`} />
                  </div>

                  <CardHeader className="relative pb-2 p-3 md:p-6">
                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl ${module.bgColor} flex items-center justify-center mb-2 md:mb-4 transition-transform duration-300 group-hover:scale-110`}>
                      <Icon className={`h-5 w-5 md:h-6 md:w-6 ${module.color}`} />
                    </div>
                    <CardTitle className="text-sm md:text-xl font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {module.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="relative p-3 pt-0 md:p-6 md:pt-0">
                    <p className="text-xs md:text-sm text-gray-500 mb-2 md:mb-4 line-clamp-2">
                      {module.description}
                    </p>
                    <div className="hidden md:flex items-center text-sm font-medium text-blue-600 opacity-0 transform translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                      Access Module <ArrowRight className="ml-2 h-4 w-4" />
                    </div>
                    {/* Live/Soon Tags logic remains same... */}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        {/* --- BEAUTIFUL DEVELOPER FOOTER --- */}
        <div className="mt-12 py-6 border-t border-gray-100 text-center">
          <p className="text-sm font-medium text-gray-400">
            Developed by{" "}
            <button 
              onClick={() => setShowDevModal(true)}
              className="font-bold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent hover:opacity-80 transition-opacity cursor-pointer text-base"
            >
              Pramod Verma
            </button>
          </p>
        </div>
      </div>

      {/* --- FLOATING WINDOW (MODAL) --- */}
      {showDevModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center animate-in zoom-in-95 duration-200 border border-gray-100">
            <button 
              onClick={() => setShowDevModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
            
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="h-8 w-8 text-indigo-600" />
            </div>
            
            <h3 className="text-xl font-bold text-gray-900 mb-2">Contact Developer</h3>
            <p className="text-gray-600 mb-6">
              To add your supply or for technical assistance, please contact:
            </p>
            
            <a 
              href="tel:8092273459" 
              className="inline-block w-full py-4 px-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-bold text-lg hover:shadow-lg transition-all active:scale-95"
            >
              8092273459
            </a>
            
            <p className="mt-4 text-[10px] text-gray-400 uppercase tracking-widest font-bold">Pramod Verma • System Support</p>
          </div>
        </div>
      )}
    </>
  )
}
