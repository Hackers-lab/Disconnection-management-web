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
  DownloadCloud,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { ReconnectionRequest } from "@/lib/reconnection-service"
import { ReconnectionCreateForm } from "@/components/reconnection-create-form"
import { ReconnectionUpdateForm } from "@/components/reconnection-update-form"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import * as XLSX from "xlsx"

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
  if (status === "pending")     return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
  if (status === "reconnected") return <Badge className="bg-green-100 text-green-800">Reconnected</Badge>
  if (status === "door_locked") return <Badge className="bg-orange-100 text-orange-800">Door Locked</Badge>
  if (status === "cancelled")   return <Badge className="bg-gray-100 text-gray-600">Cancelled</Badge>
  return <Badge>{status}</Badge>
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
        r.mobile.includes(q) || r.agency.toLowerCase().includes(q)
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
  const downloadReport = () => {
    if (!isAdmin) return
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
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pending",     value: pending,     color: "text-yellow-700", bg: "bg-yellow-50" },
          { label: "Reconnected", value: reconnected,  color: "text-green-700",  bg: "bg-green-50" },
          { label: "Door Locked", value: doorLocked,  color: "text-orange-700", bg: "bg-orange-50" },
          { label: "Overdue >30h",value: overdue,     color: "text-red-700",    bg: "bg-red-50" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-3 flex flex-col items-center`}>
            <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
            <span className="text-xs text-gray-500 mt-0.5">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-white p-4 rounded-lg shadow-sm border sticky top-[64px] z-30 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search ID, name, mobile, agency..." className="pl-10 pr-8" />
            {search && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" onClick={() => setSearch("")} />}
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={downloadReport} className="shrink-0">
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={load} className="shrink-0">
            <RefreshCw className={`h-4 w-4 ${syncState === "loading" ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Date filter (admin only) */}
        {isAdmin && (
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="h-8 text-xs" placeholder="From" />
            <div className="flex gap-1">
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="h-8 text-xs flex-1" placeholder="To" />
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
        <div className="flex gap-1 overflow-x-auto pb-1">
          {(["all", "pending", "reconnected", "door_locked"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition ${
                tab === t ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
          const overdue = r.status === "pending" && hrs > 30
          return (
            <Card key={r.requestId} className={`overflow-hidden transition-shadow hover:shadow-md ${overdue ? "border-red-300 border-2" : ""}`}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-gray-400">{r.requestId}</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-400">{r.source === "dc_list" ? "DC List" : "Manual"}</span>
                      {overdue && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium animate-pulse">
                          ⚠ {Math.floor(hrs)}h — DC Blocked
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-900 mt-1 truncate">{r.name}</p>
                    <p className="text-xs font-mono text-gray-500">{r.consumerId}</p>
                    {r.address && (
                      <div className="flex items-start gap-1 mt-1">
                        <MapPin className="h-3 w-3 text-gray-400 mt-0.5 shrink-0" />
                        <p className="text-xs text-gray-500 line-clamp-1">{r.address}</p>
                      </div>
                    )}
                    {r.mobile && (
                      <div className="flex items-center gap-1 mt-1">
                        <Phone className="h-3 w-3 text-gray-400" />
                        <a href={`tel:${r.mobile}`} className="text-xs text-blue-600">{r.mobile}</a>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={r.status} />
                    <span className="text-xs text-gray-400">{r.agency}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <div className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTs(r.createdAt)}
                    {r.status !== "pending" && r.updatedAt && (
                      <span className="ml-2">→ {formatTs(r.updatedAt)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {r.imageUrl && (
                      <a href={r.imageUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" /> Image
                      </a>
                    )}
                    {canUpdate(r) && (
                      <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => { setSelected(r); setView("update") }}>
                        Update
                      </Button>
                    )}
                    {isAdmin && r.status === "pending" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200"
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
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
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
