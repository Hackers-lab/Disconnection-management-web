"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import Papa from "papaparse"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { getFromCache, saveToCache, getCacheAgeMs, getCccPrefix } from "@/lib/indexed-db"
import { Search, X, User, MapPin, Phone, Monitor, Map, ChevronDown, ChevronUp, Upload, ExternalLink, Database, Smartphone, Gauge, ShieldCheck, AlertTriangle, Layers, Activity, ChevronRight } from "lucide-react"
import dynamic from "next/dynamic"

const NearbyConsumerMap = dynamic(
  () => import("./nearby-consumer-map").then((mod) => mod.NearbyConsumerMap),
  { ssr: false }
)

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

export async function fetchMasterInChunks(options?: {
  refresh?: boolean
  onProgress?: (loaded: number, total: number) => void
}): Promise<ConsumerMasterRow[]> {
  const refresh = options?.refresh ?? false
  const limit = 10000

  if (!refresh) {
    const cached = await getFromCache<ConsumerMasterRow[]>(CACHE_KEY)
    if (cached && cached.length > 0) return cached
  }

  const countRes = await fetch("/api/system/row-count?type=master", { cache: "no-store" })
  if (!countRes.ok) throw new Error(`Row count check failed (${countRes.status})`)
  const { count: totalCount } = await countRes.json()

  if (!totalCount || totalCount === 0) return []

  let allRows: ConsumerMasterRow[] = []
  let offset = 0

  while (offset < totalCount) {
    const chunkRes = await fetch(`/api/consumer-master?offset=${offset}&limit=${limit}`, { cache: "no-store" })
    if (!chunkRes.ok) throw new Error(`Failed to fetch chunk at offset ${offset}`)
    const chunk: ConsumerMasterRow[] = await chunkRes.json()

    if (!Array.isArray(chunk) || chunk.length === 0) break

    allRows = allRows.concat(chunk)
    offset += chunk.length

    if (options?.onProgress) {
      options.onProgress(allRows.length, totalCount)
    }

    if (chunk.length < limit) break
  }

  if (allRows.length > 0) {
    await saveToCache(CACHE_KEY, allRows)
  }

  return allRows
}

export function ConsumerMasterPicker({
  onSelect,
  placeholder = "Search by Consumer ID or Name...",
}: {
  onSelect: (c: ConsumerMasterRow) => void
  placeholder?: string
}) {
  const { toast } = useToast()
  const [data, setData] = useState<ConsumerMasterRow[]>([])
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ConsumerMasterRow[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState("")
  const [fetched, setFetched] = useState(false)

  useEffect(() => {
    if (fetched) return
    ;(async () => {
      setLoading(true)
      try {
        const cached = await getFromCache<ConsumerMasterRow[]>(CACHE_KEY)
        if (cached && cached.length > 0) {
          setData(cached)
          setFetched(true)
          setLoading(false)
          return
        }

        const fresh = await fetchMasterInChunks({
          onProgress: (loaded, total) => {
            setLoadingProgress(`Syncing: ${loaded.toLocaleString()} / ${total.toLocaleString()}`)
          }
        })
        await saveToCache(CACHE_KEY, fresh)
        setData(fresh)
        setFetched(true)
      } catch (e: any) {
        toast({ title: "Consumer master unavailable", description: e.message, variant: "destructive" })
      } finally {
        setLoading(false)
        setLoadingProgress("")
      }
    })()
  }, [fetched, toast])

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
      {loading && <p className="text-xs text-muted-foreground">{loadingProgress || "Loading consumer master…"}</p>}
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

interface ConsumerMasterProps {
  role: string
  permissions?: Record<string, string[]>
}

type ColumnMapping = Partial<Record<keyof ConsumerMasterRow, number>>

export function ConsumerMaster({ role, permissions }: ConsumerMasterProps) {
  const { toast } = useToast()
  const isAdmin   = role === "admin" || !!(permissions && (permissions.consumer_master?.includes("create") || permissions.consumer_master?.includes("update")))

  const [csvHeaders, setCsvHeaders]       = useState<string[]>([])
  const [csvRows, setCsvRows]             = useState<string[][]>([])
  const [fileName, setFileName]           = useState("")
  const [mapping, setMapping]             = useState<ColumnMapping>({})
  const [uploading, setUploading]         = useState(false)
  const [uploadProgress, setUploadProgress] = useState("")
  const [uploadResult, setUploadResult]   = useState<{ count: number } | null>(null)

  const [count, setCount]                 = useState<number | null>(null)
  const [cacheAge, setCacheAge]           = useState<number | null>(null)
  const [loadingStats, setLoadingStats]   = useState(false)
  const [syncProgress, setSyncProgress]   = useState("")

  const [query, setQuery]                 = useState("")
  const [results, setResults]             = useState<ConsumerMasterRow[]>([])
  const [allData, setAllData]             = useState<ConsumerMasterRow[]>([])
  const [dataLoaded, setDataLoaded]       = useState(false)
  const [selectedConsumer, setSelectedConsumer] = useState<ConsumerMasterRow | null>(null)
  const [showUpload, setShowUpload]       = useState(false)
  const [showNearbyMap, setShowNearbyMap] = useState(false)
  const timerRef                          = useRef<ReturnType<typeof setTimeout> | null>(null)

  const consumersToMap = query.trim() ? results : allData
  const mappedConsumers = useMemo(() => {
    return consumersToMap.map(r => ({
      consumerId: r.consumerId,
      name: r.name,
      address: r.address,
      mobileNumber: r.mobile,
      latitude: r.latitude,
      longitude: r.longitude,
      baseClass: r.baseClass,
      class: r.baseClass,
      disconStatus: "Master Record",
      d2NetOS: "0",
      mru: r.zone,
      agency: r.zone,
    }))
  }, [consumersToMap])

  const loadStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const cached = await getFromCache<ConsumerMasterRow[]>(CACHE_KEY)
      if (cached && cached.length > 0) {
        setCount(cached.length)
        setAllData(cached)
        setDataLoaded(true)
      } else {
        const res = await fetch("/api/system/row-count?type=master", { cache: "no-store" })
        if (res.ok) {
          const data = await res.json()
          setCount(data.count ?? null)
        }
      }

      const age = await getCacheAgeMs(CACHE_KEY)
      setCacheAge(age)
    } catch { /* silent */ }
    finally { setLoadingStats(false) }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  const forceResync = async () => {
    setSyncProgress("Starting resync…")
    try {
      const fresh = await fetchMasterInChunks({
        refresh: true,
        onProgress: (loaded, total) => setSyncProgress(`Syncing: ${loaded.toLocaleString()} / ${total.toLocaleString()}`)
      })
      setCount(fresh.length)
      setAllData(fresh)
      setDataLoaded(true)
      const age = await getCacheAgeMs(CACHE_KEY)
      setCacheAge(age)
      toast({ title: "Master resynced", description: `${fresh.length.toLocaleString()} rows cached.` })
    } catch (e: any) {
      toast({ title: "Resync failed", description: e.message, variant: "destructive" })
    } finally { setSyncProgress("") }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setUploadResult(null)

    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (res) => {
        if (res.data.length < 2) {
          toast({ title: "Invalid CSV", description: "File must contain a header row and at least one data row.", variant: "destructive" })
          return
        }
        const headers = res.data[0].map(h => h.trim())
        const rows    = res.data.slice(1)
        setCsvHeaders(headers)
        setCsvRows(rows)

        const autoMap: ColumnMapping = {}
        headers.forEach((h, colIdx) => {
          const lower = h.toLowerCase().replace(/[^a-z0-9]/g, "")
          if (lower.includes("consumerid") || lower === "id" || lower === "accountno" || lower === "conid" || lower === "consumer") autoMap.consumerId = colIdx
          else if (lower === "name" || lower.includes("consumername") || lower.includes("custname")) autoMap.name = colIdx
          else if (lower.includes("careof") || lower === "co" || lower === "fathername") autoMap.careOf = colIdx
          else if (lower.includes("address") || lower === "addr") autoMap.address = colIdx
          else if (lower === "class" || lower.includes("baseclass") || lower === "category") autoMap.baseClass = colIdx
          else if (lower.includes("meter") || lower.includes("deviceno") || lower.includes("serialno")) autoMap.meterNo = colIdx
          else if (lower === "zone" || lower.includes("subdivision") || lower.includes("mru")) autoMap.zone = colIdx
          else if (lower.includes("mobile") || lower.includes("phone") || lower.includes("contact")) autoMap.mobile = colIdx
          else if (lower.includes("lat")) autoMap.latitude = colIdx
          else if (lower.includes("long") || lower.includes("lng")) autoMap.longitude = colIdx
        })
        setMapping(autoMap)
      },
      error: (err) => {
        toast({ title: "Failed to parse CSV", description: err.message, variant: "destructive" })
      }
    })
  }

  const handleUpload = async () => {
    if (!mapping.consumerId === undefined || mapping.name === undefined) {
      toast({ title: "Missing required mappings", description: "Consumer ID and Name must be mapped.", variant: "destructive" })
      return
    }

    setUploading(true)
    setUploadProgress("Preparing data…")

    try {
      const records: ConsumerMasterRow[] = csvRows.map(row => {
        const getVal = (key: keyof ConsumerMasterRow) => {
          const colIdx = mapping[key]
          return colIdx !== undefined ? (row[colIdx] || "").trim() : ""
        }
        return {
          consumerId: getVal("consumerId"),
          name:       getVal("name"),
          careOf:     getVal("careOf"),
          address:    getVal("address"),
          baseClass:  getVal("baseClass"),
          meterNo:    getVal("meterNo"),
          zone:       getVal("zone"),
          mobile:     getVal("mobile"),
          latitude:   getVal("latitude"),
          longitude:  getVal("longitude"),
        }
      }).filter(r => r.consumerId && r.name)

      const total = records.length
      setUploadProgress(`Uploading 0 / ${total.toLocaleString()}…`)

      const res = await fetch("/api/consumer-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Upload failed")
      }

      const result = await res.json()
      setUploadResult({ count: result.count })
      toast({ title: "Consumer master updated", description: `${result.count.toLocaleString()} records uploaded successfully.` })

      setCsvHeaders([])
      setCsvRows([])
      setFileName("")
      setShowUpload(false)

      await forceResync()
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" })
    } finally {
      setUploading(false)
      setUploadProgress("")
    }
  }

  const ensureDataLoaded = async () => {
    if (dataLoaded) return allData
    const data = await fetchMasterInChunks()
    setAllData(data)
    setDataLoaded(true)
    return data
  }

  const handleSearch = async (q: string) => {
    setQuery(q)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!q.trim()) { setResults([]); return }

    timerRef.current = setTimeout(async () => {
      const master = await ensureDataLoaded()
      const lower = q.toLowerCase()
      setResults(
        master.filter(r =>
          r.consumerId.toLowerCase().includes(lower) ||
          r.name.toLowerCase().includes(lower)        ||
          r.meterNo.toLowerCase().includes(lower)     ||
          r.address.toLowerCase().includes(lower)    ||
          r.mobile.includes(lower)
        ).slice(0, 100)
      )
    }, 200)
  }

  const formatAge = (ms: number | null) => {
    if (ms === null) return "Not cached"
    const mins = Math.floor(ms / 60000)
    if (mins < 60) return `${mins} min ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} hrs ago`
    return `${Math.floor(hours / 24)} days ago`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" /> Consumer Master Database
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Central repository of all consumers for account lookups, meter verification, and GIS pole coordinates
          </p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <Button
              onClick={() => setShowUpload(!showUpload)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 rounded-xl px-4 flex items-center gap-2 shadow-sm"
            >
              <Upload className="h-4 w-4" /> {showUpload ? "Close Upload" : "Upload Bulk Master"}
            </Button>
          )}

          <Button
            variant="outline"
            onClick={forceResync}
            disabled={!!syncProgress}
            className="text-xs h-9 rounded-xl border-slate-200 hover:bg-slate-50 font-semibold text-slate-700"
          >
            <Activity className={`h-4 w-4 mr-1.5 ${syncProgress ? "animate-spin text-blue-600" : "text-slate-500"}`} />
            {syncProgress || "Resync Local Cache"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-slate-200/80 shadow-sm rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Master Records</p>
              <h3 className="text-2xl font-black text-slate-900 mt-0.5">
                {count !== null ? count.toLocaleString() : "—"}
              </h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Database className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200/80 shadow-sm rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Local IndexedDB Cache</p>
              <h3 className="text-sm font-bold text-slate-700 mt-1">
                {formatAge(cacheAge)}
              </h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-slate-200/80 shadow-sm rounded-2xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Storage Sync Status</p>
              <h3 className="text-xs font-bold text-emerald-700 mt-1 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Active & Optimized
              </h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Layers className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {showUpload && isAdmin && (
        <Card className="bg-white border-blue-200 shadow-md rounded-2xl overflow-hidden">
          <CardHeader className="bg-blue-50/50 border-b border-blue-100 pb-3">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Upload className="h-4 w-4 text-blue-600" /> Upload Master CSV / Excel Export
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600">Select File (.csv)</Label>
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                disabled={uploading}
                className="h-10 rounded-xl border-slate-200 text-xs"
              />
              {fileName && <p className="text-xs text-slate-500 font-mono">Selected: {fileName} ({csvRows.length.toLocaleString()} rows)</p>}
            </div>

            {csvHeaders.length > 0 && (
              <div className="space-y-3 pt-2">
                <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">Map CSV Columns to Fields</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {(Object.keys(FIELD_LABELS) as (keyof ConsumerMasterRow)[]).map((field) => (
                    <div key={field} className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700">
                        {FIELD_LABELS[field]} {REQUIRED_FIELDS.includes(field) && <span className="text-red-500">*</span>}
                      </Label>
                      <Select
                        value={mapping[field] !== undefined ? String(mapping[field]) : "unmapped"}
                        onValueChange={(val) => setMapping(prev => ({ ...prev, [field]: val === "unmapped" ? undefined : Number(val) }))}
                      >
                        <SelectTrigger className="h-8 rounded-lg text-xs bg-white border-slate-200">
                          <SelectValue placeholder="-- Select --" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unmapped" className="text-xs text-slate-400">-- Ignore --</SelectItem>
                          {csvHeaders.map((h, colIdx) => (
                            <SelectItem key={colIdx} value={String(colIdx)} className="text-xs">
                              Col {colIdx + 1}: {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-10 px-6 rounded-xl shadow-sm"
                  >
                    {uploading ? uploadProgress || "Uploading…" : "Start Master Import"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="bg-white border-slate-200/80 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-slate-100 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base font-bold text-slate-900">
              Search Consumer Master Records
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await ensureDataLoaded()
                setShowNearbyMap(v => !v)
              }}
              className="h-8 rounded-xl border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100 text-xs font-bold gap-1.5"
            >
              <MapPin className="h-3.5 w-3.5" />
              {showNearbyMap ? "Hide Radar Map" : "Open GIS Pole Map"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
            <Input
              placeholder="Search by Consumer ID, Name, Meter No, Address, or Mobile..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 pr-10 h-11 rounded-xl border-slate-200 text-sm font-medium focus-visible:ring-blue-600"
            />
            {query && (
              <X
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 h-4 w-4 cursor-pointer"
                onClick={() => handleSearch("")}
              />
            )}
          </div>

          {showNearbyMap && (
            <div className="space-y-2 border border-slate-200 rounded-2xl p-2 bg-slate-50">
              <p className="text-xs font-bold text-slate-700 px-2 py-1 flex items-center justify-between">
                <span>GIS Consumer Radar ({mappedConsumers.length.toLocaleString()} locations)</span>
                <span className="text-[10px] text-slate-400 font-normal">Tap markers to inspect consumer details</span>
              </p>
              <NearbyConsumerMap consumers={mappedConsumers as any} onClose={() => setShowNearbyMap(false)} />
            </div>
          )}

          {query.trim() && (
            <div className="text-xs font-bold text-slate-500">
              Found {results.length} matching records {results.length >= 100 && "(Showing top 100)"}
            </div>
          )}

          {results.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
              {results.map((c) => (
                <Card key={c.consumerId} className="border border-slate-200/90 shadow-none hover:shadow-md transition-all rounded-xl overflow-hidden bg-slate-50/40 hover:bg-white">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                          {c.consumerId}
                        </span>
                        <h4 className="font-bold text-slate-900 text-sm mt-1 leading-snug">{c.name}</h4>
                        {c.careOf && <p className="text-xs text-slate-500">C/O {c.careOf}</p>}
                      </div>
                      {c.baseClass && (
                        <Badge variant="outline" className="text-[10px] uppercase font-bold text-slate-600 border-slate-200">
                          {c.baseClass}
                        </Badge>
                      )}
                    </div>

                    <div className="text-xs text-slate-600 space-y-1">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{c.address}</span>
                      </div>
                      {c.mobile && (
                        <div className="flex items-center gap-1.5 text-blue-600 font-mono font-semibold">
                          <Smartphone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <a href={`tel:${c.mobile}`} className="hover:underline">{c.mobile}</a>
                        </div>
                      )}
                      {c.meterNo && (
                        <div className="flex items-center gap-1.5 text-purple-700 font-mono font-semibold">
                          <Gauge className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                          Meter: {c.meterNo}
                        </div>
                      )}
                    </div>

                    {c.latitude && c.longitude && (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <span className="font-mono text-slate-400 font-medium">GPS: {c.latitude}, {c.longitude}</span>
                        <a
                          href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 font-bold hover:underline inline-flex items-center gap-1"
                        >
                          Maps <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
