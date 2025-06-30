"use client"

import { Button } from "@/components/ui/button"
import { logout } from "@/app/actions/auth"
import { Power, User, Settings } from "lucide-react"

interface HeaderProps {
  userRole: string
  onAdminClick?: () => void
}

export function Header({ userRole, onAdminClick }: HeaderProps) {
  return (
    <header className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-2">
            <Power className="h-6 w-6 text-blue-600" />
            <span className="text-xl font-semibold text-gray-900">Disconnection Management</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <User className="h-4 w-4" />
              <span className="capitalize">{userRole}</span>
            </div>
            {userRole === "admin" && onAdminClick && (
              <Button variant="ghost" size="sm" onClick={onAdminClick} title="Admin Panel">
                <Settings className="h-4 w-4" />
              </Button>
            )}
            <form action={logout}>
              <Button variant="outline" size="sm" type="submit">
                Logout
              </Button>
            </form>
          </div>
        </div>
      </div>
    </header>
  )
}
