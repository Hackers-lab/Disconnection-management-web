"use client"

import { 
  Zap,             // For Disconnection
  RotateCcw,       // For Reconnection (Reissue)
  ClipboardCheck,  // For NSC Inspection
  LayoutDashboard, // For Dashboard
  Menu,
  Settings,
  UserX
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useState } from "react"

// Define the available views
export type ViewType = "disconnection" | "reconnection" | "deemed" | "nsc" | "admin" | "home"

interface AppSidebarProps {
  activeView: ViewType
  setActiveView: (view: ViewType | "home") => void
  userRole: string
  isMobile?: boolean
}

export function AppSidebar({ activeView, setActiveView, userRole, isMobile = false }: AppSidebarProps) {
  const [open, setOpen] = useState(false)

  const menuItems = [
    { 
      id: "home", 
      label: "Dashboard Home", 
      icon: LayoutDashboard,
      allowedRoles: ["all"] 
    },
    { 
      id: "disconnection", 
      label: "Disconnection List", 
      icon: Zap,
      allowedRoles: ["all"] 
    },
    { 
      id: "reconnection", 
      label: "Reconnection", 
      icon: RotateCcw,
      allowedRoles: ["admin", "executive", "agency"] // Example roles
    },
    { 
      id: "deemed", 
      label: "Deemed Disconnection Visit", 
      icon: UserX, 
      allowedRoles: ["admin", "executive", "agency"]
    },
    { 
      id: "nsc", 
      label: "NSC Visit", 
      icon: ClipboardCheck, 
      allowedRoles: ["admin", "executive"] // Example roles
    },
    // Only show Admin Panel button here if you want it in the menu
    {
      id: "admin",
      label: "Admin Settings",
      icon: Settings,
      allowedRoles: ["admin"]
    }
  ]

  const handleSelect = (view: string) => {
    setActiveView(view as ViewType)
    setOpen(false) // Close mobile menu on select
  }

  const MenuList = () => (
    <div className="flex flex-col space-y-2 py-4">
      {menuItems.map((item) => {
        // Filter based on roles
        if (item.allowedRoles[0] !== "all" && !item.allowedRoles.includes(userRole)) {
          return null
        }

        const Icon = item.icon
        const isActive = activeView === item.id

        return (
          <Button
            key={item.id}
            variant={isActive ? "secondary" : "ghost"}
            className={`justify-start ${isActive ? "bg-blue-100 text-blue-700" : "text-gray-600"}`}
            onClick={() => handleSelect(item.id)}
          >
            <Icon className="mr-2 h-4 w-4" />
            {item.label}
          </Button>
        )
      })}
    </div>
  )

  // MOBILE VIEW: Return a Hamburger Button that opens a Sheet
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[250px] sm:w-[300px]">
          <SheetHeader>
            <SheetTitle className="text-left flex items-center">
              <LayoutDashboard className="w-5 h-5 mr-2 text-blue-600" />
              Menu
            </SheetTitle>
          </SheetHeader>
          <MenuList />
        </SheetContent>
      </Sheet>
    )
  }

  // DESKTOP VIEW: Return a static Sidebar
  return (
    <div className="hidden md:flex flex-col w-64 border-r bg-white h-screen fixed left-0 top-0 pt-16 px-4">
       <div className="text-xs font-semibold text-gray-400 mb-4 uppercase tracking-wider">Apps</div>
       <MenuList />
    </div>
  )
}