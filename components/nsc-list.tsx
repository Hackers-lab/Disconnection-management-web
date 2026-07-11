"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import {
  Search, X, Plus, RefreshCw, Check, ChevronLeft, ChevronRight,
  FileDown, Phone, MapPin, ClipboardList, Clock, FolderOpen, FileInput, Pencil, MoreVertical,
} from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import { NSC_STATUS_COLORS, NSC_STATUS_LABELS, NSC_CLASSES } from "@/lib/nsc-types"
import type { NSCApplication } from "@/lib/nsc-types"
import { NscApplicationForm } from "@/components/nsc-application-form"
import { NscInspectForm } from "@/components/nsc-inspect-form"
import { NscProcessForm } from "@/components/nsc-process-form"
// xlsx loaded dynamically to reduce bundle size
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  CreateProjectForm, ProjectPOForm,
  AgencyCompleteProjectForm, AdminApproveProjectForm,
  LegacyImportPanel, ProjectCard,
} from "@/components/nsc-project-form"
import type { NSCProject } from "@/lib/nsc-types"

const CACHE_KEY = "nsc_data_cache"
const PAGE = 20

type Tab  = "all" | "pending" | "inspected" | "completed" | "projects" | "reports"
type View = "list" | "create" | "inspect" | "process"
type SyncState = "idle" | "loading" | "updated"

const CLASS_LABELS: Record<string, string> = {
  domestic:   "LT Domestic",
  commercial: "LT Commercial",
  stw:        "STW",
  industrial: "LT Industrial",
}

interface Props {
  userRole:     string
  userAgencies: string[]
  username:     string
  agencies:     string[]
}

export function NscList({ userRole, userAgencies, username, agencies }: Props) {
  const { toast } = useToast()
  const isAdmin  = userRole === "admin" || userRole === "executive"
  const isAgency = userRole === "agency"

  const [apps, setApps]         = useState<NSCApplication[]>([])
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [tab, setTab]           = useState<Tab>("all")
  const [view, setView]         = useState<View>("list")
  const [search, setSearch]     = useState("")
  const [selected, setSelected] = useState<NSCApplication | null>(null)
  const [historyApp, setHistoryApp] = useState<NSCApplication | null>(null)
  const [page, setPage]         = useState(1)

  // Project state (additive)
  const [projects, setProjects]                 = useState<NSCProject[]>([])
  const [projectDialogApp, setProjectDialogApp] = useState<NSCApplication | null>(null)
  const [showLegacyImport, setShowLegacyImport] = useState(false)
  const [selectedProject, setSelectedProject]   = useState<NSCProject | null>(null)
  const [projectAction, setProjectAction]       = useState<"po" | "complete" | "approve" | null>(null)
  const [editingRefApp, setEditingRefApp]       = useState<NSCApplication | null>(null)
  const [refNoInput, setRefNoInput]             = useState("")
  const [savingRefNo, setSavingRefNo]           = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async (silent = false) => {
    if (!silent) setSyncState("loading")
    try {
      const cached = await getFromCache<NSCApplication[]>(CACHE_KEY)
      if (cached) { setApps(cached); if (!silent) setSyncState("idle") }
      const res = await fetch("/api/nsc")
      if (!res.ok) throw new Error()
      const data: NSCApplication[] = await res.json()
      const sorted = [...data].reverse()
      setApps(sorted)
      await saveToCache(CACHE_KEY, sorted)
      setSyncState("updated")
      setTimeout(() => setSyncState("idle"), 3000)
      window.dispatchEvent(new Event("notif-refresh"))
    } catch {
      setSyncState("idle")
      if (!silent) toast({ title: "Failed to load NSC data", variant: "destructive" })
    }
  }

  useEffect(() => { load() }, [])

  // Load projects (admin + agency)
  useEffect(() => {
    fetch("/api/nsc/project").then(r => r.ok ? r.json() : []).then(setProjects).catch(() => {})
  }, [])

  // Build receiveNo → project map
  const projectMap = useMemo(() => {
    const map: Record<string, NSCProject> = {}
    projects.forEach(p => {
      p.linkedApps.split(",").forEach(rn => { const t = rn.trim(); if (t) map[t] = p })
    })
    return map
  }, [projects])

  const reloadProjects = () =>
    fetch("/api/nsc/project").then(r => r.ok ? r.json() : []).then(setProjects).catch(() => {})

  const saveRefNo = async () => {
    if (!editingRefApp) return
    setSavingRefNo(true)
    try {
      const res = await fetch("/api/nsc/office-ref", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiveNo: editingRefApp.receiveNo, officeRefNo: refNoInput }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setApps(prev => prev.map(a => a.receiveNo === editingRefApp.receiveNo ? { ...a, officeRefNo: refNoInput } : a))
      setEditingRefApp(null)
      toast({ title: "Office reference number saved" })
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally {
      setSavingRefNo(false)
    }
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let data = apps
    if (tab === "pending")   data = data.filter(a => a.status === "pending")
    if (tab === "inspected") data = data.filter(a => a.status === "inspected")
    if (tab === "completed") data = data.filter(a => ["quotation_issued", "dispute_issued", "project_required", "project_ongoing", "project_done"].includes(a.status))
    if (tab === "projects")  data = data.filter(a => ["project_required", "project_ongoing", "project_done"].includes(a.status))
    if (isAgency) {
      const upper = userAgencies.map(a => a.toUpperCase())
      data = data.filter(a => upper.includes(a.agency.toUpperCase()))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      data = data.filter(a =>
        a.receiveNo.toLowerCase().includes(q)               ||
        (a.officeRefNo || "").toLowerCase().includes(q)     ||
        a.applicantName.toLowerCase().includes(q)           ||
        a.careOf.toLowerCase().includes(q)                  ||
        a.address.toLowerCase().includes(q)                 ||
        a.mobile.includes(q)                                ||
        a.agency.toLowerCase().includes(q)
      )
    }
    return data
  }, [apps, tab, search, isAgency, userAgencies])

  const totalPages = Math.ceil(filtered.length / PAGE)
  const paginated  = filtered.slice((page - 1) * PAGE, page * PAGE)
  useEffect(() => setPage(1), [tab, search])

  // ── Tab counts ────────────────────────────────────────────────────────────
  const scopedApps = isAgency
    ? apps.filter(a => userAgencies.map(x => x.toUpperCase()).includes(a.agency.toUpperCase()))
    : apps
  const pendingCount    = scopedApps.filter(a => a.status === "pending").length
  const inspectedCount  = scopedApps.filter(a => a.status === "inspected").length
  const projectCount    = scopedApps.filter(a => ["project_required", "project_ongoing", "project_done"].includes(a.status)).length

  // ── Export ────────────────────────────────────────────────────────────────
  const exportData = async () => {
    if (filtered.length === 0) { toast({ title: "No data to export" }); return }
    const rows = filtered.map(a => ({
      "Receive No":        a.receiveNo,
      "Received Date":     a.receivedDate,
      "Applicant Name":    a.applicantName,
      "C/O":               a.careOf,
      "Address":           a.address,
      "Mobile":            a.mobile,
      "Applied Class":     CLASS_LABELS[a.appliedClass] || a.appliedClass,
      "Phase":             a.phase,
      "Agency":            a.agency,
      "Status":            NSC_STATUS_LABELS[a.status] || a.status,
      "Agency Decision":   a.agencyDecision,
      "Admin Decision":    a.adminDecision,
      "Final Action":      a.finalAction,
      "Application No":    a.applicationNo,
      "Memo No":           a.memoNo,
      "Load (kW)":         a.load,
      "DTR Capacity":      a.dtrCapacity,
      "Pole Required":     a.poleRequired,
      "Inspected At":      a.inspectedAt,
      "Finalized At":      a.finalizedAt,
    }))
    const XLSX = await import("xlsx")
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "NSC Applications")
    XLSX.writeFile(wb, `nsc-${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── Sub-views ─────────────────────────────────────────────────────────────
  if (view === "create") return (
    <NscApplicationForm
      agencies={agencies}
      onSave={rcvNo => { toast({ title: "Application created", description: `Receive No: ${rcvNo}` }); setView("list"); load(true) }}
      onCancel={() => setView("list")}
    />
  )

  if (view === "inspect" && selected) return (
    <NscInspectForm
      app={selected}
      onSave={() => { toast({ title: "Inspection submitted" }); setSelected(null); setView("list"); load(true) }}
      onCancel={() => { setSelected(null); setView("list") }}
    />
  )

  if (view === "process" && selected) return (
    <NscProcessForm
      app={selected}
      agencies={agencies}
      onSave={() => { toast({ title: "Application processed" }); setSelected(null); setView("list"); load(true) }}
      onCancel={() => { setSelected(null); setView("list") }}
    />
  )

  // ── Main list ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Controls */}
      <div className="bg-white p-4 rounded-lg shadow-sm border space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search receive no, name, C/O, address, mobile, agency..."
              className="pl-10 pr-8" />
            {search && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" onClick={() => setSearch("")} />}
          </div>
          {tab !== "reports" && (
            <Button size="sm" variant="ghost" onClick={exportData} className="shrink-0" title="Export">
              <FileDown className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => load()} className="shrink-0">
            <RefreshCw className={`h-4 w-4 ${syncState === "loading" ? "animate-spin" : ""}`} />
          </Button>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowLegacyImport(true)}>
                  <FileInput className="h-4 w-4 mr-2" /> Import Legacy Applications
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {(isAdmin
            ? ["all", "pending", "inspected", "completed", "projects", "reports"] as Tab[]
            : ["all", "pending", "inspected", "completed", "projects"] as Tab[]
          ).map(t => {
            const label =
              t === "all"       ? `All (${scopedApps.length})` :
              t === "pending"   ? `Pending (${pendingCount})` :
              t === "inspected" ? `Inspected (${inspectedCount})` :
              t === "completed" ? "Completed" :
              t === "projects"  ? `Projects${projectCount > 0 ? ` (${projectCount})` : ""}` :
              "Reports"
            return (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition relative ${tab === t ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{filtered.length} records</span>
          {syncState === "updated" && <span className="flex items-center gap-1 text-green-600"><Check className="h-3 w-3" /> Updated</span>}
        </div>
      </div>

      {/* Reports tab */}
      {tab === "reports" && isAdmin && <NscReports apps={apps} />}

      {/* Projects tab */}
      {tab === "projects" && (
        <div className="space-y-3">
          {projects.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No projects yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {projects.map(p => (
                <ProjectCard
                  key={p.projectId}
                  project={p}
                  userRole={userRole}
                  userAgencies={userAgencies}
                  onAction={(proj, action) => { setSelectedProject(proj); setProjectAction(action) }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Application cards */}
      {tab !== "reports" && (
        <div className="space-y-3">
          {paginated.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No NSC applications found</p>
            </div>
          ) : paginated.map(app => (
            <Card key={app.receiveNo} className="hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-200 hover:border-blue-200">
              <CardContent className="p-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-gray-400">{app.receiveNo}</span>
                      {app.officeRefNo && (
                        <>
                          <span className="text-xs text-gray-300">|</span>
                          <span className="font-mono text-xs text-blue-600 font-medium">Ref: {app.officeRefNo}</span>
                        </>
                      )}
                      {app.isLegacy === "true" && <Badge variant="outline" className="text-xs py-0 px-1 text-amber-700 border-amber-300">Legacy</Badge>}
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs font-medium text-gray-600">{CLASS_LABELS[app.appliedClass] || app.appliedClass} · {app.phase}</span>
                    </div>
                    {app.projectId && (
                      <p className="text-xs text-orange-600 font-mono mt-0.5">
                        <FolderOpen className="inline h-3 w-3 mr-1" />{app.projectId}
                      </p>
                    )}
                    <p className="font-bold text-gray-900 mt-0.5">{app.applicantName}</p>
                    {app.careOf && <p className="text-xs text-gray-500">C/O {app.careOf}</p>}
                    <div className="flex items-start gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 text-gray-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-gray-600">{app.address}</p>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <a href={`tel:${app.mobile}`} className="flex items-center gap-1 text-xs text-blue-600 font-mono">
                        <Phone className="h-3 w-3" />{app.mobile}
                      </a>
                      <span className="text-xs text-gray-400">Agency: <span className="font-medium text-gray-600">{app.agency}</span></span>
                    </div>
                    {/* Status summary line */}
                    {app.status !== "pending" && (
                      <div className="mt-1 text-xs text-gray-400">
                        {app.agencyDecision && (
                          <span className={`mr-2 ${app.agencyDecision === "accepted" ? "text-green-600" : "text-red-600"}`}>
                            Agency: {app.agencyDecision}
                          </span>
                        )}
                        {app.adminDecision && (
                          <span className={app.adminDecision === "accepted" ? "text-green-700 font-medium" : "text-red-700 font-medium"}>
                            Admin: {app.adminDecision}
                          </span>
                        )}
                        {app.applicationNo && <span className="ml-2 font-mono text-green-700">App# {app.applicationNo}</span>}
                        {app.memoNo        && <span className="ml-2 font-mono text-orange-700">Memo: {app.memoNo}</span>}
                      </div>
                    )}
                    {app.meterSerialNo && (
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-purple-700">{app.meterSerialNo}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-gray-600">{app.agency}</span>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">{app.receivedDate}</p>
                  </div>
                  <Badge className={`shrink-0 ${NSC_STATUS_COLORS[app.status] || "bg-gray-100 text-gray-700"}`}>
                    {NSC_STATUS_LABELS[app.status] || app.status}
                  </Badge>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 mt-3 pt-3 border-t">
                  {/* Agency: inspect pending apps */}
                  {isAgency && app.status === "pending" && (
                    <Button size="sm" className="flex-1 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold h-9 rounded-lg shadow-sm transition-colors"
                      onClick={() => { setSelected(app); setView("inspect") }}>
                      Start Inspection
                    </Button>
                  )}
                  {/* Agency: already inspected — read-only */}
                  {isAgency && app.status !== "pending" && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Check className="h-3 w-3 text-green-600" /> Inspection submitted
                    </p>
                  )}
                  {/* Admin: process inspected apps */}
                  {isAdmin && app.status === "inspected" && (
                    <Button size="sm" className="flex-1 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold h-9 rounded-lg shadow-sm transition-colors"
                      onClick={() => { setSelected(app); setView("process") }}>
                      Process
                    </Button>
                  )}
                  {/* Admin: view / reprocess quotation or dispute */}
                  {isAdmin && (app.status === "quotation_issued" || app.status === "dispute_issued") && (
                    <Button size="sm" variant="outline" className="flex-1 h-9 text-xs font-semibold rounded-lg shadow-sm transition-colors"
                      onClick={() => { setSelected(app); setView("process") }}>
                      View / Override
                    </Button>
                  )}
                  {/* Admin: create project from quotation_issued app */}
                  {isAdmin && app.status === "quotation_issued" && !app.projectId && (
                    <Button size="sm" variant="outline" className="h-9 text-orange-700 border-orange-200 text-xs font-semibold rounded-lg shadow-sm transition-colors"
                      onClick={() => setProjectDialogApp(app)}>
                      <FolderOpen className="h-3 w-3 mr-1" /> Create Project
                    </Button>
                  )}
                  {/* Admin: project statuses — view linked project */}
                  {isAdmin && ["project_required", "project_ongoing", "project_done"].includes(app.status) && (
                    <Button size="sm" variant="outline" className="flex-1 h-9 text-orange-700 border-orange-200 text-xs font-semibold rounded-lg shadow-sm transition-colors"
                      onClick={() => { setTab("projects") }}>
                      <FolderOpen className="h-3 w-3 mr-1" /> View Projects
                    </Button>
                  )}
                  {/* Admin: approve project if it's done */}
                  {isAdmin && app.status === "project_ongoing" && projectMap[app.receiveNo]?.status === "done" && (
                    <Button size="sm" className="h-9 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                      onClick={() => { setSelectedProject(projectMap[app.receiveNo]); setProjectAction("approve") }}>
                      Approve Project
                    </Button>
                  )}
                  {/* Agency: mark project complete */}
                  {isAgency && ["project_required", "project_ongoing"].includes(app.status) && app.projectId &&
                    projectMap[app.receiveNo]?.status === "ongoing" && projectMap[app.receiveNo]?.poNumber && (
                    <Button size="sm" className="h-9 bg-slate-950 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                      onClick={() => { setSelectedProject(projectMap[app.receiveNo]); setProjectAction("complete") }}>
                      Mark Work Done
                    </Button>
                  )}
                  {/* Admin: pending — can reassign */}
                  {isAdmin && app.status === "pending" && (
                    <Button size="sm" variant="outline" className="flex-1 h-9 text-purple-700 border-purple-200 text-xs font-semibold rounded-lg shadow-sm transition-colors"
                      onClick={() => { setSelected(app); setView("process") }}>
                      Reassign
                    </Button>
                  )}
                  {/* Admin: meter issued / connection effected — view only */}
                  {isAdmin && (app.status === "meter_issued" || app.status === "connection_effected") && (
                    <p className="text-xs text-teal-700 flex items-center gap-1 font-medium">
                      <Check className="h-3 w-3" />
                      {app.status === "connection_effected" ? "Connection effected" : "Meter issued — awaiting installation"}
                    </p>
                  )}
                  {/* Admin: edit office ref no */}
                  {isAdmin && (
                    <button
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600"
                      onClick={() => { setEditingRefApp(app); setRefNoInput(app.officeRefNo || "") }}
                      title="Edit office reference number">
                      <Pencil className="h-3 w-3" /> {app.officeRefNo ? "Ref" : "Add Ref"}
                    </button>
                  )}
                  {/* Admin: history button */}
                  {isAdmin && (
                    <button
                      className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                      onClick={() => setHistoryApp(app)}>
                      <Clock className="h-3 w-3" /> History
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Sticky bottom — Add NSC */}
      {isAdmin && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg rounded-2xl text-base font-semibold flex items-center justify-center gap-2 py-3"
              onClick={() => setView("create")}>
              <Plus className="h-5 w-5" /> Add NSC
            </Button>
          </div>
        </div>
      )}

      {/* History popup */}
      {historyApp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setHistoryApp(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold">Flow History</h2>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{historyApp.receiveNo}</p>
                <p className="text-sm text-gray-700 font-medium">{historyApp.applicantName}</p>
              </div>
              <button className="text-gray-400 hover:text-gray-600" onClick={() => setHistoryApp(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { label: "Application Received",  date: historyApp.receivedDate,           done: !!historyApp.receivedDate },
                { label: "Inspection Completed",  date: historyApp.inspectedAt,            done: !!historyApp.inspectedAt },
                { label: "Quotation Issued",       date: historyApp.finalizedAt,            done: !!historyApp.finalizedAt && historyApp.finalAction === "quotation" },
                { label: "Dispute Issued",         date: historyApp.finalizedAt,            done: !!historyApp.finalizedAt && historyApp.finalAction === "dispute_letter" },
                { label: "Meter Issued",           date: historyApp.meterIssuedAt ? `${historyApp.meterIssuedAt}${historyApp.meterSerialNo ? ` · ${historyApp.meterSerialNo}` : ""}` : "", done: !!historyApp.meterIssuedAt },
                { label: "Connection Effected",    date: historyApp.connectionEffectedAt,   done: !!historyApp.connectionEffectedAt },
              ].map((step, i, arr) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${step.done ? "bg-green-500" : "bg-gray-100 border border-gray-200"}`}>
                      {step.done && <Check className="h-3 w-3 text-white" />}
                    </div>
                    {i < arr.length - 1 && <div className={`w-0.5 flex-1 mt-1 ${step.done ? "bg-green-200" : "bg-gray-100"}`} style={{ minHeight: 16 }} />}
                  </div>
                  <div className="pb-3 flex-1">
                    <p className={`text-sm font-medium ${step.done ? "text-gray-800" : "text-gray-300"}`}>{step.label}</p>
                    {step.done && <p className="text-xs text-gray-400 font-mono">{step.date}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Project: Create dialog ────────────────────────────────────────── */}
      <Dialog open={!!projectDialogApp} onOpenChange={open => { if (!open) setProjectDialogApp(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Infrastructure Project</DialogTitle></DialogHeader>
          {projectDialogApp && (
            <CreateProjectForm
              application={projectDialogApp}
              allApps={apps}
              agencies={agencies}
              onSuccess={() => { setProjectDialogApp(null); reloadProjects(); load(true) }}
              onCancel={() => setProjectDialogApp(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Project: action dialog (PO / complete / approve) ──────────────── */}
      <Dialog open={!!selectedProject && !!projectAction} onOpenChange={open => { if (!open) { setSelectedProject(null); setProjectAction(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {projectAction === "po"       ? "Enter PO Number" :
               projectAction === "complete" ? "Mark Work Complete" :
               "Approve Project"}
            </DialogTitle>
          </DialogHeader>
          {selectedProject && projectAction === "po" && (
            <ProjectPOForm
              project={selectedProject}
              onSuccess={() => { setSelectedProject(null); setProjectAction(null); reloadProjects() }}
              onCancel={() => { setSelectedProject(null); setProjectAction(null) }}
            />
          )}
          {selectedProject && projectAction === "complete" && (
            <AgencyCompleteProjectForm
              project={selectedProject}
              onSuccess={() => { setSelectedProject(null); setProjectAction(null); reloadProjects(); load(true) }}
              onCancel={() => { setSelectedProject(null); setProjectAction(null) }}
            />
          )}
          {selectedProject && projectAction === "approve" && (
            <AdminApproveProjectForm
              project={selectedProject}
              onSuccess={() => { setSelectedProject(null); setProjectAction(null); reloadProjects(); load(true) }}
              onCancel={() => { setSelectedProject(null); setProjectAction(null) }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Legacy import dialog ──────────────────────────────────────────── */}
      <Dialog open={showLegacyImport} onOpenChange={setShowLegacyImport}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Import Legacy Applications</DialogTitle></DialogHeader>
          <LegacyImportPanel
            onSuccess={count => { setShowLegacyImport(false); load(true); toast({ title: `${count} legacy records imported` }) }}
            onCancel={() => setShowLegacyImport(false)}
          />
        </DialogContent>
      </Dialog>

      {/* ── Edit office ref no dialog ─────────────────────────────────────── */}
      <Dialog open={!!editingRefApp} onOpenChange={open => { if (!open) setEditingRefApp(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Office Reference Number</DialogTitle></DialogHeader>
          {editingRefApp && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {editingRefApp.receiveNo} — {editingRefApp.applicantName}
              </p>
              <Input
                placeholder="Office reference / serial number"
                value={refNoInput}
                onChange={e => setRefNoInput(e.target.value)}
              />
              <div className="flex gap-2">
                <Button onClick={saveRefNo} disabled={savingRefNo}>{savingRefNo ? "Saving…" : "Save"}</Button>
                <Button variant="outline" onClick={() => setEditingRefApp(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {totalPages > 1 && tab !== "reports" && (
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
    </div>
  )
}

// ── Reports panel ─────────────────────────────────────────────────────────────
function NscReports({ apps }: { apps: NSCApplication[] }) {
  const { toast } = useToast()

  const total     = apps.length
  const pending   = apps.filter(a => a.status === "pending").length
  const inspected = apps.filter(a => a.status === "inspected").length
  const quotation = apps.filter(a => a.status === "quotation_issued").length
  const dispute   = apps.filter(a => a.status === "dispute_issued").length

  const byClass = NSC_CLASSES.map(c => ({
    label:     c.label,
    total:     apps.filter(a => a.appliedClass === c.value).length,
    pending:   apps.filter(a => a.appliedClass === c.value && a.status === "pending").length,
    inspected: apps.filter(a => a.appliedClass === c.value && a.status === "inspected").length,
    done:      apps.filter(a => a.appliedClass === c.value && (a.status === "quotation_issued" || a.status === "dispute_issued")).length,
  }))

  const byPhase = ["1P", "3P"].map(p => ({
    phase:     p,
    total:     apps.filter(a => a.phase === p).length,
    pending:   apps.filter(a => a.phase === p && a.status === "pending").length,
    done:      apps.filter(a => a.phase === p && (a.status === "quotation_issued" || a.status === "dispute_issued")).length,
  }))

  const agencies = Array.from(new Set(apps.map(a => a.agency).filter(Boolean)))
  const byAgency = agencies.map(ag => ({
    agency:    ag,
    total:     apps.filter(a => a.agency === ag).length,
    pending:   apps.filter(a => a.agency === ag && a.status === "pending").length,
    inspected: apps.filter(a => a.agency === ag && a.status === "inspected").length,
    accepted:  apps.filter(a => a.agency === ag && a.agencyDecision === "accepted").length,
    rejected:  apps.filter(a => a.agency === ag && a.agencyDecision === "rejected").length,
  })).sort((a, b) => b.total - a.total)

  const exportReport = async () => {
    const XLSX = await import("xlsx")
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Metric", "Count"],
      ["Total Applications", total],
      ["Pending Inspection", pending],
      ["Inspected (Awaiting Processing)", inspected],
      ["Quotation Issued", quotation],
      ["Dispute Letter Issued", dispute],
    ]), "Summary")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Class", "Total", "Pending", "Inspected", "Completed"],
      ...byClass.map(c => [c.label, c.total, c.pending, c.inspected, c.done]),
    ]), "By Class")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Phase", "Total", "Pending", "Completed"],
      ...byPhase.map(p => [p.phase, p.total, p.pending, p.done]),
    ]), "By Phase")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Agency", "Total", "Pending", "Inspected", "Accepted", "Rejected"],
      ...byAgency.map(a => [a.agency, a.total, a.pending, a.inspected, a.accepted, a.rejected]),
    ]), "By Agency")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(apps.map(a => ({
      "Receive No": a.receiveNo, "Date": a.receivedDate, "Name": a.applicantName,
      "C/O": a.careOf, "Address": a.address, "Mobile": a.mobile,
      "Class": CLASS_LABELS[a.appliedClass] || a.appliedClass, "Phase": a.phase,
      "Agency": a.agency, "Status": NSC_STATUS_LABELS[a.status] || a.status,
      "Agency Decision": a.agencyDecision, "Admin Decision": a.adminDecision,
      "Application No": a.applicationNo, "Memo No": a.memoNo,
      "Load (kW)": a.load, "DTR Capacity": a.dtrCapacity,
    }))), "All Applications")
    XLSX.writeFile(wb, `nsc-report-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast({ title: "Report exported" })
  }

  const StatCard = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className={`rounded-xl p-4 border ${color}`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  )

  const Table = ({ title, headers, rows }: { title: string; headers: string[]; rows: (string | number)[][] }) => (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b"><p className="font-semibold text-gray-800 text-sm">{title}</p></div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b">
            <tr>{headers.map((h, i) => <th key={i} className="px-3 py-2 text-left text-gray-600 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {row.map((cell, j) => <td key={j} className="px-3 py-2">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Applications" value={total}     color="bg-gray-50 border-gray-200" />
        <StatCard label="Pending Inspection" value={pending}   color="bg-yellow-50 border-yellow-200" />
        <StatCard label="Awaiting Processing" value={inspected} color="bg-blue-50 border-blue-200" />
        <StatCard label="Quotation Issued"   value={quotation} color="bg-green-50 border-green-200" />
        <StatCard label="Dispute Issued"     value={dispute}   color="bg-red-50 border-red-200" />
        <StatCard label="Accepted by Agency" value={apps.filter(a => a.agencyDecision === "accepted").length} color="bg-teal-50 border-teal-200" />
      </div>

      <Table
        title="By Applied Class"
        headers={["Class", "Total", "Pending", "Inspected", "Completed"]}
        rows={byClass.map(c => [c.label, c.total, c.pending, c.inspected, c.done])}
      />

      <Table
        title="By Phase"
        headers={["Phase", "Total", "Pending", "Completed"]}
        rows={byPhase.map(p => [p.phase, p.total, p.pending, p.done])}
      />

      {byAgency.length > 0 && (
        <Table
          title="Agency Performance"
          headers={["Agency", "Total", "Pending", "Inspected", "Accepted", "Rejected"]}
          rows={byAgency.map(a => [a.agency, a.total, a.pending, a.inspected, a.accepted, a.rejected])}
        />
      )}

      <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11" onClick={exportReport}>
        <FileDown className="h-4 w-4 mr-2" /> Export Full Report (Excel)
      </Button>
    </div>
  )
}
