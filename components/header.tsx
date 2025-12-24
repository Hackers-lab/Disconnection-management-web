"use client"

import { Button } from "@/components/ui/button"
import { logout } from "@/app/actions/auth"
import { 
  Power, 
  HomeIcon,
  User, 
  Settings, 
  Download, 
  LogOut, 
  List, 
  Building2, 
  Calendar, 
  Clock, 
  LayoutDashboard,
  MoreVertical, // New Icon for Mobile Menu
  FileDown,
  RefreshCw,
  FileSpreadsheet
} from "lucide-react"
import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AppSidebar, ViewType } from "@/components/app-sidebar"
import { useDashboard } from "@/components/dashboard-context"

// IndexedDB Helper Functions to handle caching
const DB_NAME = "DisconnectionAppDB"
const STORE_NAME = "keyval"

function openDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  } catch (error) {
    console.warn(`Error reading ${key} from cache:`, error)
    return null
  }
}

async function saveToCache(key: string, data: any) {
  try {
    const db = await openDB()
    const transaction = db.transaction(STORE_NAME, "readwrite")
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(data, key)
    await new Promise((resolve, reject) => { request.onsuccess = resolve; request.onerror = reject; });
  } catch (error) {
    console.warn(`Error saving ${key} to cache:`, error)
  }
}

interface HeaderProps {
  userRole: string
  userAgencies?: string[]
  onAdminClick?: () => void
  onDownload?: () => void
  onDownloadDefaulters?: () => void
  activeView: ViewType | "home"
  setActiveView: (view: ViewType | "home") => void
}

export function Header({ userRole, userAgencies = [], onAdminClick, onDownload, onDownloadDefaulters, activeView: propsActiveView, setActiveView: propsSetActiveView }: HeaderProps) {
  const dashboard = useDashboard()
  const setActiveView = dashboard?.setActiveView || propsSetActiveView || (() => {})
  const activeView = dashboard?.activeView || propsActiveView
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
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    try {
      setLoggingOut(true);
      await logout();
    } catch (err) {
      setLoggingOut(false);
    }
  };

  const handleGlobalRefresh = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    if (confirm("Sync fresh data from server? This will reload the page.")) {
      sessionStorage.removeItem("consumers_synced_session")
      window.location.reload()
    }
  }

  const handleUpload = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    const CACHE_KEY = "agency_updates_cache";
    setShowAgencyUpdates(true);
    setLoading(true);
    setAgencyLastUpdates([]);

    // 1. Try to load from cache first for instant UI
    try {
      const cachedData = await getFromCache<typeof agencyLastUpdates>(CACHE_KEY);
      if (cachedData && cachedData.length > 0) {
        console.log("✅ [Cache Hit] Loaded agency updates from IndexedDB");
        setAgencyLastUpdates(cachedData);
        setLoading(false); // Stop the main loader, UI is now populated
      }
    } catch (error) {
      console.warn("Could not load agency updates from cache", error);
    }

    // 2. Always fetch from network to get the latest data
    try {
      console.log("🔄 [Network] Fetching fresh agency updates...");
      const response = await fetch("/api/agency-last-updates");
      if (!response.ok) throw new Error("API request failed");
      
      const data = await response.json();
      
      // Filter based on role
      const filteredData = (userRole === "admin" || userRole === "viewer" || userRole === "executive" || userRole === "agency")
          ? data
          : data.filter((agency: { name: string, lastUpdate: string }) => userAgencies.includes(agency.name));

      // 3. Update state and cache
      setAgencyLastUpdates(filteredData);
      await saveToCache(CACHE_KEY, filteredData);
      console.log("✅ [Network] Updated agency updates and saved to cache.");

    } catch (error) {
      console.error("Error fetching fresh agency updates:", error);
      // If the fetch fails, the user will still see the cached data if available
    } finally {
      // Ensure loading is always turned off in the end
      setLoading(false);
    }
  };

  // Helper variables for permissions
  const canSeeAgencyUpdates = userRole === "admin" || userRole === "executive" || userRole === "viewer" || userRole === "agency";
  const canDownloadDefaulters = canSeeAgencyUpdates;
  const displayAgencyName = (userAgencies && userAgencies.length > 0)
    ? (userAgencies.length === 1 ? userAgencies[0] : `${userAgencies[0]} (+${userAgencies.length - 1})`)
    : null;

  return (
    <header className="bg-white shadow sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          
          {/* LEFT SIDE: Sidebar & Logo */}
          <div className="flex items-center space-x-2">
            <AppSidebar 
              isMobile={true} 
              activeView={activeView} 
              setActiveView={setActiveView} 
              userRole={userRole} 
            />
            <div 
              className="flex items-center space-x-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                setActiveView("home")
              }}
            >
              <HomeIcon className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-semibold text-gray-900 hidden xs:inline">Report</span>
            </div>
          </div>

          {/* RIGHT SIDE: Actions */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            
            {/* User Info (Icon only on mobile, Text on desktop) */}
            <div className="flex items-center space-x-2 text-sm text-gray-600 bg-gray-50 px-2 py-1.5 rounded-full border">
              <User className="h-4 w-4" />
              <span className="capitalize inline truncate max-w-[120px]">{displayAgencyName || userRole}</span>
            </div>

            {/* --- DESKTOP VIEW (Hidden on Mobile) --- */}
            <div className="hidden md:flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    setActiveView("home")
                }}
                title="Home Dashboard"
              >
                <LayoutDashboard className="h-4 w-4" />
              </Button>

              {/* Download menu */}
              <div className="relative">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    setShowDownloadMenu(!showDownloadMenu)
                  }}
                  title="Download Options"
                >
                  <Download className="h-4 w-4" />
                </Button>

                {showDownloadMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg z-50 animate-in fade-in zoom-in-95 duration-200">
                    <button
                      type="button"
                      className="block w-full text-left px-4 py-2 hover:bg-blue-50 text-sm"
                      onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                        setShowDownloadMenu(false);
                        onDownload && onDownload();
                      }}
                    >
                      Download DC List
                    </button>
                    {canDownloadDefaulters && (
                    <button
                      type="button"
                      className="block w-full text-left px-4 py-2 hover:bg-blue-50 text-sm"
                      onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
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

              {canSeeAgencyUpdates && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUpload}
                  title="Agency Last Updates"
                  disabled={loading}
                >
                  <List className="h-4 w-4" />
                </Button>
              )}

              {userRole === "admin" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    window.open("/api/sheet-redirect", "_blank")
                  }}
                  title="Edit DC List"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                </Button>
              )}

              {userRole === "admin" && onAdminClick && (
                <Button variant="ghost" size="sm" onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    onAdminClick()
                }} title="Admin Panel">
                  <Settings className="h-4 w-4" />
                </Button>
              )}

              {userRole === "admin" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGlobalRefresh}
                  title="Sync Fresh Data"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                title="Logout"
                disabled={loggingOut}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>

            {/* --- MOBILE VIEW (Dropdown Menu) --- */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                  }}>
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    setActiveView("home")
                  }}>
                    <LayoutDashboard className="mr-2 h-4 w-4" />
                    <span>Dashboard</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem onClick={() => { 
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    onDownload && onDownload() 
                  }}>
                    <Download className="mr-2 h-4 w-4" />
                    <span>Disconnection List</span>
                  </DropdownMenuItem>

                  {canDownloadDefaulters && (
                    <DropdownMenuItem onClick={() => { 
                        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                        onDownloadDefaulters && onDownloadDefaulters() 
                    }}>
                      <Download className="mr-2 h-4 w-4" />
                      <span>Top Defaulter List</span>
                    </DropdownMenuItem>
                  )}

                  {canSeeAgencyUpdates && (
                    <DropdownMenuItem onClick={handleUpload}>
                      <List className="mr-2 h-4 w-4" />
                      <span>Agency Updates</span>
                    </DropdownMenuItem>
                  )}

                {userRole === "admin" && (
                  <DropdownMenuItem onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    window.open("/api/sheet-redirect", "_blank")
                  }}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    <span>Edit DC List</span>
                  </DropdownMenuItem>
                )}

                  {userRole === "admin" && onAdminClick && (
                    <DropdownMenuItem onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                        onAdminClick()
                    }}>
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Admin Settings</span>
                    </DropdownMenuItem>
                  )}

                  {userRole === "admin" && (
                    <DropdownMenuItem onClick={handleGlobalRefresh}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      <span>Sync Fresh Data</span>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

          </div>
        </div>
      </div>

      {/* Agency Updates Dialog */}
      <Dialog open={showAgencyUpdates} onOpenChange={setShowAgencyUpdates}>
        <DialogContent className="max-w-2xl rounded-xl shadow-xl w-[95vw] sm:w-full">
          <DialogHeader className="border-b pb-4">
            <div className="flex items-center space-x-3">
              <Building2 className="h-6 w-6 text-blue-600" />
              <DialogTitle className="text-xl sm:text-2xl font-bold text-gray-800">
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

          {/* Agency List */}
          {!loading && agencyLastUpdates.length > 0 && (
            <div className="space-y-1 max-h-[40vh] overflow-y-auto pr-1">
              {[...agencyLastUpdates]
                .sort((a, b) => {
                  const dateA = parseDate(a.lastUpdate) || new Date(0);
                  const dateB = parseDate(b.lastUpdate) || new Date(0);
                  if (dateB.getTime() !== dateA.getTime()) {
                    return dateB.getTime() - dateA.getTime();
                  }
                  const countA = a.lastUpdateCount || 0;
                  const countB = b.lastUpdateCount || 0;
                  return countB - countA;
                })
                .map(agency => {
                  const sameDateCount = agency.lastUpdateCount || 0;
                  return (
                    <div
                      key={agency.name}
                      className={`flex items-center justify-between p-2 rounded-lg transition-all duration-200 border ${getRowColor(agency.lastUpdate)}`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-current opacity-60 flex-shrink-0"></div>
                        <span className="font-medium text-gray-900 truncate text-sm sm:text-base">{agency.name}</span>
                      </div>

                      <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                        <Clock className="h-3 w-3 text-gray-500" />
                        <span className="text-xs sm:text-sm font-medium text-gray-700">
                          {agency.lastUpdate || "No updates"}
                        </span>
                        {agency.lastUpdate && sameDateCount > 0 && (
                          <span className={`text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded-full ${getBadgeColor(agency.lastUpdate)}`}>
                            {sameDateCount}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}

          {/* Empty state */}
          {!loading && agencyLastUpdates.length === 0 && (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg font-medium">No update data available</p>
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white bg-opacity-80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
            <p className="text-lg font-medium text-gray-700">Logging out...</p>
          </div>
        </div>
      )}
    </header>
  )
}