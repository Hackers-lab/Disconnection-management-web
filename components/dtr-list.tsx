"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import { DTRInspectionForm } from "@/components/dtr-inspection-form"
import type { DTRRecord } from "@/lib/dtr-service"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
// @ts-ignore
import Papa from "papaparse"
import {
  Search,
  Filter,
  RadioTower,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Brush,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Upload,
  ArrowLeft,
  MoreVertical,
  RefreshCw,
  Eye,
  History,
  TrendingUp,
  Building2,
  X,
  Camera,
  SlidersHorizontal
} from "lucide-react"

import { NearbyDtrMap } from "@/components/nearby-dtr-map"

interface Props {
  userRole: string
  userAgencies: string[]
  username: string
  agencies: string[]
  permissions?: Record<string, string[]>
}

type TabType = "all" | "pending" | "completed"
type SyncState = "idle" | "loading" | "updated"
const CACHE_KEY = "dtr_data_cache"

interface DTRHistoryEntry {
  timestamp: string
  dtrCode: string
  feederName: string
  painting: string
  kiosk: string
  la: string
  ne: string
  loadCurrents: string
  verifiedBy: string
  remarks: string
  imageUrl: string
  locationName: string
}

export function DTRList({ userRole, userAgencies = [], username, agencies = [], permissions }: Props) {
  const { toast } = useToast()
  const [records, setRecords] = useState<DTRRecord[]>([])
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [tab, setTab] = useState<TabType>("pending")
  const [search, setSearch] = useState("")
  const [selectedFeeder, setSelectedFeeder] = useState<string>("all")
  const [selectedPainting, setSelectedPainting] = useState<string>("all")
  const [showFilters, setShowFilters] = useState(false)
  const [showMap, setShowMap] = useState(false)
  
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedDtr, setSelectedDtr] = useState<DTRRecord | null>(null)
  const [viewingDtr, setViewingDtr] = useState<DTRRecord | null>(null)
  const [dtrHistory, setDtrHistory] = useState<DTRHistoryEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showAgencyReport, setShowAgencyReport] = useState(false)
  const csvInputRef = useRef<HTMLInputElement>(null)
  
  const PAGE_SIZE = 15
  // Painters can edit/inspected their painting status and photo uploads
  const isEditable = userRole === "admin" || userRole === "painter" || (permissions && permissions.dtr?.includes("update"))
  const canUpload = userRole === "admin" || (permissions && permissions.dtr?.includes("create"))
  const isAdmin = userRole === "admin"
  const isExecutive = userRole === "executive"
  const isViewer = userRole === "viewer"
  const isRestricted = !isAdmin && !isExecutive && !isViewer

  const downloadTemplate = () => {
    const headers = [
      "DTR Code", "Feeder Name", "Location Name", "KV Capacity", "STATUS",
      "ACTUAL FEEDER", "ACTUAL RATING", "ACTUAL LOCATION", "SUPPLY OFFICE", "LATLONG",
      "LONG", "IMAGE", "Painting Agency", "Audit Agency"
    ]
    const csvContent = headers.join(",") + "\n" +
      "7G07D,HARISHCHANDRAPUR,ISMAILPUR,63,EXIST,HARISHCHANDRAPUR,63,Ismailpur anganwari,KUSHIDA,\"25.452202, 88.021090\",,all dtr 2_Images/7G07D.jpg,Agency A,Agency B\n"
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.setAttribute("download", "dtr_upload_template.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleCsvUpload = (file: File) => {
    setUploading(true)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: any) => {
        try {
          const rows = results.data.map((row: any) => ({
            dtrCode: (row["DTR Code"] || row["dtrCode"] || "").toString().trim(),
            feederName: (row["Feeder Name"] || row["feederName"] || "").toString().trim(),
            locationName: (row["Location Name"] || row["locationName"] || "").toString().trim(),
            kvCapacity: (row["KV Capacity"] || row["kvCapacity"] || "").toString().trim(),
            status: (row["STATUS"] || row["status"] || "").toString().trim(),
            actualFeeder: (row["ACTUAL FEEDER"] || row["actualFeeder"] || "").toString().trim(),
            actualRating: (row["ACTUAL RATING"] || row["actualRating"] || "").toString().trim(),
            actualLocation: (row["ACTUAL LOCATION"] || row["actualLocation"] || "").toString().trim(),
            supplyOffice: (row["SUPPLY OFFICE"] || row["supplyOffice"] || "").toString().trim(),
            latlong: (row["LATLONG"] || row["latlong"] || "").toString().trim(),
            long: (row["LONG"] || row["long"] || "").toString().trim(),
            image: (row["IMAGE"] || row["image"] || "").toString().trim(),
            paintingAgency: (row["Painting Agency"] || row["paintingAgency"] || "").toString().trim(),
            auditAgency: (row["Audit Agency"] || row["auditAgency"] || "").toString().trim(),
          })).filter((r: any) => r.dtrCode)

          if (rows.length === 0) {
            alert("No valid rows found in the CSV. Make sure DTR Code is present.")
            setUploading(false)
            return
          }

          const res = await fetch("/api/dtr", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows }),
          })

          const data = await res.json()
          if (!res.ok) throw new Error(data.error || "Failed to upload")

          toast({
            title: "Import Successful",
            description: `Successfully imported ${data.count} distribution transformers.`,
          })
          setShowUpload(false)
          load()
        } catch (e: any) {
          alert(e.message || "Failed to process CSV file.")
        } finally {
          setUploading(false)
        }
      },
      error: (err: any) => {
        alert("Error parsing CSV: " + err.message)
        setUploading(false)
      }
    })
  }

  const load = async (silent = false) => {
    if (!silent) setSyncState("loading")
    try {
      // 1. Load from IndexedDB instantly
      const cached = await getFromCache<DTRRecord[]>(CACHE_KEY)
      if (cached && cached.length > 0) {
        setRecords(cached)
        if (!silent) setSyncState("idle")
      }
      
      // 2. Fetch fresh data from backend
      const res = await fetch("/api/dtr")
      if (!res.ok) throw new Error()
      const data: DTRRecord[] = await res.json()
      setRecords(data)
      await saveToCache(CACHE_KEY, data)
      setSyncState("updated")
      setTimeout(() => setSyncState("idle"), 2500)
    } catch (e) {
      setSyncState("idle")
      if (!silent) {
        toast({
          title: "Failed to load DTR list",
          description: "Could not fetch data from Google Sheets.",
          variant: "destructive"
        })
      }
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Listen to actions dispatched from global header
  useEffect(() => {
    const handleAction = (e: Event) => {
      const customEvent = e as CustomEvent
      if (customEvent.detail?.action === "upload") {
        setShowUpload(true)
      } else if (customEvent.detail?.action === "refresh") {
        load()
      }
    }
    window.addEventListener("dtr-action", handleAction)
    return () => window.removeEventListener("dtr-action", handleAction)
  }, [])

  // Load history logs whenever a DTR is selected for viewing
  useEffect(() => {
    async function getHistory() {
      if (!viewingDtr) return
      setLoadingHistory(true)
      setDtrHistory([])
      try {
        const resp = await fetch(`/api/dtr/history?dtrCode=${encodeURIComponent(viewingDtr.dtrCode)}`)
        if (resp.ok) {
          const list = await resp.json()
          setDtrHistory(list)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingHistory(false)
      }
    }
    getHistory()
  }, [viewingDtr])

  // Unique list of feeders for selecting/filtering
  const feeders = useMemo(() => {
    const set = new Set<string>()
    records.forEach(r => {
      if (r.feederName) set.add(r.feederName.trim().toUpperCase())
    })
    return Array.from(set).sort()
  }, [records])

  // Stats computation
  const stats = useMemo(() => {
    let list = records
    
    // If restricted user, only calculate stats of their assigned DTRs
    if (isRestricted && userAgencies.length > 0) {
      list = list.filter(r => 
        userAgencies.some(ag => (r.auditAgency || "").toLowerCase().trim() === ag.toLowerCase().trim())
      )
    }

    const total = list.length
    const completed = list.filter(r => (r.status || "").toUpperCase() === "EXIST").length
    const pending = total - completed
    const paintingDone = list.filter(r => (r.painting || "").toLowerCase() === "done").length
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0
    const paintingProgress = total > 0 ? Math.round((paintingDone / total) * 100) : 0
    return { total, completed, pending, paintingDone, progress, paintingProgress }
  }, [records, isRestricted, userAgencies])

  // Filtering
  const filtered = useMemo(() => {
    let result = records

    // If user is restricted, filter list so they only see DTRs assigned to their agency
    if (isRestricted && userAgencies.length > 0) {
      result = result.filter(r => 
        userAgencies.some(ag => (r.auditAgency || "").toLowerCase().trim() === ag.toLowerCase().trim())
      )
    }
    
    // Status Tab Filter
    if (tab === "pending") {
      result = result.filter(r => (r.status || "").toUpperCase() !== "EXIST")
    } else if (tab === "completed") {
      result = result.filter(r => (r.status || "").toUpperCase() === "EXIST")
    }

    // Feeder Filter
    if (selectedFeeder !== "all") {
      result = result.filter(r => (r.feederName || "").trim().toUpperCase() === selectedFeeder)
    }

    // Painting Filter
    if (selectedPainting !== "all") {
      result = result.filter(r => (r.painting || "").trim().toLowerCase() === selectedPainting.toLowerCase())
    }

    // Search Query
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(r =>
        r.dtrCode.toLowerCase().includes(q) ||
        r.feederName.toLowerCase().includes(q) ||
        r.locationName.toLowerCase().includes(q) ||
        (r.paintingAgency || "").toLowerCase().includes(q) ||
        r.supplyOffice.toLowerCase().includes(q)
      )
    }

    return result;
  }, [records, tab, selectedFeeder, selectedPainting, search, isRestricted, userAgencies])

  // Agency report counts (Admin Only)
  const agencyStats = useMemo(() => {
    const map: Record<string, { total: number; done: number; pending: number }> = {}
    
    records.forEach(r => {
      const ag = r.paintingAgency ? r.paintingAgency.trim() : "Unassigned"
      if (!map[ag]) {
        map[ag] = { total: 0, done: 0, pending: 0 }
      }
      map[ag].total++
      if ((r.painting || "").toLowerCase() === "done") {
        map[ag].done++
      } else {
        map[ag].pending++
      }
    })

    return Object.entries(map).map(([agencyName, count]) => ({
      agency: agencyName,
      ...count,
      pct: count.total > 0 ? Math.round((count.done / count.total) * 100) : 0
    })).sort((a, b) => b.pct - a.pct)
  }, [records])

  // Pagination
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, currentPage])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, tab, selectedFeeder, selectedPainting])

  if (selectedDtr) {
    return (
      <DTRInspectionForm
        dtr={selectedDtr}
        userRole={userRole}
        username={username}
        feeders={feeders}
        onSave={() => {
          setSelectedDtr(null)
          load(true)
          toast({
            title: "Verification Saved",
            description: `DTR ${selectedDtr.dtrCode} inspection updated successfully.`
          })
        }}
        onCancel={() => setSelectedDtr(null)}
      />
    )
  }

  if (showUpload) {
    return (
      <div className="max-w-xl mx-auto space-y-6 pb-28">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setShowUpload(false)} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Upload DTR Data</h1>
            <p className="text-sm text-gray-500">Import Distribution Transformers via CSV</p>
          </div>
        </div>

        <Card className="border shadow-sm">
          <CardContent className="p-6 space-y-6">
            
            {/* Step 1: Download Template */}
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-800">1. Download Template</h3>
              <p className="text-sm text-gray-500">
                Download the CSV template containing all the required columns for distribution transformers.
              </p>
              <Button type="button" variant="outline" onClick={downloadTemplate} className="h-11 rounded-xl">
                <Upload className="h-4 w-4 mr-1.5" />
                Download Template CSV
              </Button>
            </div>

            {/* Step 2: Upload File */}
            <div className="space-y-2 pt-4 border-t">
              <h3 className="font-semibold text-gray-800">2. Select CSV File</h3>
              <p className="text-sm text-gray-500">
                Upload your DTR list file. **WARNING:** This will replace the entire DTR list in the sheet.
              </p>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleCsvUpload(file)
                }}
              />
              <Button 
                type="button" 
                onClick={() => csvInputRef.current?.click()} 
                disabled={uploading}
                className="w-full h-14 bg-indigo-600 hover:bg-indigo-750 text-white rounded-2xl border-2 border-dashed border-indigo-200"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Uploading & Processing...
                  </>
                ) : (
                  <>
                    <Upload className="h-5 w-5 mr-2" />
                    Select CSV File
                  </>
                )}
              </Button>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t flex justify-end">
              <Button type="button" variant="ghost" onClick={() => setShowUpload(false)} disabled={uploading}>
                Cancel
              </Button>
            </div>

          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 md:px-8 pb-20">
      
      {/* Top Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">DTR Verification</h1>
          <Badge variant="outline" className="bg-white border-gray-200 py-1 px-2.5">
            {syncState === "loading" && <Loader2 className="h-3 w-3 animate-spin mr-1.5 text-blue-600" />}
            {syncState === "updated" && <CheckCircle2 className="h-3 w-3 mr-1.5 text-green-600" />}
            {syncState === "idle" && <div className="h-1.5 w-1.5 rounded-full bg-gray-400 mr-2" />}
            {syncState === "loading" ? "Syncing..." : syncState === "updated" ? "Updated" : "Idle"}
          </Badge>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm space-y-4">
        {/* Row 1: Search and Filters toggle button */}
        <div className="flex gap-3">
          <div className="relative flex-grow">
            <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search Code, Feeder, Landmark, Agency..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-11 rounded-xl bg-white border-slate-200"
            />
          </div>

          <Button
            variant={showFilters ? "default" : "outline"}
            onClick={() => setShowFilters(!showFilters)}
            className={`h-11 w-11 p-0 rounded-xl flex items-center justify-center ${
              showFilters 
                ? "bg-slate-900 text-white hover:bg-slate-800" 
                : "text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
            title="Toggle Filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {/* Row 2: Collapsible Filters */}
        {showFilters && (
          <div className="flex gap-3 pt-3 border-t border-slate-100 flex-wrap animate-in slide-in-from-top-2 duration-200">
            {/* Status Select */}
            <div className="flex flex-col gap-1 w-full sm:w-48">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Audit Status</span>
              <Select value={tab} onValueChange={(val: any) => { setTab(val); setShowMap(false); }}>
                <SelectTrigger className="h-10 rounded-xl bg-white border-slate-200 text-xs font-semibold">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Transformers</SelectItem>
                  <SelectItem value="pending">Pending Audit</SelectItem>
                  <SelectItem value="completed">Verified DTRs</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Feeder Select */}
            <div className="flex flex-col gap-1 w-full sm:w-48">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Feeder Name</span>
              <Select value={selectedFeeder} onValueChange={setSelectedFeeder}>
                <SelectTrigger className="h-10 rounded-xl bg-white border-slate-200 text-xs font-semibold">
                  <SelectValue placeholder="All Feeders" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Feeders</SelectItem>
                  {feeders.map(f => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Painting Select */}
            <div className="flex flex-col gap-1 w-full sm:w-48">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Painting Status</span>
              <Select value={selectedPainting} onValueChange={setSelectedPainting}>
                <SelectTrigger className="h-10 rounded-xl bg-white border-slate-200 text-xs font-semibold">
                  <SelectValue placeholder="Painting Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Painting</SelectItem>
                  <SelectItem value="Done">Done</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Row 3: Locate Nearby DTR Button */}
        <Button
          type="button"
          onClick={() => setShowMap(!showMap)}
          className={`w-full h-12 rounded-xl font-extrabold flex items-center justify-center gap-2 text-sm shadow-md transition-all duration-300 transform hover:scale-[1.01] bg-gradient-to-r from-blue-600 to-indigo-650 hover:from-blue-700 hover:to-indigo-750 text-white`}
        >
          <MapPin className="h-4.5 w-4.5 animate-bounce" />
          {showMap ? "Hide Navigation Radar" : "Locate Nearby DTR"}
        </Button>

        {/* Row 4: Compact Progress Bar */}
        <div className="pt-3 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="font-semibold text-slate-700">Audit Progress:</span>
            <span className="font-bold text-slate-900">{stats.completed}</span>
            <span>of</span>
            <span className="font-bold text-slate-900">{stats.total}</span>
            <span>completed ({stats.progress}%)</span>
          </div>
          <div className="w-full sm:w-64 bg-slate-100 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-blue-600 h-full rounded-full transition-all duration-500" 
              style={{ width: `${stats.progress}%` }} 
            />
          </div>
        </div>

      </div>

      {/* Main List */}
      {paginated.length === 0 ? (
        <div className="bg-white border rounded-2xl py-20 text-center text-gray-400">
          <RadioTower className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-base font-medium">No distribution transformers match your filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginated.map(r => {
            const isVerified = (r.status || "").toUpperCase() === "EXIST"
            const isPainted = (r.painting || "").toLowerCase() === "done"
            
            return (
              <Card 
                key={r.dtrCode} 
                className={`overflow-hidden hover:shadow-md transition-shadow relative border flex flex-col justify-between ${
                  isVerified ? "border-green-150" : "border-gray-200"
                }`}
              >
                <div>
                  {/* Visual Status Indicator */}
                  <div className={`h-1 w-full absolute top-0 left-0 ${isVerified ? "bg-green-500" : "bg-red-400"}`} />

                  <CardHeader className="pb-2 p-5 flex flex-row items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] text-gray-400 uppercase tracking-widest font-mono font-semibold">DTR CODE</span>
                      <h3 className="font-bold font-mono text-gray-900 text-lg leading-tight truncate">{r.dtrCode}</h3>
                      <p className="text-xs text-gray-500 mt-1 truncate">{r.feederName}</p>
                    </div>
                    
                    {isVerified ? (
                      <Badge className="bg-green-50 text-green-700 hover:bg-green-50 border border-green-200 font-medium rounded-lg">
                        Verified
                      </Badge>
                    ) : (
                      <Badge className="bg-red-50 text-red-700 hover:bg-red-50 border border-red-200 font-medium rounded-lg">
                        Pending Audit
                      </Badge>
                    )}
                  </CardHeader>

                  <CardContent className="px-5 pb-5 pt-0 space-y-3 text-xs">
                    {/* Landmark */}
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-gray-400 uppercase tracking-wider font-semibold">Landmark / Location</span>
                      <p className="text-xs text-gray-700 line-clamp-1" title={r.locationName}>
                        {r.locationName || "—"}
                      </p>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-x-2 gap-y-2 border-t pt-2.5">
                      <div>
                        <span className="text-gray-400 block text-[9px]">Rating Capacity</span>
                        <strong className="text-gray-800 font-semibold">{r.kvCapacity ? `${r.kvCapacity} kVA` : "—"}</strong>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[9px]">Painting Agency</span>
                        <strong className="text-gray-800 font-semibold truncate block" title={r.paintingAgency}>{r.paintingAgency || "—"}</strong>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[9px]">Painting Status</span>
                        <span className={`inline-flex items-center gap-1 font-semibold ${isPainted ? "text-green-600" : "text-orange-600"}`}>
                          <Brush className="h-3 w-3" />
                          {isPainted ? "Completed" : "Pending"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[9px]">GPS Coordinates</span>
                        {r.latlong ? (
                          <span className="text-gray-700 font-mono text-[10px] truncate block" title={r.latlong}>
                            {r.latlong}
                          </span>
                        ) : (
                          <span className="text-red-500 font-medium">Missing GPS</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </div>

                <div className="px-5 pb-5 pt-0 mt-auto flex gap-2">
                  {/* Detailed View popup button */}
                  <Button 
                    variant="outline"
                    onClick={() => setViewingDtr(r)} 
                    className="flex-1 h-9 rounded-xl text-slate-700 border-slate-200 text-xs flex items-center justify-center gap-1.5"
                  >
                    <Eye className="h-3.5 w-3.5" /> View Details
                  </Button>
                  
                  {isEditable && (
                    <Button 
                      onClick={() => setSelectedDtr(r)} 
                      className={`flex-[1.2] h-9 rounded-xl transition text-xs font-semibold ${
                        isVerified 
                          ? "bg-slate-100 hover:bg-slate-200 text-slate-700" 
                          : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                      }`}
                    >
                      {userRole === "painter" ? "Register Painting" : isVerified ? "Re-Inspect" : "Inspect DTR"}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center pt-4 border-t flex-wrap gap-4">
          <p className="text-sm text-gray-500">
            Showing <strong className="font-semibold">{((currentPage - 1) * PAGE_SIZE) + 1}</strong> to{" "}
            <strong className="font-semibold">{Math.min(currentPage * PAGE_SIZE, filtered.length)}</strong> of{" "}
            <strong className="font-semibold">{filtered.length}</strong> items
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              className="h-10 w-10 p-0 rounded-xl"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            {Array.from({ length: totalPages }).map((_, i) => {
              const p = i + 1
              if (p === 1 || p === totalPages || Math.abs(currentPage - p) <= 1) {
                return (
                  <Button
                    key={p}
                    variant={currentPage === p ? "default" : "outline"}
                    onClick={() => setCurrentPage(p)}
                    className={`h-10 w-10 rounded-xl ${
                      currentPage === p 
                        ? "bg-blue-600 hover:bg-blue-700 text-white" 
                        : "text-gray-650"
                    }`}
                  >
                    {p}
                  </Button>
                )
              } else if (p === 2 || p === totalPages - 1) {
                return <span key={p} className="self-center px-1 text-gray-400 font-bold">...</span>
              }
              return null
            })}
            <Button
              variant="outline"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              className="h-10 w-10 p-0 rounded-xl"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      {/* POPUP MODAL 1: VIEW DETAILS DIALOG */}
      <Dialog open={viewingDtr !== null} onOpenChange={(open) => !open && setViewingDtr(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto p-0 rounded-2xl">
          {viewingDtr && (
            <div>
              {/* Modal top navigation */}
              <DialogHeader className="bg-slate-900 text-white p-5 sticky top-0 z-40 flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-3">
                  <span className="p-2 bg-slate-800 rounded-xl">
                    <RadioTower className="h-5 w-5 text-indigo-400" />
                  </span>
                  <div>
                    <DialogTitle className="text-base font-bold text-white tracking-tight">DTR Verification Audit details</DialogTitle>
                    <DialogDescription className="text-[11px] text-slate-400 font-mono mt-0.5">Transformer Asset ID: {viewingDtr.dtrCode}</DialogDescription>
                  </div>
                </div>
                <button 
                  onClick={() => setViewingDtr(null)} 
                  className="text-slate-400 hover:text-white transition p-1.5 hover:bg-slate-800 rounded-lg mr-6"
                >
                  <X className="h-5 w-5" />
                </button>
              </DialogHeader>

              {/* Modal Content */}
              <div className="p-6 space-y-6 text-slate-900">
                {/* Details layout grids */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Left: General Spec & Checklist */}
                  <div className="md:col-span-2 space-y-5">
                    {/* General Specs */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Asset Information</h3>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-slate-400 block">Reference Feeder</span>
                          <strong className="text-slate-700 font-semibold text-sm">{viewingDtr.feederName || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Reference Capacity</span>
                          <strong className="text-slate-700 font-semibold text-sm">{viewingDtr.kvCapacity ? `${viewingDtr.kvCapacity} kVA` : "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Inspected / Actual Feeder</span>
                          <strong className="text-indigo-700 font-bold text-sm">{viewingDtr.actualFeeder || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Inspected / Actual Rating</span>
                          <strong className="text-indigo-700 font-bold text-sm">{viewingDtr.actualRating ? `${viewingDtr.actualRating} kVA` : "—"}</strong>
                        </div>
                        <div className="col-span-2">
                          <span className="text-slate-400 block">Inspected Location Landmark</span>
                          <strong className="text-slate-800 text-sm block">{viewingDtr.actualLocation || viewingDtr.locationName || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Supply Office Section</span>
                          <strong className="text-slate-700 font-semibold text-sm">{viewingDtr.supplyOffice || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Painting Agency</span>
                          <strong className="text-slate-700 font-semibold text-sm">{viewingDtr.paintingAgency || "None / Unassigned"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Audit Agency</span>
                          <strong className="text-slate-700 font-semibold text-sm">{viewingDtr.auditAgency || "None / Unassigned"}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Inspection Checklist Parameters */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Field Checkpoints & Measurements</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                        <div>
                          <span className="text-slate-400 block">Painting Status</span>
                          <span className={`inline-flex items-center gap-1.5 font-bold mt-1 ${viewingDtr.painting === "Done" ? "text-green-600" : "text-orange-600"}`}>
                            <Brush className="h-3.5 w-3.5" />
                            {viewingDtr.painting === "Done" ? "Painted" : "Pending"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Kiosk Box Box</span>
                          <strong className={`font-bold block mt-1 ${viewingDtr.kiosk === "Defective" ? "text-red-600" : viewingDtr.kiosk === "Missing" ? "text-rose-600" : "text-green-600"}`}>
                            {viewingDtr.kiosk || "Good"}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">LA (Arrester)</span>
                          <strong className={`font-bold block mt-1 ${viewingDtr.la === "Defective" || viewingDtr.la === "Missing" ? "text-red-600" : "text-green-600"}`}>
                            {viewingDtr.la || "Good"}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">NE (Earthing)</span>
                          <strong className={`font-bold block mt-1 ${viewingDtr.ne === "Defective" || viewingDtr.ne === "Missing" ? "text-red-600" : "text-green-600"}`}>
                            {viewingDtr.ne || "Good"}
                          </strong>
                        </div>
                      </div>

                      {/* RYBN Loads */}
                      <div className="border-t border-slate-200 mt-4 pt-3">
                        <span className="text-slate-400 block text-xs mb-2">Phase Load Currents (in Amps)</span>
                        <div className="grid grid-cols-4 gap-2 text-center text-xs">
                          <div className="bg-red-50 border border-red-100 rounded-lg py-1.5">
                            <span className="text-[9px] font-bold text-red-600 block">R-Phase</span>
                            <strong className="text-red-800 text-sm">{viewingDtr.loadR || "0"} A</strong>
                          </div>
                          <div className="bg-amber-50 border border-amber-100 rounded-lg py-1.5">
                            <span className="text-[9px] font-bold text-amber-600 block">Y-Phase</span>
                            <strong className="text-amber-800 text-sm">{viewingDtr.loadY || "0"} A</strong>
                          </div>
                          <div className="bg-blue-50 border border-blue-100 rounded-lg py-1.5">
                            <span className="text-[9px] font-bold text-blue-600 block">B-Phase</span>
                            <strong className="text-blue-800 text-sm">{viewingDtr.loadB || "0"} A</strong>
                          </div>
                          <div className="bg-slate-50 border border-slate-200 rounded-lg py-1.5">
                            <span className="text-[9px] font-bold text-slate-600 block font-mono">Neutral</span>
                            <strong className="text-slate-800 text-sm">{viewingDtr.loadN || "0"} A</strong>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Metadata Audits & Remarks */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Audit Logs & Remarks</h3>
                      <div className="grid grid-cols-2 gap-4 pb-2 border-b">
                        <div>
                          <span className="text-slate-400 block">Audited By</span>
                          <strong className="text-slate-700">{viewingDtr.verifiedBy || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Audit Date & Time</span>
                          <strong className="text-slate-700">{viewingDtr.verifiedAt || "—"}</strong>
                        </div>
                      </div>
                      <div className="pt-2">
                        <span className="text-slate-400 block">Notes / Observations</span>
                        <p className="text-slate-600 mt-1 italic leading-relaxed">{viewingDtr.remarks || "No comments entered."}</p>
                      </div>
                    </div>
                  </div>

                  {/* Right: Map and Image Evidence */}
                  <div className="space-y-5">
                    {/* Photographic Proof */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Photographic Evidence</h3>
                      {viewingDtr.image ? (
                        <div className="rounded-xl overflow-hidden border max-h-48 flex items-center justify-center bg-white shadow-sm">
                          <img 
                            src={viewingDtr.image} 
                            alt="DTR evidence" 
                            className="max-h-48 object-contain" 
                            onClick={() => window.open(viewingDtr.image, "_blank")}
                          />
                        </div>
                      ) : (
                        <div className="py-12 text-center text-slate-400 text-xs border border-dashed rounded-xl">
                          <Camera className="h-8 w-8 mx-auto opacity-35 mb-1.5" /> No image proof uploaded
                        </div>
                      )}
                    </div>

                    {/* GPS Coordinates and Maps */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">GPS Location Mapping</h3>
                      {viewingDtr.latlong ? (
                        <div className="space-y-2">
                          <iframe
                            title="Modal DTR Map"
                            width="100%"
                            height="160"
                            className="rounded-xl border shadow-sm"
                            src={`https://maps.google.com/maps?q=${encodeURIComponent(viewingDtr.latlong)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                            loading="lazy"
                          />
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="w-full text-xs flex items-center justify-center gap-1.5"
                            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(viewingDtr.latlong)}`, "_blank")}
                          >
                            <MapPin className="h-3.5 w-3.5 text-red-500" /> Open in Google Maps
                          </Button>
                        </div>
                      ) : (
                        <div className="py-8 text-center text-slate-400 text-xs border border-dashed rounded-xl">
                          <MapPin className="h-8 w-8 mx-auto opacity-35 mb-1.5" /> GPS Coordinates Unavailable
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* Bottom: Audit History logs */}
                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <History className="h-4.5 w-4.5 text-slate-500" /> DTR Audit Log History
                  </h3>
                  
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8 gap-2 text-slate-500 text-xs">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      Loading logs from Sheets...
                    </div>
                  ) : dtrHistory.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-4">No historical updates logged for this asset.</p>
                  ) : (
                    <div className="relative border-l border-slate-200 pl-4 ml-2 space-y-4 max-h-48 overflow-y-auto">
                      {dtrHistory.map((h, idx) => (
                        <div key={idx} className="relative text-xs">
                          <span className="absolute -left-[22px] top-1 h-3.5 w-3.5 rounded-full border border-white bg-blue-500" />
                          <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                            <span>{h.timestamp}</span>
                            <span className="font-semibold">By: {h.verifiedBy}</span>
                          </div>
                          <p className="font-bold text-slate-800 mt-0.5">
                            Feeder: {h.feederName} | Rating: {h.painting}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Painting: <span className="font-semibold text-slate-700">{h.painting}</span> | Loads: <span className="font-semibold font-mono text-slate-700">{h.loadCurrents}</span>
                          </p>
                          {h.remarks && <p className="text-[10px] text-slate-400 italic mt-0.5">Remarks: {h.remarks}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* POPUP MODAL 2: AGENCY PAINTING REPORT (ADMIN ONLY) */}
      <Dialog open={showAgencyReport} onOpenChange={setShowAgencyReport}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[85vh] overflow-y-auto p-0 rounded-2xl text-slate-900">
          <DialogHeader className="bg-slate-900 text-white p-5 sticky top-0 z-40 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-slate-800 rounded-xl">
                <Building2 className="h-5 w-5 text-blue-400" />
              </span>
              <div>
                <DialogTitle className="text-base font-bold text-white tracking-tight">Agency-wise Painting Report</DialogTitle>
                <DialogDescription className="text-[11px] text-slate-400">Total metrics breakdown of painting jobs assigned to field vendors</DialogDescription>
              </div>
            </div>
            <button 
              onClick={() => setShowAgencyReport(false)} 
              className="text-slate-400 hover:text-white transition p-1.5 hover:bg-slate-800 rounded-lg mr-6"
            >
              <X className="h-5 w-5" />
            </button>
          </DialogHeader>

          <div className="p-6 space-y-6">
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <Table className="text-xs">
                <TableHeader className="bg-slate-50 font-bold">
                  <TableRow>
                    <TableHead className="font-bold text-slate-850">Painting Agency Name</TableHead>
                    <TableHead className="text-center font-bold text-slate-850">Assigned DTRs</TableHead>
                    <TableHead className="text-center font-bold text-slate-850 text-green-600">Painting Completed</TableHead>
                    <TableHead className="text-center font-bold text-slate-850 text-orange-600">Painting Pending</TableHead>
                    <TableHead className="text-right font-bold text-slate-850">Progress Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agencyStats.map((row) => (
                    <TableRow key={row.agency} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-semibold text-slate-800">{row.agency}</TableCell>
                      <TableCell className="text-center font-bold font-mono">{row.total}</TableCell>
                      <TableCell className="text-center font-bold font-mono text-green-600 bg-green-50/10">{row.done}</TableCell>
                      <TableCell className="text-center font-bold font-mono text-orange-600 bg-orange-50/10">{row.pending}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-bold font-mono">{row.pct}%</span>
                          <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden inline-block border">
                            <div className="bg-blue-600 h-full" style={{ width: `${row.pct}%` }} />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* POPUP MODAL 3: NEARBY DTR MAP RADAR */}
      <Dialog open={showMap} onOpenChange={setShowMap}>
        <DialogContent className="max-w-4xl w-[95vw] p-0 rounded-2xl overflow-hidden border bg-white text-slate-900">
          <DialogHeader className="sr-only">
            <DialogTitle>Nearby DTR Radar</DialogTitle>
            <DialogDescription>Interactive map showing distribution transformers nearby using GPS coordinates.</DialogDescription>
          </DialogHeader>
          <NearbyDtrMap records={records} onClose={() => setShowMap(false)} />
        </DialogContent>
      </Dialog>

    </div>
  )
}
