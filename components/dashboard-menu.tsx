"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  Zap,             // Disconnection
  RotateCcw,       // Reconnection
  ClipboardCheck,  // NSC
  UserX,           // Deemed (Using UserX as per your sidebar)
  Settings,         // Admin
  LayoutDashboard,
  ArrowRight,
  RadioTower
} from "lucide-react"
import { ViewType } from "@/components/app-sidebar"

interface DashboardMenuProps {
  onSelect: (module: ViewType) => void
  userRole: string
}

export function DashboardMenu({ onSelect, userRole }: DashboardMenuProps) {
  
  const modules = [
    {
      id: "disconnection",
      title: "Disconnection",
      description: "Manage disconnection lists & status",
      icon: Zap,
      color: "text-red-600",
      bgColor: "bg-red-50",
      borderColor: "hover:border-red-200",
      allowed: ["all"]
    },
    {
      id: "reconnection",
      title: "Reconnection",
      description: "Re-issue connected consumers",
      icon: RotateCcw,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
      borderColor: "hover:border-blue-200",
      allowed: ["admin", "executive", "agency"]
    },
    {
      id: "deemed",
      title: "Deemed Visit",
      description: "View deemed disconnected consumers",
      icon: UserX,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      borderColor: "hover:border-orange-200",
      allowed: ["admin", "executive", "agency"]
    },
    {
      id: "dtr",
      title: "DTR Management",
      description: "DTR inspections",
      icon: RadioTower,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
      borderColor: "hover:border-orange-200",
      allowed: ["admin", "executive", "agency"]
    },
    {
      id: "nsc",
      title: "NSC Inspection",
      description: "New Service Connection checks",
      icon: ClipboardCheck,
      color: "text-green-600",
      bgColor: "bg-green-50",
      borderColor: "hover:border-green-200",
      allowed: ["admin", "executive"]
    },
    {
      id: "admin",
      title: "Admin Panel",
      description: "Manage users and settings",
      icon: Settings,
      color: "text-gray-600",
      bgColor: "bg-gray-50",
      borderColor: "hover:border-gray-300",
      allowed: ["admin"]
    }
  ]

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center mb-10">
        <div className="p-3 bg-blue-50 rounded-xl mr-4">
          <LayoutDashboard className="h-8 w-8 text-blue-600" />
        </div>
        <div>
           <h2 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h2>
           <p className="text-gray-500 mt-1">Select a module to get started</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((module) => {
          if (module.allowed[0] !== "all" && !module.allowed.includes(userRole)) return null

          const Icon = module.icon

          return (
            <Card 
              key={module.id} 
              className={`group relative cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-gray-200 ${module.borderColor} overflow-hidden`}
              onClick={() => onSelect(module.id as ViewType)}
            >
              <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity duration-300`}>
                 <Icon className={`h-24 w-24 ${module.color}`} />
              </div>

              <CardHeader className="relative pb-2">
                <div className={`w-12 h-12 rounded-xl ${module.bgColor} flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110`}>
                  <Icon className={`h-6 w-6 ${module.color}`} />
                </div>
                <CardTitle className="text-xl font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                  {module.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="relative">
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                  {module.description}
                </p>
                <div className="flex items-center text-sm font-medium text-blue-600 opacity-0 transform translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                  Access Module <ArrowRight className="ml-2 h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}