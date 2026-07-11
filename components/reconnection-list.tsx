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
  DownloadCloud, Monitor, Building2, User, Edit,
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
    pending: "bg-amber-50 text-amber-700 border border-amber-200",
    reconnected: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    door_locked: "bg-orange-50 text-orange-700 border border-orange-200",
    cancelled: "bg-gray-50 text-gray-500 border border-gray-200",
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
  const pendingCount = processedRecords.filter(r => r.effectiveStatus === "pending").length
  const reconnectedCount = processedRecords.filter(r => r.effectiveStatus === "reconnected").length
  const doorLockedCount = processedRecords.filter(r => r.effectiveStatus === "door_locked").length
  const overdueCount = processedRecords.filter(r => r.isOverdue).length
  const allCount = records.length

  return (
    <div className={`space-y-4 ${isAdmin ? "pb-24" : ""}`}>
      {/* Controls & Search */}
      <div className="bg-white p-4 rounded-lg shadow-sm border space-y-3">
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
        </div>

        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span>{filtered.length} records</span>
            <button
              onClick={() => load()}
              disabled={syncState === "loading"}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 border transition-colors disabled:cursor-not-allowed ${syncState === "loading"
                  ? "border-blue-400 bg-blue-50 text-blue-500"
                  : syncState === "updated"
                    ? "border-green-500 bg-green-50 text-green-600"
                    : "border-blue-300 bg-blue-50 text-blue-500 hover:border-blue-500 hover:bg-blue-100 hover:text-blue-700 active:scale-95 cursor-pointer"
                }`}
              title={syncState === "loading" ? "Loading data..." : "Tap to refresh"}
            >
              {syncState === "loading" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-[10px] font-medium">Loading...</span>
                </>
              ) : syncState === "updated" ? (
                <>
                  <Check className="h-3 w-3" />
                  <span className="text-[10px] font-medium">Updated</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3" />
                  <span className="text-[10px] font-medium">Refresh</span>
                </>
              )}
            </button>
          </div>
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
            <Card key={r.requestId} className={`hover:shadow-md transition-all duration-200 overflow-hidden max-w-full ${overdueFlag ? "ring-2 ring-red-500 border-red-300" : "hover:border-blue-200"
              }`}>
              <CardHeader className="pb-3 break-words whitespace-normal">
                <div className="flex items-start justify-between w-full gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <CardTitle className="text-lg break-words whitespace-normal line-clamp-2 leading-tight font-semibold text-gray-900">{r.name}</CardTitle>
                      {overdueFlag && (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-red-600 text-white px-1.5 py-0.5 rounded animate-pulse">OVERDUE</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 font-mono mt-1">ID: {r.consumerId}</p>
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{r.requestId}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${r.source === "dc_list"
                          ? "bg-blue-50 text-blue-600 border border-blue-100"
                          : "bg-purple-50 text-purple-600 border border-purple-100"
                        }`}>
                        {r.source === "dc_list" ? "DC List" : "Manual"}
                      </span>
                      {overdueFlag && (
                        <span className="text-[10px] text-red-600 font-bold">
                          ⚠ {Math.floor(hrs)}h overdue
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end space-y-1.5 shrink-0">
                    <StatusBadge status={r.status} effectiveStatus={r.effectiveStatus} />
                    <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border-indigo-200">
                      {r.agency}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 break-words whitespace-normal">
                {r.address && (
                  <div className="flex items-start space-x-2 min-w-0">
                    <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-600 line-clamp-2" title={r.address}>{r.address}</p>
                  </div>
                )}
                {r.mobile && (
                  <a href={`tel:${r.mobile}`} className="flex items-center space-x-2 hover:underline">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <p className="text-sm text-blue-600">{r.mobile}</p>
                  </a>
                )}
                {r.device && (
                  <div className="flex items-center space-x-2">
                    <Monitor className="h-4 w-4 text-gray-400" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-indigo-600 font-mono">{r.device}</p>
                      <p className="text-[10px] text-gray-500">Meter / Device</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 pt-2 border-t border-dashed">
                  <div>
                    <span className="font-semibold text-gray-500">Created:</span> {formatTs(r.createdAt)}
                  </div>
                  {r.status !== "pending" && r.updatedAt ? (
                    <div>
                      <span className="font-semibold text-emerald-600">Updated:</span> {formatTs(r.updatedAt)}
                    </div>
                  ) : null}
                </div>

                {r.imageUrl && (
                  <div className="pt-2 pb-1 relative z-10">
                    <a href={r.imageUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer">
                      <ImageIcon className="h-3.5 w-3.5" /> <span>View Evidence Image</span>
                    </a>
                  </div>
                )}

                {/* Actions / Buttons */}
                <div className="flex items-center gap-2 mt-4">
                  {canUpdate(r) && (
                    <Button
                      onClick={() => { setSelected(r); setView("update") }}
                      className="flex-1 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold h-9 rounded-lg shadow-sm transition-colors"
                      size="sm"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Update Status
                    </Button>
                  )}
                  {isAdmin && r.effectiveStatus === "pending" && (
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 h-9 w-9 p-0 shrink-0 rounded-lg transition-colors"
                      title="Cancel Request"
                      onClick={async () => {
                        if (!confirm("Cancel this request?")) return
                        setRecords(prev => {
                          const updated = prev.map(x => x.requestId === r.requestId ? { ...x, status: "cancelled" as const } : x)
                          saveToCache(CACHE_KEY, updated)
                          return updated
                        })
                        fetch("/api/reconnection/update", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ requestId: r.requestId, status: "cancelled" }),
                        }).then(() => load(true)).catch(() => load(true))
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
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
