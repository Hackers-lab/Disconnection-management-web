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
  ArrowLeft
} from "lucide-react"

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

export function DTRList({ userRole, userAgencies, username, agencies, permissions }: Props) {
  const { toast } = useToast()
  const [records, setRecords] = useState<DTRRecord[]>([])
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [tab, setTab] = useState<TabType>("all")
  const [search, setSearch] = useState("")
  const [selectedFeeder, setSelectedFeeder] = useState<string>("all")
  const [selectedPainting, setSelectedPainting] = useState<string>("all")
  
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedDtr, setSelectedDtr] = useState<DTRRecord | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const csvInputRef = useRef<HTMLInputElement>(null)
  
  const PAGE_SIZE = 15
  const isEditable = userRole === "admin" || (permissions && permissions.dtr?.includes("update"))
  const canUpload = userRole === "admin" || (permissions && permissions.dtr?.includes("create"))

  const downloadTemplate = () => {
    const headers = [
      "DTR Code", "Feeder Name", "Location Name", "KV Capacity", "STATUS",
      "ACTUAL FEEDER", "ACTUAL RATING", "ACTUAL LOCATION", "SUPPLY OFFICE", "LATLONG",
      "LONG", "IMAGE"
    ]
    const csvContent = headers.join(",") + "\n" +
      "7G07D,HARISHCHANDRAPUR,ISMAILPUR,63,EXIST,HARISHCHANDRAPUR,63,Ismailpur anganwari,KUSHIDA,\"25.452202, 88.021090\",,all dtr 2_Images/7G07D.jpg\n"
    
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

  // Dynamic lists for filters
  const feeders = useMemo(() => {
    const set = new Set<string>()
    records.forEach(r => {
      if (r.feederName) set.add(r.feederName.trim().toUpperCase())
    })
    return Array.from(set).sort()
  }, [records])

  // Stats computation
  const stats = useMemo(() => {
    const total = records.length
    const completed = records.filter(r => (r.status || "").toUpperCase() === "EXIST").length
    const pending = total - completed
    const paintingDone = records.filter(r => (r.painting || "").toLowerCase() === "done").length
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0
    const paintingProgress = total > 0 ? Math.round((paintingDone / total) * 100) : 0
    return { total, completed, pending, paintingDone, progress, paintingProgress }
  }, [records])

  // Filtering
  const filtered = useMemo(() => {
    let result = records
    
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
        r.supplyOffice.toLowerCase().includes(q)
      )
    }

    return result
  }, [records, tab, selectedFeeder, selectedPainting, search])

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
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">DTR Physical Verification</h1>
          <p className="text-sm text-gray-500 mt-0.5">Audit Distribution Transformers and log field conditions</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-white border-gray-200">
            {syncState === "loading" && <Loader2 className="h-3 w-3 animate-spin mr-1.5 text-blue-600" />}
            {syncState === "updated" && <CheckCircle2 className="h-3 w-3 mr-1.5 text-green-600" />}
            {syncState === "idle" && <div className="h-1.5 w-1.5 rounded-full bg-gray-400 mr-2" />}
            {syncState === "loading" ? "Syncing..." : syncState === "updated" ? "Updated" : "Idle"}
          </Badge>
          {canUpload && (
            <Button size="sm" onClick={() => setShowUpload(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl">
              <Upload className="h-4 w-4 mr-1.5" />
              Upload DTR List
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => load()} className="rounded-xl">
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Verification Progress */}
        <Card className="border border-gray-150 shadow-sm relative overflow-hidden">
          <CardContent className="p-5 space-y-2">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Verification Progress</p>
            <div className="flex justify-between items-baseline">
              <span className="text-2xl font-bold text-gray-900">{stats.completed}</span>
              <span className="text-sm font-semibold text-gray-500">/ {stats.total} DTRs</span>
            </div>
            <div className="space-y-1">
              <Progress value={stats.progress} className="h-2 bg-blue-50" />
              <p className="text-[10px] text-right font-medium text-blue-600">{stats.progress}% Completed</p>
            </div>
          </CardContent>
        </Card>

        {/* Painting Progress */}
        <Card className="border border-gray-150 shadow-sm relative overflow-hidden">
          <CardContent className="p-5 space-y-2">
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">Painting Completed</p>
            <div className="flex justify-between items-baseline">
              <span className="text-2xl font-bold text-gray-900">{stats.paintingDone}</span>
              <span className="text-sm font-semibold text-gray-500">/ {stats.total} DTRs</span>
            </div>
            <div className="space-y-1">
              <Progress value={stats.paintingProgress} className="h-2 bg-orange-50" />
              <p className="text-[10px] text-right font-medium text-orange-600">{stats.paintingProgress}% Painted</p>
            </div>
          </CardContent>
        </Card>

        {/* Pending Card */}
        <Card className="border border-gray-150 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Pending Audit</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
            </div>
            <div className="p-3 bg-red-50 rounded-2xl">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
          </CardContent>
        </Card>

        {/* Total Transformers */}
        <Card className="border border-gray-150 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Total in System</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="p-3 bg-indigo-50 rounded-2xl">
              <RadioTower className="h-6 w-6 text-indigo-600" />
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm space-y-4">
        
        {/* Status Tab Toggle */}
        <div className="flex gap-2 border-b pb-2 flex-wrap">
          {(["all", "pending", "completed"] as TabType[]).map(t => (
            <Button
              key={t}
              variant={tab === t ? "default" : "ghost"}
              className={`h-9 px-4 rounded-xl capitalize font-medium ${
                tab === t 
                  ? "bg-blue-600 hover:bg-blue-700 text-white" 
                  : "text-gray-650 hover:bg-gray-50"
              }`}
              onClick={() => setTab(t)}
            >
              {t === "all" ? "All Transformers" : t === "pending" ? "Pending Audit" : "Verified DTRs"}
            </Button>
          ))}
        </div>

        {/* Dropdowns & Search */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          
          {/* Search Box */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by Code, Feeder, Landmark..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-11 rounded-xl"
            />
          </div>

          {/* Feeder Select */}
          <div className="relative">
            <Select value={selectedFeeder} onValueChange={setSelectedFeeder}>
              <SelectTrigger className="h-11 rounded-xl">
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
          <div className="relative">
            <Select value={selectedPainting} onValueChange={setSelectedPainting}>
              <SelectTrigger className="h-11 rounded-xl">
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
                className={`overflow-hidden hover:shadow-md transition-shadow relative border ${
                  isVerified ? "border-green-150" : "border-gray-200"
                }`}
              >
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

                <CardContent className="px-5 pb-5 pt-0 space-y-4">
                  
                  {/* Landmark */}
                  <div className="space-y-1 min-h-[3.25rem]">
                    <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Landmark / Location</span>
                    <p className="text-sm text-gray-700 line-clamp-2" title={r.locationName}>
                      {r.locationName || "—"}
                    </p>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 pt-3 border-t text-xs">
                    <div>
                      <span className="text-gray-400 block">Rating Capacity</span>
                      <strong className="text-gray-800 font-semibold">{r.kvCapacity ? `${r.kvCapacity} kVA` : "—"}</strong>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Supply Section</span>
                      <strong className="text-gray-800 font-semibold">{r.supplyOffice || "KUSHIDA"}</strong>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Painting Status</span>
                      <span className={`inline-flex items-center gap-1 font-semibold ${isPainted ? "text-green-600" : "text-orange-600"}`}>
                        <Brush className="h-3 w-3" />
                        {isPainted ? "Completed" : "Pending"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block">Verified Coordinates</span>
                      {r.latlong ? (
                        <span className="text-gray-700 font-mono text-[10px] truncate max-w-[100px] block" title={r.latlong}>
                          {r.latlong}
                        </span>
                      ) : (
                        <span className="text-red-500 font-medium">Missing GPS</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {isEditable && (
                    <Button 
                      onClick={() => setSelectedDtr(r)} 
                      className={`w-full mt-3 h-10 rounded-xl transition ${
                        isVerified 
                          ? "bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium" 
                          : "bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md shadow-blue-100"
                      }`}
                    >
                      {isVerified ? "Re-Inspect DTR" : "Start Audit & Inspect"}
                    </Button>
                  )}

                </CardContent>
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
              // Show limited page numbers for cleaner UX
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

    </div>
  )
}
