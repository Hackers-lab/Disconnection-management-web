"use client"

import { Button } from "@/components/ui/button"
import { logout } from "@/app/actions/auth"
import { Power, User, Settings, Download, LogOut, Upload, List } from "lucide-react"
import { useState, useMemo } from "react"
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
  const [agencyLastUpdates, setAgencyLastUpdates] = useState<{name: string, lastUpdate: string; lastUpdateCount: number}[]>([])
  const [loading, setLoading] = useState(false)
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Add this helper inside Header component
  // Helper for parsing dd-mm-yyyy to Date
  // Helper for parsing dd-mm-yyyy to a local Date at 00:00
  const parseDate = (dateStr: string) => {
    if (!dateStr) return null;
    const parts = dateStr.split("-");
    if (parts.length !== 3) return null;
    const [day, month, year] = parts.map(p => parseInt(p, 10));
    const d = new Date(year, month - 1, day); // local midnight
    return isNaN(d.getTime()) ? null : d;
  };

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const getRowColor = (dateStr: string) => {
    const parsed = parseDate(dateStr);
    if (!parsed) return "bg-gray-200";

    const d = startOfDay(parsed);
    const today = startOfDay(new Date());
    const yesterday = startOfDay(new Date());
    yesterday.setDate(today.getDate() - 1);

    if (sameDay(d, today)) return "bg-green-300";
    if (sameDay(d, yesterday)) return "bg-yellow-300";
    return "bg-red-300";
  };

  // Key like YYYY-MM-DD in LOCAL time for consistent counting
  const dateKey = (dateStr: string) => {
    const d = parseDate(dateStr);
    if (!d) return "invalid";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const dateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of agencyLastUpdates) {
      const key = dateKey(a.lastUpdate);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [agencyLastUpdates]);

  // --- NEW: per-agency same-date count ---
  const getSameDateCountForAgency = (agency: any) => {
    const key = dateKey(agency?.lastUpdate);
    if (!key) return 0;

    // If your data already has a count for this date, use it:
    if (typeof agency?.lastUpdateCount === "number") return agency.lastUpdateCount;
    if (agency?.dateCounts && typeof agency.dateCounts[key] === "number") return agency.dateCounts[key];
    if (agency?.stats && typeof agency.stats[key] === "number") return agency.stats[key];

    // Otherwise, derive it from per-agency records (pick what you have):
    const pool: string[] = [];

    if (Array.isArray(agency?.updates)) {
      // e.g., ["20-08-2025", "20-08-2025", "19-08-2025"]
      pool.push(...agency.updates.filter(Boolean));
    }

    if (Array.isArray(agency?.logs)) {
      // e.g., [{date:"20-08-2025"}, {date:"20-08-2025"}] or {lastUpdate:"..."}
      pool.push(
        ...agency.logs
          .map((x: any) => x?.date || x?.lastUpdate)
          .filter(Boolean)
      );
    }

    if (Array.isArray(agency?.consumers)) {
      // e.g., consumers with lastUpdate per consumer
      pool.push(
        ...agency.consumers
          .map((c: any) => c?.lastUpdate)
          .filter(Boolean)
      );
    }

    if (pool.length === 0) {
      // We at least know the agency has this lastUpdate date once
      return agency?.lastUpdate ? 1 : 0;
    }

    return pool.reduce((acc, d) => (dateKey(d) === key ? acc + 1 : acc), 0);
  };



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
        const filteredData = (userRole === "admin" || userRole === "viewer" || userRole === "executive")
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
                  {(userRole === "admin" || userRole === "executive" || userRole === "viewer") && (
                  <button
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100"
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
            {(userRole === "admin" || userRole === "executive" || userRole === "viewer") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUpload}
              title="Agency Last Updates"
              disabled={loading}
            >
              <List className="h-4 w-4" />
            </Button>)}
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
              [...agencyLastUpdates]  // clone before sorting
                .sort((a, b) => {
                  const dateA = parseDate(a.lastUpdate) || new Date(0);
                  const dateB = parseDate(b.lastUpdate) || new Date(0);
                  return dateB.getTime() - dateA.getTime(); // newest first
                })
                .map(agency => {
                  const rowColor = getRowColor(agency.lastUpdate);
                  //const sameDateCount = getSameDateCountForAgency(agency);
                  const sameDateCount = agency.lastUpdateCount || 0;

                  return (
                    <div
                      key={agency.name}
                      className={`flex justify-between items-center border-b pb-2 px-2 rounded ${rowColor}`}
                      title={
                        agency.lastUpdate
                          ? `This agency has ${sameDateCount} record(s) with ${agency.lastUpdate}`
                          : undefined
                      }
                    >
                      <span className="font-medium">{agency.name}</span>

                      <span className="text-sm flex items-center gap-2">
                        {agency.lastUpdate || "No updates recorded"}
                
                        {/* Show badge only when there's meaningful count */}
                        {agency.lastUpdate && sameDateCount > 0 && (
                          <span className="text-xs bg-black/10 rounded-full px-2 py-0.5">
                            {sameDateCount}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })
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