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
  FileSpreadsheet,
  FileText
} from "lucide-react"
import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { getAgencyDescription } from "@/app/actions/agency-details"

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
  const [showReportDialog, setShowReportDialog] = useState(false)
  const [reportDateRange, setReportDateRange] = useState({
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  })
  const [reportAgency, setReportAgency] = useState<string>("All Agencies")
  const [availableAgencies, setAvailableAgencies] = useState<string[]>(["All Agencies"])
  const [cachedAgencyDescription, setCachedAgencyDescription] = useState<string | null>(null)

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

  // Fetch agencies for admin report selector
  useEffect(() => {
    if (userRole === "admin" && showReportDialog) {
      const loadAgencies = async () => {
        // 1. Try Cache first for immediate display
        try {
          const cached = await getFromCache<string[]>("agencies_data_cache")
          if (cached && Array.isArray(cached)) {
            setAvailableAgencies(["All Agencies", ...cached])
          }
        } catch (e) { /* ignore cache error */ }

        // 2. Fetch Fresh from API
        try {
          const res = await fetch("/api/admin/agencies")
          if (res.ok) {
            const data = await res.json()
            if (Array.isArray(data)) {
              const names = data.filter((a: any) => a.isActive === true || String(a.isActive).toLowerCase() === 'true').map((a: any) => a.name)
              setAvailableAgencies(["All Agencies", ...names])
            }
          }
        } catch (e) { console.warn("Failed to fetch agencies", e) }
      }
      loadAgencies()
    }
  }, [userRole, showReportDialog])

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

  const handleGenerateReport = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    setLoading(true)
    try {
      // Fetch Agency Description
      const targetAgency = userRole === "admin" ? reportAgency : (userAgencies.length === 1 ? userAgencies[0] : "All Agencies")
      const agencyDescriptions: Record<string, string> = {}
      
      if (targetAgency === "All Agencies") {
          try {
             const res = await fetch("/api/admin/agencies")
             if (res.ok) {
                 const data = await res.json()
                 data.forEach((a: any) => {
                     if (a.name) agencyDescriptions[a.name] = a.description || "Disconnection & Recovery Services"
                 })
             }
          } catch (e) { console.warn("Could not fetch agency descriptions", e) }
      } else {
          try {
              const desc = await getAgencyDescription(targetAgency)
              if (desc) agencyDescriptions[targetAgency] = desc
          } catch (e) { console.warn(e) }
      }

      const cachedData = await getFromCache<any[]>("consumers_data_cache") || []
      
      const fromDate = new Date(reportDateRange.from)
      fromDate.setHours(0, 0, 0, 0)
      const toDate = new Date(reportDateRange.to)
      toDate.setHours(23, 59, 59, 999)

      const filtered = cachedData.filter(item => {
        // Agency Check
        if (targetAgency !== "All Agencies" && item.agency !== targetAgency) return false
        if (userRole !== "admin" && targetAgency === "All Agencies") {
             if (userAgencies.length > 0 && !userAgencies.includes(item.agency)) return false
        }
        
        if (!item.disconDate) return false
        
        // Parse Date (DD-MM-YYYY or YYYY-MM-DD)
        let d = null
        if (item.disconDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
            const [day, month, year] = item.disconDate.split('-').map(Number)
            d = new Date(year, month - 1, day)
        } else if (item.disconDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            d = new Date(item.disconDate)
        }
        
        if (!d || isNaN(d.getTime())) return false
        
        return d >= fromDate && d <= toDate
      }).sort((a, b) => {
         // Sort Old to New
         const parse = (dateStr: string) => {
             if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
                 const [day, month, year] = dateStr.split('-').map(Number)
                 return new Date(year, month - 1, day).getTime()
             }
             return new Date(dateStr).getTime()
         }
         return parse(a.disconDate) - parse(b.disconDate)
      })

      if (filtered.length === 0) {
          alert("No records found for this date range.")
          setLoading(false)
          return
      }

      // Group by Agency
      const groupedData: Record<string, any[]> = {}
      filtered.forEach(item => {
          const agency = item.agency || "Unknown Agency"
          if (!groupedData[agency]) groupedData[agency] = []
          groupedData[agency].push(item)
      })

      const agencyKeys = Object.keys(groupedData).sort()

      // Helper for summary
      const generateSummary = (items: any[]) => {
          const stats: Record<string, { count: number; amount: number }> = {}
          let total = 0
          items.forEach(item => {
            const status = item.disconStatus || "Unknown"
            if (!stats[status]) stats[status] = { count: 0, amount: 0 }
            const amount = parseFloat(String(item.d2NetOS || "0").replace(/,/g, "")) || 0
            stats[status].count++
            stats[status].amount += amount
            total += amount
          })
          return { stats, total }
      }

      // Print Window
      const printWindow = window.open('', '_blank')
      if (!printWindow) {
          alert("Pop-up blocked. Please allow pop-ups.")
          setLoading(false)
          return
      }

      const reportContent = agencyKeys.map((agencyName, index) => {
          const items = groupedData[agencyName].sort((a, b) => {
             const parse = (dateStr: string) => {
                 if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
                     const [day, month, year] = dateStr.split('-').map(Number)
                     return new Date(year, month - 1, day).getTime()
                 }
                 return new Date(dateStr).getTime()
             }
             return parse(a.disconDate) - parse(b.disconDate)
          })
          
          const { stats, total } = generateSummary(items)
          const desc = agencyDescriptions[agencyName] || "Disconnection & Recovery Services"
          const isLast = index === agencyKeys.length - 1

          const formatDate = (d: string) => {
             if (!d) return ""
             if (d.match(/^\d{4}-\d{2}-\d{2}$/)) {
                 const [y, m, day] = d.split('-')
                 return `${day}.${m}.${y}`
             }
             return d.replace(/-/g, '.')
          }

          return `
            <div class="report-page ${!isLast ? 'page-break' : ''}">
                <div class="header">
                  <div class="report-title">DAILY DISCONNECTION REPORT</div>
                  <h1>${agencyName}</h1>
                  <h2>${desc}</h2>
                </div>
                
                <div class="meta">
                  <div><strong>Date Range:</strong> ${formatDate(reportDateRange.from)} to ${formatDate(reportDateRange.to)}</div>
                  <div><strong>Total Records:</strong> ${items.length}</div>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th style="width: 30px;">#</th>
                      <th>Consumer ID</th>
                      <th>Name</th>
                      <th style="text-align: right;">OSD (₹)</th>
                      <th>Status</th>
                      <th style="width: 70px;">Date</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${items.map((item, i) => `
                      <tr>
                        <td>${i + 1}</td>
                        <td>${item.consumerId}</td>
                        <td>${item.name}</td>
                        <td style="text-align: right;">${Number(item.d2NetOS).toLocaleString()}</td>
                        <td>${item.disconStatus}</td>
                        <td>${formatDate(item.disconDate)}</td>
                        <td>${item.notes || ''}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>

                <div class="summary-section">
                  <h3 style="font-size: 11px; margin-bottom: 10px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Status Summary</h3>
                  <table class="summary-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        ${Object.keys(stats).sort().map(status => `<th class="text-right" style="text-transform: capitalize;">${status}</th>`).join('')}
                        <th class="text-right" style="font-weight: 800;">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><strong>Count</strong></td>
                        ${Object.keys(stats).sort().map(status => `
                          <td class="text-right">${stats[status].count}</td>
                        `).join('')}
                        <td class="text-right" style="font-weight: 800;">${items.length}</td>
                      </tr>
                      <tr>
                        <td><strong>Amount</strong></td>
                        ${Object.keys(stats).sort().map(status => `
                          <td class="text-right">${stats[status].amount.toLocaleString()}</td>
                        `).join('')}
                        <td class="text-right" style="font-weight: 800;">${total.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="footer">
                  <div>
                    <p>Generated on: ${new Date().toLocaleString()}</p>
                  </div>
                  <div class="stamp-area">
                    <div class="stamp-box">Stamp</div>
                    <p><strong>Authorised Signatory</strong></p>
                  </div>
                </div>
            </div>
          `
      }).join('')

      printWindow.document.write(`
        <html>
          <head>
            <title>Daily Disconnection Report</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
            <style>
              body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
              .report-page { margin-bottom: 40px; }
              .page-break { page-break-after: always; }
              .header { text-align: center; margin-bottom: 40px; }
              .header h1 { font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin: 10px 0 0; color: #000; }
              .header h2 { font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px; margin: 5px 0 0; color: #666; }
              .report-title { text-align: center; font-size: 16px; font-weight: 700; text-transform: uppercase; text-decoration: underline; text-underline-offset: 4px; margin: 0; letter-spacing: 1px; border: none; padding: 0; }
              .meta { font-size: 10px; margin-bottom: 20px; color: #555; }
              .meta div { margin-bottom: 3px; }
              
              /* Clean Table Styles (Matching Summary) */
              table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 20px; border-top: 2px solid #000; }
              th { text-align: left; border: none; border-bottom: 1px solid #ccc; background: transparent; padding: 8px 4px; font-weight: 700; text-transform: uppercase; color: #000; white-space: nowrap; }
              td { border: none; border-bottom: 1px solid #eee; padding: 8px 4px; vertical-align: top; color: #444; }
              
              .text-right { text-align: right; }
              .summary-section { margin-top: 30px; page-break-inside: avoid; }
              .summary-table { width: auto; min-width: 50%; }
              
              .footer { margin-top: 60px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 10px; color: #666; }
              .stamp-area { text-align: center; }
              .stamp-box { width: 120px; height: 60px; border: 1px dashed #ccc; margin-bottom: 5px; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 9px; }
              @media print {
                @page { size: A4 portrait; margin: 10mm; }
                .no-print { display: none; }
                .page-break { page-break-after: always; }
              }
            </style>
          </head>
          <body>
            <div id="report-content">
              ${reportContent}
            </div>
            <script>
              window.onload = function() { 
                const element = document.getElementById('report-content');
                const opt = {
                  margin: 10,
                  filename: 'Daily_Disconnection_Report.pdf',
                  image: { type: 'jpeg', quality: 0.98 },
                  html2canvas: { scale: 2 },
                  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };
                html2pdf().set(opt).from(element).save();
              }
            </script>
          </body>
        </html>
      `)
      printWindow.document.close()

    } catch (e) {
      console.error(e)
      alert("Failed to generate report")
    } finally {
      setLoading(false)
      setShowReportDialog(false)
    }
  }

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
                    <button
                      type="button"
                      className="block w-full text-left px-4 py-2 hover:bg-blue-50 text-sm"
                      onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                        setShowDownloadMenu(false);
                        setShowReportDialog(true);
                      }}
                    >
                      Daily Report (PDF)
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
                  <DropdownMenuLabel>Downloads</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
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

                  <DropdownMenuItem onClick={() => setShowReportDialog(true)}>
                    <Download className="mr-2 h-4 w-4" />
                    <span>Daily Report</span>
                  </DropdownMenuItem>

                  {canSeeAgencyUpdates && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Updates</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleUpload}>
                        <List className="mr-2 h-4 w-4" />
                        <span>Agency Updates</span>
                      </DropdownMenuItem>
                    </>
                  )}

                  {userRole === "admin" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Admin</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                        window.open("/api/sheet-redirect", "_blank")
                      }}>
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        <span>Edit DC List</span>
                      </DropdownMenuItem>

                      {onAdminClick && (
                        <DropdownMenuItem onClick={() => {
                            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                            onAdminClick()
                        }}>
                          <Settings className="mr-2 h-4 w-4" />
                          <span>Admin Settings</span>
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuItem onClick={handleGlobalRefresh}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        <span>Sync Fresh Data</span>
                      </DropdownMenuItem>
                    </>
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

      {/* Daily Report Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="max-w-md rounded-xl">
            <DialogHeader>
                <DialogTitle>Generate Daily Report</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                {userRole === "admin" && (
                  <div className="space-y-2">
                    <Label>Select Agency</Label>
                    <Select value={reportAgency} onValueChange={setReportAgency}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Agency" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableAgencies.map((agency) => (
                          <SelectItem key={agency} value={agency}>{agency}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>From Date</Label>
                        <Input type="date" value={reportDateRange.from} onChange={(e) => setReportDateRange({...reportDateRange, from: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                        <Label>To Date</Label>
                        <Input type="date" value={reportDateRange.to} onChange={(e) => setReportDateRange({...reportDateRange, to: e.target.value})} />
                    </div>
                </div>
                <Button onClick={handleGenerateReport} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
                    {loading ? "Generating..." : "Print Report"}
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