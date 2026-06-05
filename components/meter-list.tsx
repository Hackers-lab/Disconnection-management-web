"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  Search, X, Plus, RefreshCw, Loader2, Check, AlertCircle,
  Printer, ChevronLeft, ChevronRight, RotateCcw, Package,
  ArrowLeft, Upload, ChevronDown, ChevronUp, FileDown, ClipboardCheck,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import type { MeterStock, MeterIssue, StockSummary, MeterTypeLabel } from "@/lib/meter-types"
import { METER_TYPES } from "@/lib/meter-types"
import { MeterIssueForm } from "@/components/meter-issue-form"
import { MeterCompleteForm } from "@/components/meter-complete-form"
import { printMeterSlip } from "@/components/meter-slip"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import * as XLSX from "xlsx"

const ADMIN_CACHE_KEY  = "meter_stock_cache"
const AGENCY_CACHE_KEY = "meter_issues_cache"

type Tab = "stock" | "active" | "history" | "reports"
type View = "list" | "issue" | "complete" | "addstock"
type SyncState = "idle" | "loading" | "updated"

const PURPOSE_LABELS: Record<string, string> = {
  faulty_replacement: "Faulty Replacement",
  burnt_replacement:  "Burnt Replacement",
  slow_fast:          "Slow/Fast",
  nsc:                "NSC",
}

const STATUS_COLORS: Record<string, string> = {
  issued:            "bg-yellow-100 text-yellow-800",
  installation_done: "bg-teal-100 text-teal-800",
  installed:         "bg-green-100 text-green-800",
  returned:          "bg-gray-100 text-gray-700",
}

const STATUS_LABELS: Record<string, string> = {
  issued:            "Issued",
  installation_done: "Installation Done",
  installed:         "Installed",
  returned:          "Returned",
}

interface Props {
  userRole: string
  userAgencies: string[]
  username: string
  agencies: string[]
}

export function MeterList({ userRole, userAgencies, username, agencies }: Props) {
  const { toast } = useToast()
  const isAdmin = userRole === "admin" || userRole === "executive"

  const [summary, setSummary]   = useState<StockSummary[]>([])
  const [stock, setStock]       = useState<MeterStock[]>([])
  const [issues, setIssues]     = useState<MeterIssue[]>([])
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [tab, setTab]           = useState<Tab>(isAdmin ? "stock" : "active")
  const [view, setView]         = useState<View>("list")
  const [search, setSearch]     = useState("")
  const [selected, setSelected] = useState<MeterIssue | null>(null)
  const [page, setPage]         = useState(1)
  const [selectedForSlip, setSelectedForSlip] = useState<Set<string>>(new Set())
  const [stockOpen, setStockOpen]             = useState(false)
  const [finalizeTarget, setFinalizeTarget]   = useState<MeterIssue | null>(null)
  const [finalizeRef, setFinalizeRef]         = useState("")
  const [finalizeInstNo, setFinalizeInstNo]   = useState("")
  const [finalizing, setFinalizing]           = useState(false)
  const PAGE = 20

  // ── Load data ──────────────────────────────────────────────────────────────
  const load = async (silent = false) => {
    if (!silent) setSyncState("loading")
    try {
      if (isAdmin) {
        // 1. Instant cache hit
        const cached = await getFromCache<{ summary: StockSummary[]; stock: MeterStock[]; issues: MeterIssue[] }>(ADMIN_CACHE_KEY)
        if (cached) {
          setSummary(cached.summary || [])
          setStock(cached.stock || [])
          setIssues(cached.issues || [])
          if (!silent) setSyncState("idle")
        }
        // 2. Fetch fresh
        const res = await fetch("/api/meters/stock")
        if (!res.ok) throw new Error()
        const data = await res.json()
        const sorted = [...(data.issues || [])].reverse()
        setSummary(data.summary || [])
        setStock(data.stock || [])
        setIssues(sorted)
        await saveToCache(ADMIN_CACHE_KEY, { summary: data.summary || [], stock: data.stock || [], issues: sorted })
      } else {
        // 1. Instant cache hit
        const cached = await getFromCache<MeterIssue[]>(AGENCY_CACHE_KEY)
        if (cached) {
          setIssues(cached)
          if (!silent) setSyncState("idle")
        }
        // 2. Fetch fresh
        const res = await fetch("/api/meters/issue")
        if (!res.ok) throw new Error()
        const data: MeterIssue[] = await res.json()
        const sorted = [...data].reverse()
        setIssues(sorted)
        await saveToCache(AGENCY_CACHE_KEY, sorted)
      }
      setSyncState("updated")
      setTimeout(() => setSyncState("idle"), 3000)
    } catch {
      setSyncState("idle")
      if (!silent) toast({ title: "Failed to load meter data", variant: "destructive" })
    }
  }

  useEffect(() => {
    load()
    if (!isAdmin) setTab("active") // agency always starts on active issues
  }, [])

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filteredIssues = useMemo(() => {
    let data = issues
    if (tab === "active")  data = data.filter(i => i.status === "issued" || i.status === "installation_done")
    if (tab === "history") data = data.filter(i => i.status === "installed" || i.status === "returned")
    if (!isAdmin) {
      const upper = userAgencies.map(a => a.toUpperCase())
      data = data.filter(i => upper.includes(i.agency.toUpperCase()))
    }
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(i =>
        i.issueId.toLowerCase().includes(q) ||
        i.serialNo.toLowerCase().includes(q) ||
        i.consumerId.includes(q) ||
        i.consumerName.toLowerCase().includes(q) ||
        i.agency.toLowerCase().includes(q) ||
        i.nscReceiveNo.toLowerCase().includes(q)
      )
    }
    return data
  }, [issues, tab, search, isAdmin, userAgencies])

  const totalPages = Math.ceil(filteredIssues.length / PAGE)
  const paginated  = filteredIssues.slice((page - 1) * PAGE, page * PAGE)
  useEffect(() => setPage(1), [tab, search])

  // ── Slip selection ────────────────────────────────────────────────────────
  const toggleSlip = (id: string) =>
    setSelectedForSlip(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const printSelected = () => {
    const toPrint = filteredIssues.filter(i => selectedForSlip.has(i.issueId))
    if (toPrint.length === 0) { toast({ title: "Select at least one issue to print" }); return }
    printMeterSlip(toPrint)
  }

  // ── Return handler ────────────────────────────────────────────────────────
  const handleReturn = async (issue: MeterIssue) => {
    const remarks = prompt("Return remarks (required):")
    if (!remarks) return
    const faulty = confirm("Mark meter as Faulty? OK = Faulty, Cancel = Back to Available")
    try {
      const res = await fetch("/api/meters/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: issue.issueId, remarks, faulty }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast({ title: "Meter returned to stock" })
      load(true)
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }) }
  }

  // ── Finalize handler ─────────────────────────────────────────────────────
  const handleFinalize = async () => {
    if (!finalizeTarget || !finalizeRef.trim()) { alert("Completion reference is required."); return }
    setFinalizing(true)
    try {
      const res = await fetch("/api/meters/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId:        finalizeTarget.issueId,
          completionRef:  finalizeRef.trim(),
          installationNo: finalizeInstNo.trim(),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast({ title: "Installation finalized", description: `Note: ${finalizeRef.trim()}` })
      setFinalizeTarget(null); setFinalizeRef(""); setFinalizeInstNo(""); load(true)
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }) }
    finally { setFinalizing(false) }
  }

  // ── Export handler ────────────────────────────────────────────────────────
  const exportIssues = () => {
    if (filteredIssues.length === 0) { toast({ title: "No data to export" }); return }
    const rows = filteredIssues.map(i => ({
      "Issue ID":       i.issueId,
      "Issue Date":     i.issueDate,
      "Purpose":        PURPOSE_LABELS[i.purpose] || i.purpose,
      "Consumer ID":    i.consumerId,
      "NSC Receive No": i.nscReceiveNo,
      "Consumer Name":  i.consumerName,
      "Agency":         i.agency,
      "Serial No":      i.serialNo,
      "Meter Type":     i.meterType,
      "Status":         STATUS_LABELS[i.status] || i.status,
      "Last Reading":   i.lastReading,
      "New Reading":    i.newReading,
      "Completion Ref": i.completionRef,
      "Completed At":   i.completedAt,
      "Completed By":   i.completedBy,
      "Remarks":        i.remarks,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Meter Issues")
    XLSX.writeFile(wb, `meter-issues-${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── Sub-views ─────────────────────────────────────────────────────────────
  if (view === "issue") return (
    <MeterIssueForm
      availableStock={stock}
      agencies={agencies}
      onSave={id => { toast({ title: "Meter issued", description: `Issue ID: ${id}` }); setView("list"); load(true) }}
      onCancel={() => setView("list")}
    />
  )

  if (view === "complete" && selected) return (
    <MeterCompleteForm
      issue={selected}
      onSave={() => { toast({ title: "Installation completed" }); setSelected(null); setView("list"); load(true) }}
      onCancel={() => { setSelected(null); setView("list") }}
    />
  )

  if (view === "addstock") return <AddStockForm onSave={() => { setView("list"); load(true) }} onCancel={() => setView("list")} />

  // ── Main list ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Stock summary — admin/executive only */}
      {isAdmin && summary.length > 0 && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <button className="font-semibold text-gray-800 flex items-center gap-2" onClick={() => setStockOpen(o => !o)}>
              <Package className="h-4 w-4 text-blue-600" /> Stock Dashboard
              {stockOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
            <Button size="sm" variant="outline" onClick={() => setView("addstock")}>
              <Plus className="h-4 w-4 mr-1" /> Add Stock
            </Button>
          </div>
          {stockOpen && <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
                <tr>
                  <th className="px-3 py-2 text-left">Meter Type</th>
                  <th className="px-3 py-2 text-center text-green-700">Available</th>
                  <th className="px-3 py-2 text-center text-yellow-700">Issued</th>
                  <th className="px-3 py-2 text-center text-blue-700">Installed</th>
                  <th className="px-3 py-2 text-center text-red-700">Faulty</th>
                  <th className="px-3 py-2 text-center">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summary.map(s => (
                  <tr key={s.label} className={s.available === 0 ? "bg-red-50" : ""}>
                    <td className="px-3 py-2 font-medium">{s.label}{s.available === 0 && <span className="ml-2 text-red-600 font-bold">⚠ OUT</span>}</td>
                    <td className="px-3 py-2 text-center font-bold text-green-700">{s.available}</td>
                    <td className="px-3 py-2 text-center text-yellow-700">{s.issued}</td>
                    <td className="px-3 py-2 text-center text-blue-700">{s.installed}</td>
                    <td className="px-3 py-2 text-center text-red-700">{s.faulty}</td>
                    <td className="px-3 py-2 text-center text-gray-500">{s.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {/* Controls */}
      <div className="bg-white p-4 rounded-lg shadow-sm border space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search issue ID, serial, consumer, agency..." className="pl-10 pr-8" />
            {search && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" onClick={() => setSearch("")} />}
          </div>
          {isAdmin && selectedForSlip.size > 0 && (
            <Button size="sm" variant="outline" onClick={printSelected} className="shrink-0">
              <Printer className="h-4 w-4 mr-1" /> Print ({selectedForSlip.size})
            </Button>
          )}
          {tab !== "stock" && (
            <Button size="sm" variant="ghost" onClick={exportIssues} className="shrink-0" title="Export to Excel">
              <FileDown className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => load()} className="shrink-0">
            <RefreshCw className={`h-4 w-4 ${syncState === "loading" ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {(isAdmin ? ["stock", "active", "history", "reports"] as Tab[] : ["active", "history"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition ${tab === t ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t === "stock" ? "All Stock"
               : t === "active" ? `Active (${issues.filter(i => (i.status === "issued" || i.status === "installation_done") && (isAdmin || userAgencies.map(a=>a.toUpperCase()).includes(i.agency.toUpperCase()))).length})`
               : t === "history" ? "History"
               : "Reports"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{filteredIssues.length} records</span>
          {syncState === "updated" && <span className="flex items-center gap-1 text-green-600"><Check className="h-3 w-3" /> Updated</span>}
        </div>
      </div>

      {/* Issue cards */}
      {tab !== "stock" && tab !== "reports" && (
        <div className="space-y-3">
          {paginated.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No meter issues found</p>
            </div>
          ) : paginated.map(issue => (
            <Card key={issue.issueId} className={`overflow-hidden ${issue.status === "issued" && isAdmin ? "cursor-pointer" : ""}`}>
              <CardContent className="p-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isAdmin && issue.status === "issued" && (
                        <input type="checkbox" checked={selectedForSlip.has(issue.issueId)}
                          onChange={() => toggleSlip(issue.issueId)} className="shrink-0" />
                      )}
                      <span className="font-mono text-xs text-gray-400">{issue.issueId}</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-blue-700 font-medium">{PURPOSE_LABELS[issue.purpose]}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="font-mono font-bold text-blue-800">{issue.serialNo}</span>
                      <span className="text-xs text-gray-500">{issue.meterType}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {issue.consumerName && <span className="font-medium">{issue.consumerName} </span>}
                      {issue.consumerId && <span className="font-mono">({issue.consumerId})</span>}
                      {issue.nscReceiveNo && <span className="font-mono text-green-700">NSC: {issue.nscReceiveNo}</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Agency: <span className="font-medium">{issue.agency}</span>
                      <span className="ml-2 text-gray-400">Issued: {issue.issueDate}</span>
                    </p>
                    {issue.status !== "issued" && issue.completedAt && (
                      <p className="text-xs text-gray-400">Completed: {issue.completedAt} | Ref: {issue.completionRef}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge className={STATUS_COLORS[issue.status] || ""}>{STATUS_LABELS[issue.status] || issue.status}</Badge>
                  </div>
                </div>

                {issue.status === "issued" && (
                  <div className="flex gap-2 mt-3 pt-3 border-t">
                    {/* Agency: complete installation */}
                    {!isAdmin && (
                      <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white h-8"
                        onClick={() => { setSelected(issue); setView("complete") }}>
                        Mark Installed
                      </Button>
                    )}
                    {/* Admin: return to stock + print */}
                    {isAdmin && (
                      <>
                        <Button size="sm" variant="outline" className="flex-1 h-8 text-orange-700 border-orange-200"
                          onClick={() => handleReturn(issue)}>
                          <RotateCcw className="h-3 w-3 mr-1" /> Return
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 px-2"
                          onClick={() => { setSelectedForSlip(new Set([issue.issueId])); printMeterSlip([issue]) }}>
                          <Printer className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {/* Admin: finalize installation_done */}
                {issue.status === "installation_done" && isAdmin && (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <div className="flex gap-3 text-xs text-gray-500">
                      {issue.afterImage && <a href={issue.afterImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">After ↗</a>}
                      {issue.beforeImage && <a href={issue.beforeImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Before ↗</a>}
                      {issue.newReading && <span>New reading: <strong>{issue.newReading}</strong></span>}
                    </div>
                    <Button size="sm" className="w-full h-8 bg-teal-600 hover:bg-teal-700 text-white"
                      onClick={() => { setFinalizeTarget(issue); setFinalizeRef("") }}>
                      <ClipboardCheck className="h-3 w-3 mr-1" /> Finalize Installation
                    </Button>
                  </div>
                )}

                {/* Agency: installation_done is read-only */}
                {issue.status === "installation_done" && !isAdmin && (
                  <div className="mt-3 pt-3 border-t text-xs text-teal-700 font-medium flex items-center gap-1">
                    <Check className="h-3 w-3" /> Submitted — awaiting admin finalization
                  </div>
                )}

                {(issue.status === "installed") && (
                  <div className="flex gap-3 mt-2 text-xs text-gray-500">
                    {issue.afterImage && <a href={issue.afterImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">After ↗</a>}
                    {issue.beforeImage && <a href={issue.beforeImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Before ↗</a>}
                    {issue.newReading && <span>New reading: <strong>{issue.newReading}</strong></span>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Previous
          </Button>
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {/* ─── Reports tab ──────────────────────────────────────────────────────── */}
      {tab === "reports" && isAdmin && (
        <ReportsPanel issues={issues} summary={summary} onExport={exportIssues} />
      )}

      {/* Sticky bottom — Issue Meter */}
      {isAdmin && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-2xl text-base font-semibold flex items-center justify-center gap-2 py-3"
              onClick={() => setView("issue")}>
              <Plus className="h-5 w-5" /> Issue Meter
            </Button>
          </div>
        </div>
      )}

      {/* Finalize modal */}
      {finalizeTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold">Finalize Installation</h2>
              <p className="text-sm text-gray-500 mt-0.5">{finalizeTarget.issueId} — {finalizeTarget.consumerName || finalizeTarget.consumerId || finalizeTarget.nscReceiveNo}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
              <div className="flex justify-between"><span>Serial No</span><span className="font-mono font-semibold">{finalizeTarget.serialNo}</span></div>
              <div className="flex justify-between"><span>Agency</span><span className="font-medium">{finalizeTarget.agency}</span></div>
              {finalizeTarget.afterImage && (
                <a href={finalizeTarget.afterImage} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-xs block">View after-installation image ↗</a>
              )}
            </div>
            <div className="space-y-2">
              <Label>Note Number *</Label>
              <Input
                value={finalizeRef}
                onChange={e => setFinalizeRef(e.target.value)}
                placeholder="e.g. JE Note No. / WO-1234"
                autoFocus
              />
            </div>
            {finalizeTarget?.purpose === "nsc" && (
              <div className="space-y-2">
                <Label>Installation Number <span className="text-gray-400 font-normal">(NSC)</span></Label>
                <Input
                  value={finalizeInstNo}
                  onChange={e => setFinalizeInstNo(e.target.value)}
                  placeholder="e.g. INST/26-27/0001"
                />
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => { setFinalizeTarget(null); setFinalizeRef(""); setFinalizeInstNo("") }} disabled={finalizing}>
                Cancel
              </Button>
              <Button className="flex-[2] bg-teal-600 hover:bg-teal-700 text-white" onClick={handleFinalize} disabled={finalizing || !finalizeRef.trim()}>
                {finalizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ClipboardCheck className="h-4 w-4 mr-2" />}
                {finalizing ? "Finalizing..." : "Confirm & Finalize"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Reports Panel ─────────────────────────────────────────────────────────────
function ReportsPanel({ issues, summary, onExport }: { issues: MeterIssue[]; summary: StockSummary[]; onExport: () => void }) {
  const { toast } = useToast()

  const totalIssued          = issues.filter(i => i.status === "issued").length
  const totalPendingFinal    = issues.filter(i => i.status === "installation_done").length
  const totalInstalled       = issues.filter(i => i.status === "installed").length
  const totalReturned        = issues.filter(i => i.status === "returned").length

  const purposeBreakdown = [
    { label: "Faulty Replacement",  key: "faulty_replacement" },
    { label: "Burnt Replacement",   key: "burnt_replacement" },
    { label: "Slow/Fast",           key: "slow_fast" },
    { label: "NSC",                 key: "nsc" },
  ].map(p => ({
    ...p,
    issued:    issues.filter(i => i.purpose === p.key && i.status === "issued").length,
    pending:   issues.filter(i => i.purpose === p.key && i.status === "installation_done").length,
    installed: issues.filter(i => i.purpose === p.key && i.status === "installed").length,
    returned:  issues.filter(i => i.purpose === p.key && i.status === "returned").length,
    total:     issues.filter(i => i.purpose === p.key).length,
  }))

  const meterTypeBreakdown = Array.from(new Set(issues.map(i => i.meterType).filter(Boolean))).map(type => ({
    type,
    issued:    issues.filter(i => i.meterType === type && i.status === "issued").length,
    pending:   issues.filter(i => i.meterType === type && i.status === "installation_done").length,
    installed: issues.filter(i => i.meterType === type && i.status === "installed").length,
    returned:  issues.filter(i => i.meterType === type && i.status === "returned").length,
    total:     issues.filter(i => i.meterType === type).length,
  })).sort((a, b) => b.total - a.total)

  const agencyBreakdown = Array.from(new Set(issues.map(i => i.agency).filter(Boolean))).map(agency => ({
    agency,
    issued:    issues.filter(i => i.agency === agency && i.status === "issued").length,
    pending:   issues.filter(i => i.agency === agency && i.status === "installation_done").length,
    installed: issues.filter(i => i.agency === agency && i.status === "installed").length,
    returned:  issues.filter(i => i.agency === agency && i.status === "returned").length,
    total:     issues.filter(i => i.agency === agency).length,
  })).sort((a, b) => b.total - a.total)

  const exportReport = () => {
    const wb = XLSX.utils.book_new()
    // Summary sheet
    const summaryRows = [
      ["Metric", "Count"],
      ["Currently Issued (Pending Installation)", totalIssued],
      ["Installation Done (Pending Finalization)", totalPendingFinal],
      ["Fully Installed (Finalized)", totalInstalled],
      ["Returned to Stock", totalReturned],
      ["Total Issues Ever", issues.length],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary")
    // Issue type sheet
    const ptRows = [["Issue Type", "Issued", "Pending Final.", "Installed", "Returned", "Total"],
      ...purposeBreakdown.map(p => [p.label, p.issued, p.pending, p.installed, p.returned, p.total])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ptRows), "By Issue Type")
    // Meter type sheet
    const mtRows = [["Meter Type", "Issued", "Pending Final.", "Installed", "Returned", "Total"],
      ...meterTypeBreakdown.map(m => [m.type, m.issued, m.pending, m.installed, m.returned, m.total])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mtRows), "By Meter Type")
    // Agency sheet
    const agRows = [["Agency", "Issued", "Pending Final.", "Installed", "Returned", "Total"],
      ...agencyBreakdown.map(a => [a.agency, a.issued, a.pending, a.installed, a.returned, a.total])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(agRows), "By Agency")
    // Stock utilization sheet
    const stRows = [["Meter Type", "Available", "Issued", "Installed", "Faulty", "Total"],
      ...summary.map(s => [s.label, s.available, s.issued, s.installed, s.faulty, s.total])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stRows), "Stock Utilization")
    // Raw issues sheet
    const rawRows = issues.map(i => ({
      "Issue ID": i.issueId, "Date": i.issueDate, "Purpose": i.purpose,
      "Consumer ID": i.consumerId, "NSC No": i.nscReceiveNo, "Consumer Name": i.consumerName,
      "Agency": i.agency, "Serial No": i.serialNo, "Meter Type": i.meterType,
      "Status": i.status, "Note No": i.completionRef, "Installation No": i.installationNo,
      "Completed At": i.completedAt, "Completed By": i.completedBy, "Remarks": i.remarks,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawRows), "All Issues")
    XLSX.writeFile(wb, `meter-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "Report exported" })
  }

  const StatCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className={`rounded-xl p-4 border ${color}`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  )

  const BreakdownTable = ({ title, rows, cols }: { title: string; rows: Record<string, any>[]; cols: { key: string; label: string; className?: string }[] }) => (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-600 border-b">
            <tr>{cols.map(c => <th key={c.key} className={`px-3 py-2 text-left ${c.className || ""}`}>{c.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {cols.map(c => <td key={c.key} className={`px-3 py-2 ${c.className || ""}`}>{row[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Issued / Pending" value={totalIssued} color="bg-yellow-50 border-yellow-200" />
        <StatCard label="Awaiting Finalization" value={totalPendingFinal} color="bg-teal-50 border-teal-200" />
        <StatCard label="Fully Installed" value={totalInstalled} color="bg-green-50 border-green-200" />
        <StatCard label="Returned" value={totalReturned} color="bg-gray-50 border-gray-200" />
      </div>

      {/* Stock utilization */}
      {summary.length > 0 && (
        <BreakdownTable
          title="Stock Utilization"
          cols={[
            { key: "label",     label: "Meter Type" },
            { key: "available", label: "Available",  className: "text-green-700 font-semibold" },
            { key: "issued",    label: "Issued",     className: "text-yellow-700" },
            { key: "installed", label: "Installed",  className: "text-blue-700" },
            { key: "faulty",    label: "Faulty",     className: "text-red-700" },
            { key: "total",     label: "Total",      className: "text-gray-500" },
          ]}
          rows={summary}
        />
      )}

      {/* Issue type breakdown */}
      <BreakdownTable
        title="By Issue Type"
        cols={[
          { key: "label",     label: "Type" },
          { key: "issued",    label: "Issued",   className: "text-yellow-700" },
          { key: "pending",   label: "Pending",  className: "text-teal-700" },
          { key: "installed", label: "Done",     className: "text-green-700" },
          { key: "returned",  label: "Returned", className: "text-gray-500" },
          { key: "total",     label: "Total",    className: "font-semibold" },
        ]}
        rows={purposeBreakdown}
      />

      {/* Meter type breakdown */}
      {meterTypeBreakdown.length > 0 && (
        <BreakdownTable
          title="By Meter Type"
          cols={[
            { key: "type",      label: "Meter Type" },
            { key: "issued",    label: "Issued",   className: "text-yellow-700" },
            { key: "pending",   label: "Pending",  className: "text-teal-700" },
            { key: "installed", label: "Done",     className: "text-green-700" },
            { key: "returned",  label: "Returned", className: "text-gray-500" },
            { key: "total",     label: "Total",    className: "font-semibold" },
          ]}
          rows={meterTypeBreakdown}
        />
      )}

      {/* Agency breakdown */}
      {agencyBreakdown.length > 0 && (
        <BreakdownTable
          title="By Agency"
          cols={[
            { key: "agency",    label: "Agency" },
            { key: "issued",    label: "Issued",   className: "text-yellow-700" },
            { key: "pending",   label: "Pending",  className: "text-teal-700" },
            { key: "installed", label: "Done",     className: "text-green-700" },
            { key: "returned",  label: "Returned", className: "text-gray-500" },
            { key: "total",     label: "Total",    className: "font-semibold" },
          ]}
          rows={agencyBreakdown}
        />
      )}

      {/* Export */}
      <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11" onClick={exportReport}>
        <FileDown className="h-4 w-4 mr-2" /> Export Full Report (Excel)
      </Button>
    </div>
  )
}

// ── Add Stock sub-form ────────────────────────────────────────────────────────
function AddStockForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  type EntryMode = "individual" | "range" | "excel"
  const [mode, setMode]         = useState<EntryMode>("individual")
  const [typeLabel, setTypeLabel] = useState<MeterTypeLabel | "">("")
  const [serial, setSerial]     = useState("")
  const [prefix, setPrefix]     = useState("")
  const [rangeStart, setRangeStart] = useState("")
  const [rangeEnd, setRangeEnd]   = useState("")
  const [batchRemarks, setBatchRemarks] = useState("")
  const [preview, setPreview]   = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const previewRange = () => {
    const s = parseInt(rangeStart, 10), e = parseInt(rangeEnd, 10)
    if (isNaN(s) || isNaN(e) || e < s) { setPreview([]); return }
    const pad = Math.max(rangeStart.length, rangeEnd.length)
    const arr: string[] = []
    for (let i = s; i <= e && arr.length < 10; i++) arr.push(prefix + String(i).padStart(pad, "0"))
    if (e - s + 1 > 10) arr.push(`... +${e - s + 1 - 10} more`)
    setPreview(arr)
  }

  const handleExcel = (file: File) => {
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws)
      const meters = rows.map(r => ({
        serialNo:    String(r["Serial No"] || r["serial_no"] || r["SerialNo"] || "").trim(),
        typeLabel:   String(r["Type Label"] || r["type_label"] || r["TypeLabel"] || "").trim() as MeterTypeLabel,
        batchRemarks: String(r["Remarks"] || "").trim(),
      })).filter(m => m.serialNo && m.typeLabel)
      if (meters.length === 0) { toast({ title: "No valid rows found in Excel", variant: "destructive" }); return }
      setSubmitting(true)
      try {
        const res = await fetch("/api/meters/stock", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meters }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        toast({ title: `${data.added} meters added from Excel` })
        onSave()
      } catch (e: any) { toast({ title: e.message, variant: "destructive" }) }
      finally { setSubmitting(false) }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleSubmit = async () => {
    if (!typeLabel) { alert("Select meter type."); return }
    let meters: { serialNo: string; typeLabel: MeterTypeLabel; batchRemarks?: string }[] = []
    if (mode === "individual") {
      if (!serial.trim()) { alert("Enter serial number."); return }
      meters = [{ serialNo: serial.trim(), typeLabel, batchRemarks }]
    } else {
      const s = parseInt(rangeStart, 10), e = parseInt(rangeEnd, 10)
      if (isNaN(s) || isNaN(e) || e < s) { alert("Invalid range."); return }
      if (!prefix.trim()) { alert("Enter prefix."); return }
      const pad = Math.max(rangeStart.length, rangeEnd.length)
      for (let i = s; i <= e; i++) meters.push({ serialNo: prefix + String(i).padStart(pad, "0"), typeLabel, batchRemarks })
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/meters/stock", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meters }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: `${data.added} meter${data.added > 1 ? "s" : ""} added to stock` })
      onSave()
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }) }
    finally { setSubmitting(false) }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Add Meters to Stock</h1>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Entry mode */}
          <div className="grid grid-cols-3 gap-2">
            {(["individual", "range", "excel"] as EntryMode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className={`py-2 rounded-lg text-xs font-semibold border transition ${mode === m ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
                {m === "individual" ? "One by One" : m === "range" ? "Range" : "Excel Upload"}
              </button>
            ))}
          </div>

          {/* Meter type */}
          {mode !== "excel" && (
            <div className="space-y-2">
              <Label>Meter Type *</Label>
              <Select value={typeLabel} onValueChange={v => setTypeLabel(v as MeterTypeLabel)}>
                <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  {METER_TYPES.map(t => <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "individual" && (
            <div className="space-y-2">
              <Label>Serial Number *</Label>
              <Input value={serial} onChange={e => setSerial(e.target.value.toUpperCase())} placeholder="e.g. MFG00123" className="font-mono" />
            </div>
          )}

          {mode === "range" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Manufacturer Prefix</Label>
                <Input value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} placeholder="e.g. SGB" className="font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Start Number</Label>
                  <Input value={rangeStart} onChange={e => setRangeStart(e.target.value.replace(/\D/g, ""))} placeholder="001" className="font-mono" onBlur={previewRange} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">End Number</Label>
                  <Input value={rangeEnd} onChange={e => setRangeEnd(e.target.value.replace(/\D/g, ""))} placeholder="050" className="font-mono" onBlur={previewRange} />
                </div>
              </div>
              {preview.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 space-y-0.5">
                  <p className="font-semibold text-gray-700 mb-1">Preview:</p>
                  {preview.map((s, i) => <p key={i}>{s}</p>)}
                </div>
              )}
            </div>
          )}

          {mode === "excel" && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Excel columns required: <span className="font-mono">Serial No, Type Label</span> (optional: Remarks)</p>
              <p className="text-xs text-gray-400">Type Label must match exactly, e.g. "3P 10-60A Smart"</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && handleExcel(e.target.files[0])} />
              <Button variant="outline" className="w-full h-12" onClick={() => fileRef.current?.click()} disabled={submitting}>
                <Upload className="h-4 w-4 mr-2" /> Select Excel / CSV File
              </Button>
            </div>
          )}

          {mode !== "excel" && (
            <div className="space-y-2">
              <Label>Batch Remarks (optional)</Label>
              <Input value={batchRemarks} onChange={e => setBatchRemarks(e.target.value)} placeholder="e.g. Batch 2026-Jun, Supplier X" />
            </div>
          )}
        </CardContent>
      </Card>

      {mode !== "excel" && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t z-50 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>Cancel</Button>
          <Button className="flex-[2] h-12 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {submitting ? "Adding..." : "Add to Stock"}
          </Button>
        </div>
      )}
    </div>
  )
}

