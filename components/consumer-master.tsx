"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import Papa from "papaparse"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { getFromCache, saveToCache, getCacheAgeMs } from "@/lib/indexed-db"

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ConsumerMasterRow {
  consumerId: string
  name:       string
  careOf:     string
  address:    string
  baseClass:  string
  meterNo:    string
  zone:       string
  mobile:     string
  latitude:   string
  longitude:  string
}

const CACHE_KEY  = "consumer_master_cache"
const CACHE_TTL  = 30 * 24 * 60 * 60 * 1000 // 30 days

const FIELD_LABELS: Record<keyof ConsumerMasterRow, string> = {
  consumerId: "Consumer ID",
  name:       "Name",
  careOf:     "C/O",
  address:    "Address",
  baseClass:  "Class",
  meterNo:    "Meter No",
  zone:       "Zone",
  mobile:     "Mobile",
  latitude:   "Latitude",
  longitude:  "Longitude",
}

const REQUIRED_FIELDS: (keyof ConsumerMasterRow)[] = ["consumerId", "name"]

// ── Lookup widget (used by other components as a picker) ──────────────────────
interface LookupProps {
  onSelect: (row: ConsumerMasterRow) => void
  placeholder?: string
}

export function ConsumerMasterLookup({ onSelect, placeholder = "Search by consumer ID or name…" }: LookupProps) {
  const [query, setQuery]       = useState("")
  const [results, setResults]   = useState<ConsumerMasterRow[]>([])
  const [data, setData]         = useState<ConsumerMasterRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [fetched, setFetched]   = useState(false)
  const { toast }               = useToast()

  // Lazy-load from cache, then server
  useEffect(() => {
    if (fetched) return
    ;(async () => {
      setLoading(true)
      try {
        const cached = await getFromCache<ConsumerMasterRow[]>(CACHE_KEY)
        const age    = await getCacheAgeMs(CACHE_KEY)
        if (cached && Array.isArray(cached) && cached.length > 0 && typeof age === "number" && age < CACHE_TTL) {
          setData(cached)
          setFetched(true)
          return
        }
        const res = await fetch("/api/consumer-master")
        if (!res.ok) throw new Error("Failed to load consumer master")
        const fresh: ConsumerMasterRow[] = await res.json()
        await saveToCache(CACHE_KEY, fresh)
        setData(fresh)
        setFetched(true)
      } catch (e: any) {
        toast({ title: "Consumer master unavailable", description: e.message, variant: "destructive" })
      } finally {
        setLoading(false)
      }
    })()
  }, [fetched, toast])

  // Debounced search
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleQuery = (q: string) => {
    setQuery(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!q.trim()) { setResults([]); return }
      const lower = q.toLowerCase()
      setResults(
        data.filter(r =>
          r.consumerId.toLowerCase().includes(lower) ||
          r.name.toLowerCase().includes(lower)
        ).slice(0, 50)
      )
    }, 200)
  }

  return (
    <div className="space-y-2">
      <Input
        placeholder={placeholder}
        value={query}
        onChange={e => handleQuery(e.target.value)}
        disabled={loading}
      />
      {loading && <p className="text-xs text-muted-foreground">Loading consumer master…</p>}
      {results.length > 0 && (
        <div className="border rounded-md max-h-52 overflow-y-auto divide-y text-sm">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
              onClick={() => { onSelect(r); setQuery(""); setResults([]) }}
            >
              <span className="font-medium">{r.consumerId}</span>
              <span className="mx-2 text-muted-foreground">{r.name}</span>
              {r.careOf && <span className="text-muted-foreground text-xs">C/O {r.careOf}</span>}
              <div className="text-xs text-muted-foreground truncate">{r.address}</div>
            </button>
          ))}
        </div>
      )}
      {query.trim() && results.length === 0 && fetched && !loading && (
        <p className="text-xs text-muted-foreground">No match found. You can enter details manually.</p>
      )}
    </div>
  )
}

// ── Main consumer master page (admin upload + stats) ─────────────────────────
interface ConsumerMasterProps {
  role: string
}

type ColumnMapping = Partial<Record<keyof ConsumerMasterRow, number>>

export function ConsumerMaster({ role }: ConsumerMasterProps) {
  const { toast } = useToast()
  const isAdmin   = role === "admin"

  // Upload state
  const [csvHeaders, setCsvHeaders]       = useState<string[]>([])
  const [csvRows, setCsvRows]             = useState<string[][]>([])
  const [fileName, setFileName]           = useState("")
  const [mapping, setMapping]             = useState<ColumnMapping>({})
  const [uploading, setUploading]         = useState(false)
  const [uploadProgress, setUploadProgress] = useState("") // e.g. "5000 / 15000"
  const [uploadResult, setUploadResult]   = useState<{ count: number } | null>(null)

  // Stats state
  const [count, setCount]                 = useState<number | null>(null)
  const [cacheAge, setCacheAge]           = useState<number | null>(null)
  const [loadingStats, setLoadingStats]   = useState(false)

  // Search / browse state (for non-admin or after upload)
  const [query, setQuery]                 = useState("")
  const [results, setResults]             = useState<ConsumerMasterRow[]>([])
  const [allData, setAllData]             = useState<ConsumerMasterRow[]>([])
  const [dataLoaded, setDataLoaded]       = useState(false)
  const timerRef                          = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadStats()
    loadData()
  }, [])

  async function loadStats(force = false) {
    setLoadingStats(true)
    try {
      const age = await getCacheAgeMs(CACHE_KEY)
      setCacheAge(typeof age === "number" ? age : null)
      if (!force) {
        const cached = await getFromCache<ConsumerMasterRow[]>(CACHE_KEY)
        if (cached && Array.isArray(cached)) {
          setCount(cached.length)
          setLoadingStats(false)
          return
        }
      }
      const url = force ? "/api/consumer-master?refresh=true" : "/api/consumer-master"
      const res = await fetch(url)
      if (!res.ok) throw new Error()
      const data: ConsumerMasterRow[] = await res.json()
      await saveToCache(CACHE_KEY, data)
      setCount(data.length)
    } catch { /* silent */ } finally {
      setLoadingStats(false)
    }
  }

  async function loadData(force = false) {
    try {
      if (!force) {
        const cached = await getFromCache<ConsumerMasterRow[]>(CACHE_KEY)
        const age    = await getCacheAgeMs(CACHE_KEY)
        if (cached && Array.isArray(cached) && typeof age === "number" && age < CACHE_TTL) {
          setAllData(cached)
          setDataLoaded(true)
          return
        }
      }
      const url = force ? "/api/consumer-master?refresh=true" : "/api/consumer-master"
      const res = await fetch(url)
      if (!res.ok) return
      const data: ConsumerMasterRow[] = await res.json()
      await saveToCache(CACHE_KEY, data)
      setAllData(data)
      setCount(data.length)
      setDataLoaded(true)
    } catch { /* silent */ }
  }

  const handleSearch = (q: string) => {
    setQuery(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!q.trim()) { setResults([]); return }
      const lower = q.toLowerCase()
      setResults(
        allData.filter(r =>
          r.consumerId.toLowerCase().includes(lower) ||
          r.name.toLowerCase().includes(lower) ||
          r.meterNo.toLowerCase().includes(lower)
        ).slice(0, 100)
      )
    }, 200)
  }

  // ── CSV upload flow ─────────────────────────────────────────────────────────
  const handleFileDrop = useCallback((file: File) => {
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: true,
      complete: (res: Papa.ParseResult<string[]>) => {
        const rows = res.data as string[][]
        if (rows.length < 2) { toast({ title: "File has no data rows", variant: "destructive" }); return }
        const headers = rows[0].map(h => String(h).trim())
        const data    = rows.slice(1)
        setCsvHeaders(headers)
        setCsvRows(data)
        setFileName(file.name)
        setMapping({})
        setUploadResult(null)
        // Auto-detect common column names
        const auto: ColumnMapping = {}
        headers.forEach((h, i) => {
          const lower = h.toLowerCase().replace(/[\s_-]/g, "")
          if (lower.includes("consumerid") || lower === "id" || lower === "slno" || lower === "accountno") auto.consumerId = i
          else if (lower === "name" || lower.includes("consumername")) auto.name = i
          else if (lower.includes("co") || lower.includes("careof") || lower.includes("fathername")) auto.careOf = i
          else if (lower.includes("address")) auto.address = i
          else if (lower.includes("class") || lower.includes("category") || lower.includes("tariff")) auto.baseClass = i
          else if (lower.includes("meterno") || lower.includes("meter")) auto.meterNo = i
          else if (lower.includes("zone") || lower.includes("divison") || lower.includes("division")) auto.zone = i
          else if (lower.includes("mobile") || lower.includes("phone") || lower.includes("contact")) auto.mobile = i
          else if (lower.includes("lat")) auto.latitude = i
          else if (lower.includes("lon") || lower.includes("lng")) auto.longitude = i
        })
        setMapping(auto)
      },
    })
  }, [toast])

  const handleUpload = async () => {
    const missing = REQUIRED_FIELDS.filter(f => mapping[f] === undefined)
    if (missing.length > 0) {
      toast({ title: `Map required fields: ${missing.map(f => FIELD_LABELS[f]).join(", ")}`, variant: "destructive" })
      return
    }
    setUploading(true)
    setUploadProgress("")
    try {
      const rows: ConsumerMasterRow[] = csvRows.map(r => ({
        consumerId: String(r[mapping.consumerId!] ?? "").trim(),
        name:       String(r[mapping.name!]       ?? "").trim(),
        careOf:     String(r[mapping.careOf   ?? -1] ?? "").trim(),
        address:    String(r[mapping.address  ?? -1] ?? "").trim(),
        baseClass:  String(r[mapping.baseClass ?? -1] ?? "").trim(),
        meterNo:    String(r[mapping.meterNo  ?? -1] ?? "").trim(),
        zone:       String(r[mapping.zone     ?? -1] ?? "").trim(),
        mobile:     String(r[mapping.mobile   ?? -1] ?? "").trim(),
        latitude:   String(r[mapping.latitude ?? -1] ?? "").trim(),
        longitude:  String(r[mapping.longitude ?? -1] ?? "").trim(),
      })).filter(r => r.consumerId && r.name)

      // Upload in chunks of 5000 to match server batch size and reduce
      // round-trips. Each POST call writes its chunk to the sheet.
      const CHUNK = 5000
      let serverConfirmed = 0
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK)
        setUploadProgress(`${Math.min(i + chunk.length, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`)
        const res = await fetch("/api/consumer-master", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: chunk,
            clearExisting: i === 0,
          }),
        })
        if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Upload failed") }
        const result = await res.json()
        // Use the server-confirmed count (actual rows written to sheet)
        serverConfirmed += result.count ?? chunk.length
      }
      setUploadResult({ count: serverConfirmed })
      setCount(serverConfirmed)
      // Refresh IndexedDB cache
      setUploadProgress("Refreshing cache…")
      const fresh = await fetch("/api/consumer-master").then(r => r.json())
      await saveToCache(CACHE_KEY, fresh)
      setAllData(fresh)
      setDataLoaded(true)
      setCsvHeaders([])
      setCsvRows([])
      setFileName("")
      if (serverConfirmed < rows.length) {
        toast({
          title: `Partial upload: ${serverConfirmed.toLocaleString()} of ${rows.length.toLocaleString()} written`,
          description: "Some batches may have failed due to rate limiting. Try uploading the remaining rows again.",
          variant: "destructive",
        })
      } else {
        toast({ title: `Uploaded ${serverConfirmed.toLocaleString()} consumers successfully` })
      }
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" })
    } finally {
      setUploading(false)
      setUploadProgress("")
    }
  }

  const formatAge = (ms: number) => {
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    if (h > 0) return `${h}h ${m}m ago`
    return `${m}m ago`
  }

  return (
    <div className="space-y-6">
      {/* Header + stats */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Consumer Master</h2>
          <p className="text-sm text-muted-foreground">
            {loadingStats ? "Loading…"
              : count !== null ? `${count.toLocaleString()} consumers loaded${cacheAge !== null ? " · cached " + formatAge(cacheAge) : ""}`
              : "No data yet"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setDataLoaded(false); loadStats(true); loadData(true) }}>
            Refresh Cache
          </Button>
        </div>
      </div>

      {/* Upload section (admin only) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Upload Consumer Data (CSV)</CardTitle>
              <Button
                size="sm" variant="outline"
                onClick={() => {
                  const headers = ["Consumer ID", "Name", "C/O", "Address", "Class", "Meter No", "Zone", "Mobile", "Latitude", "Longitude"]
                  const sample  = ["100000001", "John Doe", "Father Name", "Village / Ward / Block / District", "LT Domestic", "OLDMTR001", "Zone A", "9876543210", "25.123456", "88.654321"]
                  const csv     = [headers, sample].map(r => r.join(",")).join("\n")
                  const blob    = new Blob([csv], { type: "text/csv" })
                  const url     = URL.createObjectURL(blob)
                  const a       = document.createElement("a")
                  a.href        = url
                  a.download    = "consumer_master_template.csv"
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                Download Template
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => document.getElementById("cm-file-input")?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileDrop(f) }}
            >
              <input
                id="cm-file-input"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileDrop(f) }}
              />
              {fileName
                ? <p className="font-medium">{fileName} <span className="text-muted-foreground text-sm">— {csvRows.length.toLocaleString()} rows</span></p>
                : <p className="text-muted-foreground">Drop a CSV here or click to choose</p>}
            </div>

            {/* Column mapping */}
            {csvHeaders.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Map CSV columns to fields (<span className="text-red-500">*</span> required)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(Object.keys(FIELD_LABELS) as (keyof ConsumerMasterRow)[]).map(field => (
                    <div key={field} className="space-y-1">
                      <Label className="text-xs">
                        {FIELD_LABELS[field]}
                        {REQUIRED_FIELDS.includes(field) && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      <Select
                        value={mapping[field] !== undefined ? String(mapping[field]) : "__none"}
                        onValueChange={v => setMapping(prev => {
                          const next = { ...prev }
                          if (v === "__none") delete next[field]
                          else next[field] = Number(v)
                          return next
                        })}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="— skip —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— skip —</SelectItem>
                          {csvHeaders.map((h, i) => (
                            <SelectItem key={i} value={String(i)}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                {/* Preview */}
                {csvRows.length > 0 && mapping.consumerId !== undefined && mapping.name !== undefined && (
                  <div className="text-xs border rounded p-2 bg-muted space-y-1">
                    <p className="font-medium">Preview (first 3 rows):</p>
                    {csvRows.slice(0, 3).map((r, i) => (
                      <p key={i} className="text-muted-foreground truncate">
                        {String(r[mapping.consumerId!] ?? "").trim()} — {String(r[mapping.name!] ?? "").trim()}
                        {mapping.address !== undefined && ` — ${String(r[mapping.address] ?? "").trim()}`}
                      </p>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Button onClick={handleUpload} disabled={uploading}>
                    {uploading
                      ? (uploadProgress ? `Uploading ${uploadProgress}…` : "Preparing…")
                      : `Upload ${csvRows.length.toLocaleString()} rows`}
                  </Button>
                  {uploadResult && (
                    <Badge variant="default">{uploadResult.count.toLocaleString()} uploaded</Badge>
                  )}
                  <p className="text-xs text-muted-foreground">This replaces all existing consumer data.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search / browse */}
      <Card>
        <CardHeader><CardTitle className="text-base">Search Consumers</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Search by consumer ID, name, or meter number…"
            value={query}
            onChange={e => handleSearch(e.target.value)}
          />
          {results.length > 0 && (
            <div className="border rounded-md divide-y text-sm max-h-[400px] overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{r.consumerId}</span>
                    <span>{r.name}</span>
                    {r.baseClass && <Badge variant="outline" className="text-xs">{r.baseClass}</Badge>}
                    {r.zone && <Badge variant="secondary" className="text-xs">{r.zone}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.careOf && `C/O ${r.careOf} · `}{r.address}
                    {r.meterNo && ` · Meter: ${r.meterNo}`}
                    {r.mobile && ` · ${r.mobile}`}
                  </div>
                </div>
              ))}
            </div>
          )}
          {query && results.length === 0 && dataLoaded && (
            <p className="text-sm text-muted-foreground">No consumers matched "{query}".</p>
          )}
          {!dataLoaded && (
            <p className="text-sm text-muted-foreground">Loading data…</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
