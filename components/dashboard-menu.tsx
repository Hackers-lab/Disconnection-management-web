"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  Zap,             // Disconnection
  RotateCcw,       // Reconnection
  ClipboardCheck,  // NSC
  UserX,           // Deemed (Using UserX as per your sidebar)
  Settings,         // Admin
  LayoutDashboard
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
      icon: UserX,
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
    <div className="p-8">
      <div className="flex items-center mb-8">
        <LayoutDashboard className="h-8 w-8 text-blue-600 mr-3" />
        <div>
           <h2 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h2>
           <p className="text-gray-500">Select a module to get started</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((module) => {
          if (module.allowed[0] !== "all" && !module.allowed.includes(userRole)) return null

          const Icon = module.icon

          return (
            <Card 
              key={module.id} 
              className={`cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 border-2 border-transparent ${module.borderColor}`}
              onClick={() => onSelect(module.id as ViewType)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {module.title}
                </CardTitle>
                <div className={`p-2 rounded-full ${module.bgColor}`}>
                  <Icon className={`h-6 w-6 ${module.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{/* Count could go here */}</div>
                <p className="text-xs text-gray-500 mt-2">
                  {module.description}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}