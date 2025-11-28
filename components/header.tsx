"use client"

import { Button } from "@/components/ui/button"
import { logout } from "@/app/actions/auth"
import { Power, User, Settings, Download, LogOut, Upload, List, Building2, Calendar, Clock } from "lucide-react"
import { useState, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface HeaderProps {
  userRole: string
  userAgencies?: string[]
  onAdminClick?: () => void
  onDownload?: () => void
  onDownloadDefaulters?: () => void
}

export function Header({ userRole, userAgencies = [], onAdminClick, onDownload, onDownloadDefaulters }: HeaderProps) {
  const [showAgencyUpdates, setShowAgencyUpdates] = useState(false)
  const [agencyLastUpdates, setAgencyLastUpdates] = useState<{name: string, lastUpdate: string; lastUpdateCount: number}[]>([])
  const [loading, setLoading] = useState(false)
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // --- Date helpers ---
  const parseDate = (dateStr: string) => {
    if (!dateStr) return null;
    const parts = dateStr.split("-");
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(p => parseInt(p, 10));
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? null : d;
  };

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const getRowColor = (dateStr: string) => {
    const parsed = parseDate(dateStr);
    if (!parsed) return "bg-gray-50 border border-gray-200";

    const d = startOfDay(parsed);
    const today = startOfDay(new Date());
    const yesterday = startOfDay(new Date());
    yesterday.setDate(today.getDate() - 1);

    if (sameDay(d, today)) return "bg-green-100 border border-green-200 hover:bg-green-100";
    if (sameDay(d, yesterday)) return "bg-yellow-100 border border-yellow-200 hover:bg-yellow-100";
    return "bg-red-100 border border-red-200 hover:bg-red-100";
  };

  const getBadgeColor = (dateStr: string) => {
    const parsed = parseDate(dateStr);
    if (!parsed) return "bg-gray-200 text-gray-700";
    const d = startOfDay(parsed);
    const today = startOfDay(new Date());
    const yesterday = startOfDay(new Date());
    yesterday.setDate(today.getDate() - 1);

    if (sameDay(d, today)) return "bg-green-200 text-green-800";
    if (sameDay(d, yesterday)) return "bg-yellow-200 text-yellow-800";
    return "bg-red-200 text-red-800";
  };

  // --- Actions ---
  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logout();
    } catch (err) {
      setLoggingOut(false);
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
      setLoading(true);
      setAgencyLastUpdates([]);
      setShowAgencyUpdates(true);

      const response = await fetch("/api/agency-last-updates")
      if (response.ok) {
        const data = await response.json()
        const filteredData = (userRole === "admin" || userRole === "viewer" || userRole === "executive")
          ? data
          : data.filter((agency: { name: string, lastUpdate: string }) => userAgencies.includes(agency.name))
        setAgencyLastUpdates(filteredData)
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

            {/* Download menu */}
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
                <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg z-50">
                  <button
                    type="button"
                    className="block w-full text-left px-4 py-2 hover:bg-blue-50"
                    onClick={() => {
                      setShowDownloadMenu(false);
                      onDownload && onDownload();
                    }}
                  >
                    Download Report
                  </button>
                  {(userRole === "admin" || userRole === "executive" || userRole === "viewer" || userRole === "agency") && (
                  <button
                    type="button"
                    className="block w-full text-left px-4 py-2 hover:bg-blue-50"
                    onClick={() => {
                      setShowDownloadMenu(false);
                      onDownloadDefaulters && onDownloadDefaulters();
                    }}
                  >
                    Top Defaulter List
                  </button>
                  )}
                </div>
              )}
            </div>

            {(userRole === "admin" || userRole === "executive" || userRole === "viewer" || userRole === "agency") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUpload}
              title="Agency Last Updates"
              disabled={loading}
            >
              <List className="h-4 w-4" />
            </Button>)}

            {userRole === "admin" && onAdminClick && (
              <Button variant="ghost" size="sm" onClick={onAdminClick} title="Admin Panel">
                <Settings className="h-4 w-4" />
              </Button>
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
        <DialogContent className="max-w-2xl rounded-xl shadow-xl">
          <DialogHeader className="border-b pb-4">
            <div className="flex items-center space-x-3">
              <Building2 className="h-6 w-6 text-blue-600" />
              <DialogTitle className="text-2xl font-bold text-gray-800">
                Agency Last Updates
              </DialogTitle>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Last update status for all agencies
            </p>
          </DialogHeader>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mb-4"></div>
              <p className="text-gray-600">Loading agency updates...</p>
            </div>
          )}

          {/* Summary Stats */}
          {!loading && agencyLastUpdates.length > 0 && (
            <>
              {/* <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {agencyLastUpdates.filter(a => {
                        const parsed = parseDate(a.lastUpdate);
                        return parsed && sameDay(startOfDay(parsed), startOfDay(new Date()));
                      }).length}
                    </div>
                    <div className="text-sm text-gray-600">Updated Today</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">
                      {agencyLastUpdates.filter(a => {
                        const parsed = parseDate(a.lastUpdate);
                        const yesterday = startOfDay(new Date());
                        yesterday.setDate(yesterday.getDate() - 1);
                        return parsed && sameDay(startOfDay(parsed), yesterday);
                      }).length}
                    </div>
                    <div className="text-sm text-gray-600">Updated Yesterday</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">
                      {agencyLastUpdates.filter(a => {
                        const parsed = parseDate(a.lastUpdate);
                        const twoDaysAgo = startOfDay(new Date());
                        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
                        return parsed && parsed < twoDaysAgo;
                      }).length}
                    </div>
                    <div className="text-sm text-gray-600">Outdated</div>
                  </div>
                </div>
              </div> */}

              {/* Agency List */}
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {[...agencyLastUpdates]
                  .sort((a, b) => {
                    const dateA = parseDate(a.lastUpdate) || new Date(0);
                    const dateB = parseDate(b.lastUpdate) || new Date(0);
                    if (dateB.getTime() !== dateA.getTime()) {
                      return dateB.getTime() - dateA.getTime();
                    }

                    // If dates are equal, compare counts (highest first)
                    const countA = a.lastUpdateCount || 0;
                    const countB = b.lastUpdateCount || 0;
                    return countB - countA;

                  })
                  .map(agency => {
                    const sameDateCount = agency.lastUpdateCount || 0;
                    return (
                      <div
                        key={agency.name}
                        className={`flex items-center justify-between h-8 px-3 rounded-lg transition-all duration-200 ${getRowColor(agency.lastUpdate)}`}
                        title={
                          agency.lastUpdate
                            ? `This agency has ${sameDateCount} record(s) with ${agency.lastUpdate}`
                            : undefined
                        }
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-2 h-2 rounded-full bg-current opacity-60"></div>
                          <span className="font-medium text-gray-900">{agency.name}</span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Clock className="h-3 w-3 text-gray-400" />
                          <span className="text-sm font-medium text-gray-700">
                            {agency.lastUpdate || "No updates"}
                          </span>
                          {agency.lastUpdate && sameDateCount > 0 && (
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${getBadgeColor(agency.lastUpdate)}`}>
                              {sameDateCount}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </>
          )}

          {/* Empty state */}
          {!loading && agencyLastUpdates.length === 0 && (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg font-medium">No update data available</p>
              <p className="text-gray-400 text-sm mt-1">
                Agency update information will appear here once available
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end pt-4 border-t">
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
