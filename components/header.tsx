"use client"

import { Button } from "@/components/ui/button"
import { logout } from "@/app/actions/auth"
import { Power, User, Settings, Download } from "lucide-react"

interface HeaderProps {
  userRole: string
  onAdminClick?: () => void
  onDownload?: () => void;
}

export function Header({ userRole, onAdminClick, onDownload }: HeaderProps) {
  const handleDownload = () => {
    const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTUdnZVO_1jP6rtHen6zsTM4ff3YEo_xPe41HvMq_q3yOtwuaoTNz4AEOtuabLbmw2BzYnJh8fCIF2Y/pub?output=csv";
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'disconnection_data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <header className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-2">
            <Power className="h-6 w-6 text-blue-600" />
            <span className="text-xl font-semibold text-gray-900">Report</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <User className="h-4 w-4" />
              <span className="capitalize">{userRole}</span>
            </div>
            <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleDownload} //onDownload
                  title="Download Data"
                >
                  <Download className="h-4 w-4" />
                </Button>
            {userRole === "admin" && (
              <>
                
                {onAdminClick && (
                  <Button variant="ghost" size="sm" onClick={onAdminClick} title="Admin Panel">
                    <Settings className="h-4 w-4" />
                  </Button>
                )}
              </>
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