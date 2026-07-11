"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Search, X, Plus, RotateCcw, MapPin, Phone, Clock,
  CheckCircle2, Lock, XCircle, ChevronLeft, ChevronRight,
  Loader2, Download, Image as ImageIcon, RefreshCw, Check,
  DownloadCloud, Monitor, Building2, User,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { ReconnectionRequest } from "@/lib/reconnection-service"
import { ReconnectionCreateForm } from "@/components/reconnection-create-form"
import { ReconnectionUpdateForm } from "@/components/reconnection-update-form"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
// xlsx is loaded dynamically in downloadReport() to avoid bundling ~1MB upfront

const CACHE_KEY = "reconnection_data_cache"

interface Props {
  userRole: string
  userAgencies: string[]
  username: string
  agencies: string[]
}

type Tab = "pending" | "reconnected" | "door_locked" | "overdue" | "all"
type SyncState = "idle" | "loading" | "updated"

function formatTs(ts: string) {
  if (!ts) return "—"
  return ts.replace(/-/g, "/")
}

function hoursAgo(ts: string): number {
  if (!ts) return 0
  try {
    const [datePart, timePart] = ts.split(" ")
    const [d, m, y] = datePart.split("-").map(Number)
    const [h, min] = (timePart || "00:00").split(":").map(Number)
    return (Date.now() - new Date(y, m - 1, d, h, min).getTime()) / 3_600_000
  } catch { return 0 }
}

function StatusBadge({ status, effectiveStatus }: { status: ReconnectionRequest["status"], effectiveStatus: string }) {
  const styles: Record<string, string> = {
    pending:     "bg-amber-50 text-amber-700 border border-amber-200",
    reconnected: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    door_locked: "bg-orange-50 text-orange-700 border border-orange-200",
    cancelled:   "bg-gray-50 text-gray-500 border border-gray-200",
    pending_reattempt: "bg-pink-50 text-pink-700 border border-pink-200 animate-pulse",
  }
  const labels: Record<string, string> = {
    pending: "⏳ Pending",
    reconnected: "✅ Reconnected",
    door_locked: "🔒 Door Locked",
    cancelled: "✕ Cancelled",
    pending_reattempt: "🔄 Pending Re-attempt",
  }
  const key = (status === "door_locked" && effectiveStatus === "pending") ? "pending_reattempt" : status
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${styles[key] || ""}`}>
      {labels[key] || status}
    </span>
  )
}

export function ReconnectionList({ userRole, userAgencies, username, agencies }: Props) {
  const { toast } = useToast()
  const [records, setRecords] = useState<ReconnectionRequest[]>([])
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [tab, setTab] = useState<Tab>("pending")
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [view, setView] = useState<"list" | "create" | "update">("list")
  const [selected, setSelected] = useState<ReconnectionRequest | null>(null)

  const isAdmin = userRole === "admin" || userRole === "executive"
  const PAGE_SIZE = 15

  const load = async (silent = false) => {
    if (!silent) setSyncState("loading")
    try {
      // 1. Show cached data instantly
      const cached = await getFromCache<ReconnectionRequest[]>(CACHE_KEY)
      if (cached && cached.length > 0) {
        setRecords(cached)
        if (!silent) setSyncState("idle")
      }
      // 2. Fetch fresh from server
      const res = await fetch("/api/reconnection")
      if (!res.ok) throw new Error()
      const data: ReconnectionRequest[] = await res.json()
      const sorted = [...data].reverse() // newest first
      setRecords(sorted)
      await saveToCache(CACHE_KEY, sorted)
      setSyncState("updated")
      setTimeout(() => setSyncState("idle"), 3000)
    } catch {
      setSyncState("idle")
      if (!silent) toast({ title: "Failed to load reconnection data", variant: "destructive" })
    }
  }

  useEffect(() => { load() }, [])

  // ── Processed Records with Virtual Pending and Overdue ────────────────────
  const processedRecords = useMemo(() => {
    return records.map(r => {
      let effectiveStatus = r.status
      let isOverdue = false
      let overdueHours = 0

      if (r.status === "door_locked") {
        const hrsLocked = hoursAgo(r.updatedAt || r.createdAt)
        if (hrsLocked >= 72) {
          effectiveStatus = "pending"
          isOverdue = hrsLocked > 144 // Overdue time is 72 hours for this entry, meaning 72h locked + 72h pending = 144h since update
          overdueHours = hrsLocked - 72
        } else {
          effectiveStatus = "door_locked"
          isOverdue = false
          overdueHours = 0
        }
      } else if (r.status === "pending") {
        effectiveStatus = "pending"
        const hrs = hoursAgo(r.createdAt)
        isOverdue = hrs > 30 // standard overdue is 30 hours
        overdueHours = hrs
      }

      return {
        ...r,
        effectiveStatus,
        isOverdue,
        overdueHours,
      }
    })
  }, [records])

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let data = processedRecords
    if (tab !== "all") {
      if (tab === "overdue") {
        data = data.filter(r => r.isOverdue)
      } else {
        data = data.filter(r => r.effectiveStatus === tab)
      }
    }
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(r =>
        r.consumerId.includes(q) || r.name.toLowerCase().includes(q) ||
        r.mobile.includes(q) || r.agency.toLowerCase().includes(q) ||
        (r.device && r.device.toLowerCase().includes(q))
      )
    }
    return data
  }, [processedRecords, tab, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => setCurrentPage(1), [tab, search])

  // ── Agency permission check ───────────────────────────────────────────────
  const canUpdate = (r: ReconnectionRequest & { effectiveStatus?: string }) => {
    const statusToCheck = r.effectiveStatus || r.status
    if (statusToCheck !== "pending") return false
    if (isAdmin) return true
    return userAgencies.map(a => a.toUpperCase()).includes(r.agency.toUpperCase())
  }

  // ── Excel download ────────────────────────────────────────────────────────
  const downloadReport = async () => {
    if (!isAdmin) return
    const XLSX = (await import("xlsx")).default ?? await import("xlsx")
    const rows = filtered.map((r, i) => ({
      "#": i + 1,
      "Request ID": r.requestId,
      "Created": r.createdAt,
      "Consumer ID": r.consumerId,
      "Name": r.name,
      "Address": r.address,
      "Mobile": r.mobile,
      "Agency": r.agency,
      "Device": r.device,
      "Source": r.source,
      "Status": r.status,
      "Effective Status": r.effectiveStatus,
      "Is Overdue": r.isOverdue ? "Yes" : "No",
      "Updated": r.updatedAt,
      "Reading": r.reading,
      "Remarks": r.remarks,
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Reconnection")
    XLSX.writeFile(wb, `Reconnection_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── Sub-views ─────────────────────────────────────────────────────────────
  if (view === "create") {
    return (
      <ReconnectionCreateForm
        agencies={agencies}
        onSave={(id) => {
          toast({ title: "Request created", description: `ID: ${id}` })
          setView("list")
          load()
        }}
        onCancel={() => setView("list")}
      />
    )
  }

  if (view === "update" && selected) {
    return (
      <ReconnectionUpdateForm
        request={selected}
        userRole={userRole}
        username={username}
        onSave={() => {
          toast({ title: "Updated successfully" })
          setSelected(null)
          setView("list")
          load()
        }}
        onCancel={() => { setSelected(null); setView("list") }}
      />
    )
  }

  // ── Stats calculation ─────────────────────────────────────────────────────
  const pendingCount    = processedRecords.filter(r => r.effectiveStatus === "pending").length
  const reconnectedCount = processedRecords.filter(r => r.effectiveStatus === "reconnected").length
  const doorLockedCount = processedRecords.filter(r => r.effectiveStatus === "door_locked").length
  const overdueCount    = processedRecords.filter(r => r.isOverdue).length
  const allCount        = records.length

  return (
    <div className={`space-y-4 ${isAdmin ? "pb-24" : ""}`}>
      {/* Controls & Search */}
      <div className="bg-white p-3 rounded-xl shadow-sm border space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search ID, name, mobile, meter..." className="pl-10 pr-8 rounded-xl h-9 text-sm" />
            {search && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" onClick={() => setSearch("")} />}
          </div>

          <Select value={tab} onValueChange={(val) => setTab(val as Tab)}>
            <SelectTrigger className="w-[155px] h-9 rounded-xl shrink-0 text-xs font-semibold bg-gray-50 border-gray-200 hover:bg-gray-100 transition-colors">
              <SelectValue placeholder="Status: Pending" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending" className="text-xs font-medium">⏳ Pending ({pendingCount})</SelectItem>
              <SelectItem value="reconnected" className="text-xs font-medium">✅ Reconnected ({reconnectedCount})</SelectItem>
              <SelectItem value="door_locked" className="text-xs font-medium">🔒 Door Locked ({doorLockedCount})</SelectItem>
              <SelectItem value="overdue" className="text-xs font-medium">⚠️ Overdue ({overdueCount})</SelectItem>
              <SelectItem value="all" className="text-xs font-medium">📁 All ({allCount})</SelectItem>
            </SelectContent>
          </Select>

          {isAdmin && (
            <Button size="sm" variant="outline" onClick={downloadReport} className="shrink-0 rounded-xl h-9 w-9 p-0">
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => load()} className="shrink-0 h-9 w-9 p-0">
            <RefreshCw className={`h-4 w-4 ${syncState === "loading" ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Compact stats row below search/filter row */}
        <div className="flex items-center gap-1.5 flex-wrap text-[10px] sm:text-xs font-semibold text-gray-500 border-t pt-2 mt-1">
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-100">
            Pending: <span className="font-bold">{pendingCount}</span>
          </span>
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-100">
            Reconnected: <span className="font-bold">{reconnectedCount}</span>
          </span>
          <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-800 px-2 py-0.5 rounded-md border border-orange-100">
            Door Locked: <span className="font-bold">{doorLockedCount}</span>
          </span>
          <span className="inline-flex items-center gap-1 bg-red-50 text-red-800 px-2 py-0.5 rounded-md border border-red-100">
            Overdue: <span className="font-bold">{overdueCount}</span>
          </span>
          <span className="inline-flex items-center gap-1 bg-gray-50 text-gray-700 px-2 py-0.5 rounded-md border border-gray-200">
            Total: <span className="font-bold">{allCount}</span>
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500 pt-0.5">
          <span>{filtered.length} records found</span>
          {syncState === "loading" && <span className="flex items-center gap-1 text-yellow-600 animate-pulse"><Loader2 className="h-3 w-3 animate-spin" />Loading...</span>}
          {syncState === "updated" && <span className="flex items-center gap-1 text-green-600"><Check className="h-3 w-3" />Updated</span>}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {paginated.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <RotateCcw className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No reconnection requests found</p>
          </div>
        ) : paginated.map(r => {
          const overdueFlag = r.isOverdue
          const hrs = r.overdueHours
          return (
            <Card key={r.requestId} className={`overflow-hidden transition-all duration-200 hover:shadow-lg ${
              overdueFlag ? "border-red-300 border-2 bg-red-50/30" : "hover:border-blue-200"
            }`}>
              <CardContent className="p-0">
                {/* Top color strip */}
                <div className={`h-1 ${
                  r.status === "reconnected" ? "bg-emerald-500"
                  : r.status === "door_locked" && r.effectiveStatus === "door_locked" ? "bg-orange-400"
                  : r.status === "cancelled" ? "bg-gray-300"
                  : overdueFlag ? "bg-red-500"
                  : r.status === "door_locked" && r.effectiveStatus === "pending" ? "bg-pink-400"
                  : "bg-amber-400"
                }`} />

                <div className="p-4">
                  {/* Header row: request info + status */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{r.requestId}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        r.source === "dc_list"
                          ? "bg-blue-50 text-blue-600 border border-blue-100"
                          : "bg-purple-50 text-purple-600 border border-purple-100"
                      }`}>
                        {r.source === "dc_list" ? "DC List" : "Manual"}
                      </span>
                      {overdueFlag && (
                        <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold animate-pulse">
                          ⚠ {Math.floor(hrs)}h overdue
                        </span>
                      )}
                    </div>
                    <StatusBadge status={r.status} effectiveStatus={r.effectiveStatus} />
                  </div>

                  {/* Consumer details */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400 shrink-0" />
                      <p className="font-semibold text-gray-900 truncate">{r.name}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 ml-6">
                      <span className="text-xs font-mono text-gray-500">ID: {r.consumerId}</span>
                      {r.device && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Monitor className="h-3 w-3 text-gray-400" />
                          <span className="font-mono">{r.device}</span>
                        </span>
                      )}
                    </div>

                    {r.address && (
                      <div className="flex items-start gap-2 ml-6">
                        <MapPin className="h-3 w-3 text-gray-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-500 line-clamp-1">{r.address}</p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 ml-6">
                      {r.mobile && (
                        <a href={`tel:${r.mobile}`} className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                          <Phone className="h-3 w-3" />
                          {r.mobile}
                        </a>
                      )}
                      <Badge variant="outline" className="ml-auto bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100/80 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0 uppercase tracking-wider">
                        <Building2 className="h-3 w-3 text-indigo-500" />
                        {r.agency}
                      </Badge>
                    </div>
                  </div>

                  {/* Footer: timestamps + actions */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <div className="text-[11px] text-gray-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTs(r.createdAt)}
                      {r.status !== "pending" && r.updatedAt && (
                        <span className="ml-1.5 text-emerald-600">→ {formatTs(r.updatedAt)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {r.imageUrl && (
                        <a href={r.imageUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 flex items-center gap-1 hover:underline">
                          <ImageIcon className="h-3 w-3" /> Photo
                        </a>
                      )}
                      {canUpdate(r) && (
                        <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm"
                          onClick={() => { setSelected(r); setView("update") }}>
                          Update
                        </Button>
                      )}
                      {isAdmin && r.effectiveStatus === "pending" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 rounded-lg hover:bg-red-50"
                          onClick={async () => {
                            if (!confirm("Cancel this request?")) return
                            // Optimistic update — reflect immediately in UI
                            setRecords(prev => {
                              const updated = prev.map(x => x.requestId === r.requestId ? { ...x, status: "cancelled" as const } : x)
                              saveToCache(CACHE_KEY, updated)
                              return updated
                            })
                            // Background persist
                            fetch("/api/reconnection/update", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ requestId: r.requestId, status: "cancelled" }),
                            }).then(() => load(true)).catch(() => load(true))
                          }}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="rounded-lg">
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="rounded-lg">
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
      {/* Sticky bottom — Add Consumer */}
      {isAdmin && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <Button
              className="w-full h-13 bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-2xl text-base font-semibold flex items-center justify-center gap-2 py-3"
              onClick={() => setView("create")}>
              <Plus className="h-5 w-5" /> Add Consumer
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
