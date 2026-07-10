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
// xlsx is loaded dynamically in downloadReport() to avoid bundling ~1MB upfront

const CACHE_KEY = "reconnection_data_cache"

interface Props {
  userRole: string
  userAgencies: string[]
  username: string
  agencies: string[]
}

type Tab = "all" | "pending" | "reconnected" | "door_locked"
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

function StatusBadge({ status }: { status: ReconnectionRequest["status"] }) {
  const styles: Record<string, string> = {
    pending:     "bg-amber-50 text-amber-700 border border-amber-200",
    reconnected: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    door_locked: "bg-orange-50 text-orange-700 border border-orange-200",
    cancelled:   "bg-gray-50 text-gray-500 border border-gray-200",
  }
  const labels: Record<string, string> = {
    pending: "⏳ Pending",
    reconnected: "✅ Reconnected",
    door_locked: "🔒 Door Locked",
    cancelled: "✕ Cancelled",
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status] || ""}`}>
      {labels[status] || status}
    </span>
  )
}

export function ReconnectionList({ userRole, userAgencies, username, agencies }: Props) {
  const { toast } = useToast()
  const [records, setRecords] = useState<ReconnectionRequest[]>([])
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [tab, setTab] = useState<Tab>(userRole === "agency" ? "pending" : "all")
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [view, setView] = useState<"list" | "create" | "update">("list")
  const [selected, setSelected] = useState<ReconnectionRequest | null>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

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

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let data = records
    if (tab !== "all") data = data.filter(r => r.status === tab)
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(r =>
        r.consumerId.includes(q) || r.name.toLowerCase().includes(q) ||
        r.mobile.includes(q) || r.agency.toLowerCase().includes(q) ||
        (r.device && r.device.toLowerCase().includes(q))
      )
    }
    if (dateFrom) data = data.filter(r => r.createdAt >= dateFrom)
    if (dateTo)   data = data.filter(r => r.createdAt <= dateTo + " 23:59")
    return data
  }, [records, tab, search, dateFrom, dateTo])

  const tabCount = (t: Tab) => t === "all" ? records.length : records.filter(r => r.status === t).length
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => setCurrentPage(1), [tab, search, dateFrom, dateTo])

  // ── Agency permission check ───────────────────────────────────────────────
  const canUpdate = (r: ReconnectionRequest) => {
    if (r.status !== "pending") return false
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

  // ── Stats row ─────────────────────────────────────────────────────────────
  const pending    = records.filter(r => r.status === "pending").length
  const reconnected = records.filter(r => r.status === "reconnected").length
  const doorLocked = records.filter(r => r.status === "door_locked").length
  const overdue    = records.filter(r => r.status === "pending" && hoursAgo(r.createdAt) > 30).length

  return (
    <div className={`space-y-4 ${isAdmin ? "pb-24" : ""}`}>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pending",     value: pending,     color: "text-amber-700",  bg: "bg-gradient-to-br from-amber-50 to-yellow-50",  border: "border-amber-100" },
          { label: "Reconnected", value: reconnected,  color: "text-emerald-700", bg: "bg-gradient-to-br from-emerald-50 to-green-50", border: "border-emerald-100" },
          { label: "Door Locked", value: doorLocked,  color: "text-orange-700", bg: "bg-gradient-to-br from-orange-50 to-amber-50",  border: "border-orange-100" },
          { label: "Overdue >30h",value: overdue,     color: "text-red-700",    bg: "bg-gradient-to-br from-red-50 to-rose-50",      border: "border-red-100" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} ${s.border} border rounded-2xl p-4 flex flex-col items-center shadow-sm`}>
            <span className={`text-3xl font-extrabold ${s.color} tabular-nums`}>{s.value}</span>
            <span className="text-xs text-gray-500 mt-1 font-medium">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-white p-4 rounded-xl shadow-sm border sticky top-[64px] z-30 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search ID, name, mobile, meter..." className="pl-10 pr-8 rounded-xl" />
            {search && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" onClick={() => setSearch("")} />}
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={downloadReport} className="shrink-0 rounded-xl">
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => load()} className="shrink-0">
            <RefreshCw className={`h-4 w-4 ${syncState === "loading" ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Date filter (admin only) */}
        {isAdmin && (
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="h-8 text-xs rounded-lg" placeholder="From" />
            <div className="flex gap-1">
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="h-8 text-xs flex-1 rounded-lg" placeholder="To" />
              {(dateFrom || dateTo) && (
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0"
                  onClick={() => { setDateFrom(""); setDateTo("") }}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(["all", "pending", "reconnected", "door_locked"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                tab === t
                  ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}>
              {t === "all" ? "All" : t === "door_locked" ? "Door Locked" : t.charAt(0).toUpperCase() + t.slice(1)}
              {" "}
              <span className={`ml-1 ${tab === t ? "text-blue-200" : "text-gray-400"}`}>
                {tabCount(t)}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{filtered.length} records</span>
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
          const hrs = hoursAgo(r.createdAt)
          const overdueFlag = r.status === "pending" && hrs > 30
          return (
            <Card key={r.requestId} className={`overflow-hidden transition-all duration-200 hover:shadow-lg ${
              overdueFlag ? "border-red-300 border-2 bg-red-50/30" : "hover:border-blue-200"
            }`}>
              <CardContent className="p-0">
                {/* Top color strip */}
                <div className={`h-1 ${
                  r.status === "reconnected" ? "bg-emerald-500"
                  : r.status === "door_locked" ? "bg-orange-400"
                  : r.status === "cancelled" ? "bg-gray-300"
                  : overdueFlag ? "bg-red-500" : "bg-amber-400"
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
                    <StatusBadge status={r.status} />
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
                      {isAdmin && r.status === "pending" && (
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
