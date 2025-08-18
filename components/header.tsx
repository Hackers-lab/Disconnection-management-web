"use client"

import { Button } from "@/components/ui/button"
import { logout } from "@/app/actions/auth"
import { Power, User, Settings, Download, LogOut, Upload, List } from "lucide-react"
import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface HeaderProps {
  userRole: string
  userAgencies?: string[] // Add this prop
  onAdminClick?: () => void
  onDownload?: () => void
  onDownloadDefaulters?: () => void
}

export function Header({ userRole, userAgencies = [], onAdminClick, onDownload, onDownloadDefaulters }: HeaderProps) {
  const [showAgencyUpdates, setShowAgencyUpdates] = useState(false)
  const [agencyLastUpdates, setAgencyLastUpdates] = useState<{name: string, lastUpdate: string}[]>([])
  const [loading, setLoading] = useState(false)
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logout(); // server action, will redirect("/login")
    } catch (err) {
      setLoggingOut(false); // fallback if error
    }
  };


  const handleDownload = () => {
    const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTUdnZVO_1jP6rtHen6zsTM4ff3YEo_xPe41HvMq_q3yOtwuaoTNz4AEOtuabLbmw2BzYnJh8fCIF2Y/pub?output=csv";
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'disconnection_data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpload = async () => {
    try {
      setLoading(true)
      // Fetch agency last updates
      const response = await fetch("/api/agency-last-updates")
      if (response.ok) {
        const data = await response.json()
        // Filter agencies for non-admin users
        const filteredData = userRole === "admin" 
          ? data 
          : data.filter((agency: { name: string, lastUpdate: string }) => userAgencies.includes(agency.name))
        setAgencyLastUpdates(filteredData)
        setShowAgencyUpdates(true)
      }
    } catch (error) {
      console.error("Error fetching agency updates:", error)
    } finally {
      setLoading(false)
    }
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
            <div className="relative">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                title="Download Options"
              >
                <Download className="h-4 w-4" />
              </Button>

              {showDownloadMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white border rounded shadow-lg z-50">
                  <button
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                    onClick={() => {
                      setShowDownloadMenu(false);
                      onDownload && onDownload();
                    }}
                  >
                    Download Report
                  </button>
                  <button
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                    onClick={() => {
                      setShowDownloadMenu(false);
                      onDownloadDefaulters && onDownloadDefaulters();
                    }}
                  >
                    Top Defaulter List
                  </button>
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleUpload}
              title="Upload Data"
              disabled={loading}
            >
              <List className="h-4 w-4" />
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
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              title="Logout"
              disabled={loggingOut}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Agency Updates Dialog */}
      <Dialog open={showAgencyUpdates} onOpenChange={setShowAgencyUpdates}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agency Last Updates</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {agencyLastUpdates.length > 0 ? (
              agencyLastUpdates.map(agency => (
                <div key={agency.name} className="flex justify-between items-center border-b pb-2">
                  <span className="font-medium">{agency.name}</span>
                  <span className="text-sm text-gray-600">
                    {agency.lastUpdate || "No updates recorded"}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">
                No agency update data available
              </p>
            )}
          </div>
          <div className="flex justify-end pt-4">
            <Button onClick={() => setShowAgencyUpdates(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {loggingOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white bg-opacity-70">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
            <p className="text-lg font-medium text-gray-700">Logging out...</p>
          </div>
        </div>
      )}

    </header>
  )
}