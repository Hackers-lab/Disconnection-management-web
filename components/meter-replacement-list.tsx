"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Search, X, Plus, Clock, CheckCircle2, ChevronLeft, ChevronRight,
  Loader2, Download, RefreshCw, Check, ArrowLeft, RotateCcw, Package,
  MapPin, Phone, Building2, User, Upload, FileText
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useHashState } from "@/hooks/use-hash-state"
import { getFromCache, saveToCache } from "@/lib/indexed-db"
import type { ConsumerData } from "@/lib/google-sheets"
import type { ConsumerMasterRow } from "@/components/consumer-master"
import type { MeterReplacement } from "@/lib/meter-replacement-service"

const CACHE_KEY = "meter_replacement_data_cache"

interface Props {
  userRole: string
  userAgencies: string[]
  username: string
  agencies: string[]
  permissions?: Record<string, string[]>
}

type Tab = "all" | "proposed" | "issued" | "updated" | "replaced"
type SyncState = "idle" | "loading" | "updated"

const PURPOSE_LABELS: Record<string, string> = {
  faulty_replacement: "Faulty / Defective",
  burnt_replacement:  "Burnt Meter",
  slow_fast:          "Slow / Fast Meter",
}

const PURPOSE_COLORS: Record<string, string> = {
  faulty_replacement: "text-orange-600",
  burnt_replacement:  "text-red-600",
  slow_fast:          "text-amber-600",
}

const STATUS_COLORS: Record<string, string> = {
  proposed: "bg-amber-50 text-amber-700 border border-amber-200",
  issued:   "bg-yellow-50 text-yellow-700 border border-yellow-200",
  updated:  "bg-teal-50 text-teal-700 border border-teal-200",
  replaced: "bg-emerald-50 text-emerald-700 border border-emerald-200",
}

const STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  issued:   "Issued",
  updated:  "Installation Done",
  replaced: "Replaced",
}

export function MeterReplacementList({ userRole, userAgencies, username, agencies, permissions }: Props) {
  const { toast } = useToast()
  const [records, setRecords] = useState<MeterReplacement[]>([])
  const [syncState, setSyncState] = useState<SyncState>("loading")
  const [tab, setTab] = useState<Tab>("all")
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [view, setView] = useHashState<"list" | "create">("meter-replacement", "list")
  
  const isAdmin = userRole === "admin" || userRole === "executive"
  const PAGE_SIZE = 15

  const load = async (silent = false) => {
    if (!silent) setSyncState("loading")
    try {
      const cached = await getFromCache<MeterReplacement[]>(CACHE_KEY)
      if (cached && cached.length > 0) {
        setRecords(cached)
        if (!silent) setSyncState("idle")
      }
      const res = await fetch("/api/meters/replacement")
      if (!res.ok) throw new Error()
      const data: MeterReplacement[] = await res.json()
      const sorted = [...data].reverse() // Newest proposed first
      setRecords(sorted)
      await saveToCache(CACHE_KEY, sorted)
      setSyncState("updated")
      setTimeout(() => setSyncState("idle"), 3000)
    } catch {
      setSyncState("idle")
      if (!silent) toast({ title: "Failed to load replacement list", variant: "destructive" })
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
        r.replacementId.toLowerCase().includes(q) ||
        r.consumerId.includes(q) ||
        r.consumerName.toLowerCase().includes(q) ||
        r.mobile.includes(q) ||
        r.agency.toLowerCase().includes(q) ||
        r.serialNo.toLowerCase().includes(q) ||
        r.issueId.toLowerCase().includes(q)
      )
    }
    return data
  }, [records, tab, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => setCurrentPage(1), [tab, search])

  const downloadReport = async () => {
    const XLSX = await import("xlsx")
    const rows = filtered.map((r, i) => ({
      "#": i + 1,
      "Replacement ID": r.replacementId,
      "Consumer ID": r.consumerId,
      "Name": r.consumerName,
      "Address": r.address,
      "Mobile": r.mobile,
      "Agency": r.agency,
      "Purpose": PURPOSE_LABELS[r.purpose] || r.purpose,
      "Proposed Date": r.proposedDate,
      "Status": STATUS_LABELS[r.status] || r.status,
      "Serial No": r.serialNo,
      "Issue ID": r.issueId,
      "Remarks": r.remarks,
      "Attachment URL": r.attachmentUrl,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Replacement List")
    XLSX.writeFile(wb, `Meter_Replacement_List_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  if (view === "create") {
    return (
      <MeterReplacementCreateForm
        agencies={agencies}
        onSave={(id) => {
          toast({ title: "Proposed replacement created", description: `ID: ${id}` })
          setView("list")
          load()
        }}
        onCancel={() => setView("list")}
      />
    )
  }

  return (
    <div className={`space-y-4 ${isAdmin ? "pb-24" : ""}`}>
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Proposed", value: records.filter(r => r.status === "proposed").length, color: "text-amber-700", bg: "bg-amber-50 border-amber-100" },
          { label: "Issued", value: records.filter(r => r.status === "issued").length, color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-100" },
          { label: "Installation Done", value: records.filter(r => r.status === "updated").length, color: "text-teal-700", bg: "bg-teal-50 border-teal-100" },
          { label: "Replaced", value: records.filter(r => r.status === "replaced").length, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border rounded-2xl p-4 flex flex-col items-center shadow-sm`}>
            <span className={`text-3xl font-extrabold ${s.color} tabular-nums`}>{s.value}</span>
            <span className="text-xs text-gray-500 mt-1 font-medium text-center">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-white p-4 rounded-xl shadow-sm border space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search ID, name, mobile, agency, serial..." className="pl-10 pr-8 rounded-xl h-9 text-sm" />
            {search && <X className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" onClick={() => setSearch("")} />}
          </div>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={downloadReport} className="shrink-0 rounded-xl" title="Export to Excel">
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => load()} className="shrink-0">
            <RefreshCw className={`h-4 w-4 ${syncState === "loading" ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Tab Filters */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {(["all", "proposed", "issued", "updated", "replaced"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${tab === t ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t === "all" ? `All (${records.length})` : `${STATUS_LABELS[t]} (${records.filter(r => r.status === t).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Replacement cards */}
      <div className="space-y-3">
        {paginated.length === 0 ? (
          <div className="bg-white text-center py-16 text-gray-400 border rounded-2xl">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No replacement proposals found</p>
          </div>
        ) : paginated.map(r => (
          <Card key={r.replacementId} className="hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-200 hover:border-blue-200">
            <CardContent className="p-4">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-gray-400 font-bold">{r.replacementId}</span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-gray-500 font-medium">Proposed: {r.proposedDate}</span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className={`text-xs font-semibold ${PURPOSE_COLORS[r.purpose] || "text-blue-700"}`}>
                      {PURPOSE_LABELS[r.purpose] || r.purpose}
                    </span>
                  </div>
                  <h4 className="font-bold text-gray-900 text-sm md:text-base leading-tight mt-1">
                    {r.consumerName} <span className="font-mono font-normal text-xs text-gray-500">({r.consumerId})</span>
                  </h4>
                  <div className="bg-slate-50 border rounded-lg p-2 mt-2 space-y-1">
                    {r.address && <p className="text-xs text-gray-600 flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0 text-gray-400" /> {r.address}</p>}
                    {r.mobile && <p className="text-xs text-gray-600 flex items-center gap-1"><Phone className="h-3 w-3 shrink-0 text-gray-400" /> <span className="font-mono">{r.mobile}</span></p>}
                    {r.agency && <p className="text-xs text-gray-600 flex items-center gap-1"><Building2 className="h-3 w-3 shrink-0 text-gray-400" /> Agency: <strong>{r.agency}</strong></p>}
                  </div>
                  {r.remarks && <p className="text-xs text-gray-500 italic mt-1">Remarks: "{r.remarks}"</p>}
                  {r.attachmentUrl && (
                    <div className="mt-1">
                      <a href={r.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 underline font-medium hover:text-blue-800">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" /> View Attachment ↗
                      </a>
                    </div>
                  )}
                  
                  {/* Linked Meter info */}
                  {(r.serialNo || r.issueId) && (
                    <div className="pt-2 border-t mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                      {r.serialNo && <p className="text-gray-600">Issued Meter: <strong className="font-mono text-blue-700">{r.serialNo}</strong></p>}
                      {r.issueId && <p className="text-gray-600">Issue ID: <strong className="font-mono text-gray-500">{r.issueId}</strong></p>}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge className={STATUS_COLORS[r.status] || ""}>{STATUS_LABELS[r.status] || r.status}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
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

      {/* Admin Proposed Float */}
      {isAdmin && permissions?.meter_replacement?.includes("create") && (
        <div className="fixed bottom-4 left-0 right-0 z-40 p-4 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-2xl text-base font-semibold flex items-center justify-center gap-2 py-3"
              onClick={() => setView("create")}>
              <Plus className="h-5 w-5" /> Propose Meter Replacement
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface FormProps {
  agencies: string[]
  onSave: (requestId: string) => void
  onCancel: () => void
}

function MeterReplacementCreateForm({ agencies, onSave, onCancel }: FormProps) {
  const [consumerId, setConsumerId] = useState("")
  const [looking, setLooking] = useState(false)
  const [found, setFound] = useState<any>(null)
  const [notFound, setNotFound] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [agencyList, setAgencyList] = useState<string[]>(agencies)
  const [lookupStatus, setLookupStatus] = useState("")

  // Form states
  const [manualName, setManualName] = useState("")
  const [manualAddress, setManualAddress] = useState("")
  const [manualMobile, setManualMobile] = useState("")
  const [agency, setAgency] = useState("")
  const [purpose, setPurpose] = useState("faulty_replacement")
  const [remarks, setRemarks] = useState("")
  
  // Upload states
  const [attachmentUrl, setAttachmentUrl] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState("")

  // Load agencies
  useEffect(() => {
    async function loadAgencies() {
      const cached = await getFromCache<string[]>("agencies_data_cache")
      if (cached && cached.length > 0) { setAgencyList(cached); return }
      try {
        const res = await fetch("/api/admin/agencies")
        if (res.ok) {
          const data = await res.json()
          const names = data.filter((a: any) => a.isActive).map((a: any) => a.name)
          if (names.length > 0) setAgencyList(names)
        }
      } catch { /* ignored */ }
    }
    loadAgencies()
  }, [])

  const handleLookup = async () => {
    const id = consumerId.trim()
    if (id.length !== 9) { alert("Consumer ID must be 9 digits."); return }
    setLooking(true)
    setFound(null)
    setNotFound(false)
    setLookupStatus("Searching disconnection list...")
    try {
      // 1. Try active disconnection cache
      const cache = await getFromCache<ConsumerData[]>("consumers_data_cache")
      const match = cache?.find(c => c.consumerId === id) || null
      if (match) {
        setFound(match)
        setManualName(match.name)
        setManualAddress(match.address || "")
        setManualMobile(match.mobileNumber || "")
        setAgency(match.agency || "")
        setLooking(false)
        return
      }

      // 2. Try consumer master cache
      setLookupStatus("Searching master database cache...")
      let masterCache = await getFromCache<ConsumerMasterRow[]>("consumer_master_cache")
      let masterMatch = masterCache?.find(c => c.consumerId === id) || null

      // 3. Fallback to API
      if (!masterMatch) {
        setLookupStatus("Fetching consumer master from server...")
        try {
          const res = await fetch("/api/consumer-master?refresh=true")
          if (res.ok) {
            const fresh: ConsumerMasterRow[] = await res.json()
            await saveToCache("consumer_master_cache", fresh)
            masterCache = fresh
            masterMatch = fresh.find(c => c.consumerId === id) || null
          }
        } catch (e) {
          console.error("Master lookup failed:", e)
        }
      }

      if (masterMatch) {
        setLookupStatus("Mapping agency from zone...")
        let mappedAgency = ""
        try {
          let zoneMap = await getFromCache<{ zone: string; agency: string }[]>("zone_map_cache")
          if (!zoneMap || zoneMap.length === 0) {
            const res = await fetch("/api/zone-map")
            if (res.ok) {
              const fresh = await res.json()
              await saveToCache("zone_map_cache", fresh)
              zoneMap = fresh
            }
          }
          if (zoneMap && masterMatch.zone) {
            const normalizedZone = masterMatch.zone.trim().toUpperCase()
            const zoneMatch = zoneMap.find(z => z.zone.trim().toUpperCase() === normalizedZone)
            if (zoneMatch) mappedAgency = zoneMatch.agency
          }
        } catch (err) {
          console.error("Zone mapping error:", err)
        }

        setFound({
          consumerId: masterMatch.consumerId,
          name: masterMatch.name,
          address: masterMatch.address,
          mobileNumber: masterMatch.mobile,
          agency: mappedAgency || "",
        })
        setManualName(masterMatch.name)
        setManualAddress(masterMatch.address)
        setManualMobile(masterMatch.mobile || "")
        setAgency(mappedAgency || "")
      } else {
        setNotFound(true)
        setManualName("")
        setManualAddress("")
        setManualMobile("")
        setAgency("")
      }
    } catch {
      setNotFound(true)
    } finally {
      setLooking(false)
    }
  }

  const handleFileUpload = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("consumerId", consumerId || "replacement")
      const res = await fetch("/api/upload-image", { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) {
        setAttachmentUrl(data.url)
        setUploadedFileName(file.name)
      } else {
        alert("Upload failed: " + (data.error || "unknown error"))
      }
    } catch (e) {
      alert("File upload failed.")
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualName.trim() || !manualAddress.trim()) {
      alert("Consumer Name and Address are required.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/meters/replacement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consumerId: consumerId.trim() || "000000000",
          consumerName: manualName.trim(),
          address: manualAddress.trim(),
          mobile: manualMobile.trim() || "",
          agency: agency === "none" ? "" : agency,
          purpose,
          remarks,
          attachmentUrl
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      window.dispatchEvent(new Event("notif-refresh"))
      onSave(data.replacementId)
    } catch (err: any) {
      alert(err.message || "Submit failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="max-w-xl mx-auto pb-28">
      <CardHeader className="flex flex-row items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <CardTitle>Propose Meter Replacement</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Lookup section */}
        <div className="space-y-2 p-3 bg-slate-50 border rounded-xl mb-4">
          <Label htmlFor="search-cid">Lookup Consumer ID</Label>
          <div className="flex gap-2">
            <Input
              id="search-cid"
              value={consumerId}
              onChange={e => setConsumerId(e.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="e.g. 661200001"
              maxLength={9}
              disabled={looking || submitting}
            />
            <Button type="button" onClick={handleLookup} disabled={looking || consumerId.length !== 9 || submitting}>
              {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {looking && <p className="text-xs text-blue-600 font-medium">{lookupStatus}</p>}
          {notFound && <p className="text-xs text-amber-600 font-semibold">Consumer not found in active list or master database. Please fill details manually.</p>}
          {found && <p className="text-xs text-green-700 font-bold flex items-center gap-1">✓ Match Found: {found.name}</p>}
        </div>

        {/* Form details */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="c-name">Consumer Name *</Label>
            <Input id="c-name" value={manualName} onChange={e => setManualName(e.target.value)} disabled={submitting} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-addr">Address *</Label>
            <Textarea id="c-addr" value={manualAddress} onChange={e => setManualAddress(e.target.value)} disabled={submitting} required />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="c-mobile">Mobile Number (optional)</Label>
              <Input id="c-mobile" value={manualMobile} onChange={e => setManualMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} disabled={submitting} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="c-agency">Assign Agency (optional)</Label>
              <Select value={agency || "none"} onValueChange={val => setAgency(val === "none" ? "" : val)} disabled={submitting}>
                <SelectTrigger id="c-agency">
                  <SelectValue placeholder="Select Agency (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None / Unassigned</SelectItem>
                  {agencyList.map(a => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-purpose">Replacement Purpose *</Label>
            <Select value={purpose} onValueChange={setPurpose} disabled={submitting}>
              <SelectTrigger id="c-purpose">
                <SelectValue placeholder="Select Purpose" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PURPOSE_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-attachment">Attachment / Document (optional)</Label>
            <div className="flex gap-2 items-center">
              <Input
                id="c-attachment"
                type="file"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleFileUpload(f)
                }}
                disabled={uploading || submitting}
                className="cursor-pointer"
              />
              {uploading && <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />}
            </div>
            {attachmentUrl && (
              <p className="text-xs text-green-700 font-bold flex items-center gap-1 mt-1">
                ✓ Uploaded: <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="underline">{uploadedFileName || "File"}</a>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-remarks">Remarks (optional)</Label>
            <Textarea id="c-remarks" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="e.g. Broken display / burnt terminals" disabled={submitting} />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" className="flex-[2] bg-slate-950 hover:bg-slate-900 text-white" disabled={submitting || uploading}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              {submitting ? "Submitting..." : "Save Proposal"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
