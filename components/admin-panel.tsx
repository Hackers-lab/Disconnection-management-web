"use client"


import Papa from "papaparse";
// xlsx loaded dynamically inside various handlers to optimize initial bundle size
import { useHashState } from "@/hooks/use-hash-state";
import { getFromCache, saveToCache } from "@/lib/indexed-db";
import { Table, TableHeader, TableRow, TableHead, TableCell, TableBody } from "@/components/ui/table";
import React, { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Users, Building2, Upload, List, ArrowLeft, Trash2, Edit, Plus, X, Save, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff, KeyRound, Filter, ChevronDown, ChevronRight, ShieldCheck, ShieldAlert } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Condition, Group, Operator, rowMatchesGroups, isNumericOp, OPERATOR_LABELS } from "@/lib/upload-filter"
import { userStorage } from "@/lib/user-storage";

// Optional filter-only source columns (mapped for filtering/conflict, never uploaded).
const FILTER_COLUMNS = ["Class", "Gov/Non-Gov", "Discon Status"] as const

// Header-name synonyms (normalized) used to auto-suggest the upload column mapping.
const HEADER_SYNONYMS: Record<string, string[]> = {
  "off_code": ["off_code", "offcode", "off code"],
  "MRU": ["mru"],
  "Consumer Id": ["consumer id", "consumerid", "consumer_id", "ca", "account"],
  "Name": ["name", "consumer name"],
  "Address": ["address"],
  "Base Class": ["base class", "baseclass", "bclass/phase", "bclass", "bclassphase", "phase"],
  "Device": ["device", "meter", "meter no", "meter number"],
  "O/S Duedate Range": ["o/s duedate range", "o/s due date range", "os duedate range", "due date range", "duedate range"],
  "D2 Net O/S": ["d2 net o/s", "d2 net os", "net o/s", "net os", "outstanding"],
  "Mobile Number": ["mobile number", "mobile", "phone", "mobile no"],
  "Class": ["class"],
  "Gov/Non-Gov": ["gov/non-gov", "gov non gov", "govnongov", "gov", "government"],
  "Discon Status": ["discon status", "disconnection status", "status"],
}

const ROLE_TEMPLATES: Record<string, Record<string, string[]>> = {
  admin: {
    disconnection: ["read", "create", "update", "delete"],
    reconnection: ["read", "create", "update", "delete"],
    deemed: ["read", "create", "update", "delete"],
    dtr: ["read", "create", "update", "delete"],
    meter: ["read", "create", "update", "delete"],
    nsc: ["read", "create", "update", "delete", "inspect", "process", "project_create", "po_entry", "agency_complete", "admin_approve"],
    consumer_master: ["read", "create", "update", "delete"],
    admin: ["read", "create", "update", "delete"],
    meter_replacement: ["read", "create", "update", "delete", "issue", "install", "return", "finalize"],
    dtr_painting: ["read", "create", "update", "delete"],
    material: ["read", "create", "update", "delete", "receive", "issue", "stock", "settings"],
  },
  executive: {
    disconnection: ["read", "create", "update"],
    reconnection: ["read", "create", "update"],
    deemed: ["read", "create", "update"],
    dtr: ["read", "create", "update"],
    meter: ["read", "create", "update"],
    nsc: ["read", "create", "update", "inspect", "process", "project_create", "po_entry", "admin_approve"],
    consumer_master: ["read", "create", "update"],
    admin: [],
    meter_replacement: ["read", "create", "update", "issue", "install", "return", "finalize"],
    dtr_painting: ["read", "create", "update"],
    material: ["read", "create", "update", "receive", "issue", "stock"],
  },
  agency: {
    disconnection: ["read", "update"],
    reconnection: ["read", "update"],
    deemed: ["read", "update"],
    dtr: ["read", "update"],
    meter: ["read", "update"],
    nsc: ["read", "inspect", "agency_complete"],
    consumer_master: ["read"],
    admin: [],
    meter_replacement: ["read", "install"],
    dtr_painting: ["read", "update"],
    material: ["read", "update", "receive", "issue", "stock"],
  },
  store_keeper: {
    disconnection: ["read"],
    reconnection: ["read"],
    deemed: ["read"],
    dtr: ["read"],
    meter: ["read", "create", "update"],
    nsc: ["read"],
    consumer_master: ["read"],
    admin: [],
    meter_replacement: ["read", "create", "issue", "return"],
    dtr_painting: ["read"],
    material: ["read", "create", "update", "receive", "issue", "stock"],
  },
  reader: {
    disconnection: ["read"],
    reconnection: ["read"],
    deemed: ["read"],
    dtr: ["read"],
    meter: ["read"],
    nsc: ["read"],
    consumer_master: ["read"],
    admin: [],
    meter_replacement: ["read", "create"],
    dtr_painting: ["read"],
    material: ["read"],
  },
  viewer: {
    disconnection: ["read"],
    reconnection: ["read"],
    deemed: ["read"],
    dtr: ["read"],
    meter: ["read"],
    nsc: ["read"],
    consumer_master: ["read"],
    admin: [],
    meter_replacement: ["read"],
    dtr_painting: ["read"],
    material: ["read"],
  },
}

// Existing-consumer statuses that are "protected" — these reappearing in a new
// upload trigger the conflict-resolution UI. Mirrors the server-side sets.
const PROTECTED_STATUSES = new Set([
  "disconnected", "paid", "agency paid", "visited", "not found",
  "deemed disconnected", "temprory disconnected", "bill dispute", "office team",
])

// Categorical filter fields offer multi-select of distinct file values;
// numeric fields offer comparison inputs.
const NUMERIC_FILTER_FIELDS = new Set(["D2 Net O/S"])

const normalizeHeader = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "")

interface AdminPanelProps {
  onClose: () => void
}

type ViewType = "menu" | "users" | "agencies" | "payments" | "dcList" | "zoneMap" | "roles" | "google-onboarding"

interface User {
  id: string
  username: string
  password: string
  role: string
  agencies: string[]
}

interface Agency {
  id: string
  name: string
  description?: string
  isActive: boolean
}



export function AdminPanel({ onClose }: AdminPanelProps) {

    const [sheetName, setSheetName] = useState("Sheet1"); // Default sheet name
    const [isUploading, setIsUploading] = useState(false);
    const expectedColumns = [
        "off_code",
        "MRU",
        "Consumer Id",
        "Name",
        "Address",
        "Base Class",
        "Device",
        "O/S Duedate Range",
        "D2 Net O/S",
        "Mobile Number"
        ] as const;

    const uploadToGoogleSheet = async () => {
        if (finalUploadRows.length === 0) {
            setMessage({ type: "error", text: "No rows to upload (check mapping/filters)" });
            return;
        }
        setIsUploading(true);
        setDcUploadResult(null);
        try {
            const CHUNK_SIZE = 1000;
            const total = finalUploadRows.length;
            const allUploadIds = finalUploadRows.map(row => String(row[2] || "").trim()).filter(Boolean);
            
            let inserted = 0;
            let updated = 0;
            let protectedStatusSkipped = 0;
            let autoAssigned = 0;
            let deletedNotInUpload = 0;

            for (let i = 0; i < total; i += CHUNK_SIZE) {
                const chunkRows = finalUploadRows.slice(i, i + CHUNK_SIZE);
                const isLastChunk = (i + CHUNK_SIZE) >= total;
                
                setMessage({
                    type: "default" as any,
                    text: `Uploading rows ${i + 1} to ${Math.min(i + CHUNK_SIZE, total)} of ${total}...`
                });

                const payload: any = {
                    rows: chunkRows,
                    newCycle: newCycleUpload,
                    overrides: conflictOverrides,
                    isChunk: true,
                    isLastChunk,
                };

                if (isLastChunk) {
                    payload.allUploadIds = allUploadIds;
                }

                const response = await fetch("/api/consumers/bulk-upsert", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                const contentType = response.headers.get("content-type") || "";
                let result;
                if (contentType.includes("application/json")) {
                    result = await response.json();
                } else {
                    const text = await response.text();
                    throw new Error(text || `Server returned status ${response.status}`);
                }

                if (!response.ok || !result.success) {
                    throw new Error(result.error || "Failed to upload data chunk");
                }

                const s = result.summary;
                inserted += s.inserted || 0;
                updated += s.updated || 0;
                protectedStatusSkipped += s.protectedStatusSkipped || 0;
                autoAssigned += s.autoAssigned || 0;
                deletedNotInUpload += s.deletedNotInUpload || 0;
            }

            const finalSummary = {
                total,
                inserted,
                updated,
                protectedStatusSkipped,
                autoAssigned,
                deletedNotInUpload,
            };

            setDcUploadResult(finalSummary);
            setMessage({
                type: "success",
                text: `Upload complete: ${inserted} new, ${updated} updated, ${autoAssigned} auto-assigned agency, ${deletedNotInUpload} removed.`,
            });
        } catch (error) {
            console.error("Upload error:", error);
            setMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Failed to upload data",
            });
        } finally {
            setIsUploading(false);
        }
    };

    // Download the current DC list from IndexedDB cache as a CSV backup.
    // Runs entirely in the browser — no server call, no extra CPU.
    const downloadCacheBackup = async () => {
        setBackupDownloading(true);
        try {
            const cached = await getFromCache<any[]>("consumers_data_cache");
            if (!cached || cached.length === 0) {
                setMessage({ type: "error", text: "No cached data found. Please open the Disconnection List first so data loads into your browser." });
                return;
            }
            const XLSX = await import("xlsx")
            // Convert to CSV using XLSX (already in deps)
            const headers = [
                "off_code","MRU","Consumer Id","Name","Address","Base Class","Class",
                "Nature of Conn","Gov/Non-Gov","Device","O/S Duedate Range","D2 Net O/S",
                "Discon Status","Discon Date","GIS Pole","Mobile Number","Latitude","Longitude",
                "Agency","Reading","Image","Notes","Last Updated","Priority",
                "Paid Amount","Paid Date","Paid Type","Outstanding After","Next Payment Date","Payment Source",
            ];
            const rows = cached.map(c => [
                c.offCode,c.mru,c.consumerId,c.name,c.address,c.baseClass,c.class,
                c.natureOfConn,c.govNonGov,c.device,c.osDuedateRange,c.d2NetOS,
                c.disconStatus,c.disconDate,c.gisPole,c.mobileNumber,c.latitude,c.longitude,
                c.agency,c.reading,c.imageUrl,c.notes,c.lastUpdated,c.priority,
                c.paidAmount,c.paidDate,c.paidType,c.outstandingAfter,c.nextPaymentDate,c.paymentSource,
            ]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "DC Backup");
            const dateStr = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `DC_Backup_${dateStr}.xlsx`);
            setMessage({ type: "success", text: `✅ Backup downloaded: DC_Backup_${dateStr}.xlsx (${cached.length} consumers from your browser cache)` });
        } catch (e) {
            setMessage({ type: "error", text: "Backup failed: " + (e instanceof Error ? e.message : String(e)) });
        } finally {
            setBackupDownloading(false);
        }
    };

    // Refresh lat/long in DC list from Consumer Master (VLOOKUP-style)
    const refreshLatLong = async () => {
        if (!confirm(
            "This will look up each consumer in the DC list against the Consumer Master and fill in their latitude/longitude.\n\nOnly consumers missing both lat & long will be updated. Continue?"
        )) return;
        setLatLongRefreshing(true);
        setLatLongResult(null);
        try {
            const resp = await fetch("/api/consumers/refresh-latlong", { method: "POST" });
            const data = await resp.json();
            if (!resp.ok || !data.success) throw new Error(data?.error || "Refresh failed");
            setLatLongResult(data.summary);
            setMessage({ type: "success", text: `✅ Lat/Long refresh complete: ${data.summary.updated} consumers updated from Consumer Master.` });
        } catch (err: any) {
            setMessage({ type: "error", text: err?.message || "Failed to refresh lat/long" });
        } finally {
            setLatLongRefreshing(false);
        }
    };

  const columnRegexMap: Record<string, RegExp> = {
    "off_code": /^\d{7}$/,
    "MRU": /^[A-Z0-9]{6}MR$/,
    "Consumer Id": /^\d{9}$/,
    "Name": /^(?!.*\b(dom|rural|urban)\b)[a-z\s,.'-]+$/i,
    "Address": /^(?=.*[A-Za-z]).{16,}$/,
    "Base Class": /^[A-Z]\s*-\d\s*PHASE$/i,
    "Device": /^[A-Z0-9_]{5,11}[0-9]$/,
    "O/S Duedate Range": /^\d{2}[./-]\d{2}[./-]\d{4}\s*-\s*\d{2}[./-]\d{2}[./-]\d{4}$/,
    "D2 Net O/S": /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/,
    "Mobile Number": /^[6-9]\d{9}$/,

    };

    const [parsedData, setParsedData] = useState<any[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
    const [fileName, setFileName] = useState<string>("");
    const [dcUploadResult, setDcUploadResult] = useState<{ total: number; inserted: number; updated: number; protectedStatusSkipped: number; autoAssigned: number; deletedNotInUpload: number } | null>(null);
    const [newCycleUpload, setNewCycleUpload] = useState(false);
    const [backupDownloading, setBackupDownloading] = useState(false);
    const [latLongRefreshing, setLatLongRefreshing] = useState(false);
    const [latLongResult, setLatLongResult] = useState<{ matched: number; updated: number; alreadyHad: number; noMaster: number } | null>(null);

    // --- DC upload: smart mapping + filters + conflict resolution ---
    const [rawHeaders, setRawHeaders] = useState<string[]>([]);
    const [rawRows, setRawRows] = useState<string[][]>([]);
    // mapping: target/filter column name -> CSV column index (-1 = unmapped)
    const [mapping, setMapping] = useState<Record<string, number>>({});
    const [mappingConfidence, setMappingConfidence] = useState<Record<string, "name" | "pattern" | "unmatched">>({});
    const [mappingConfirmed, setMappingConfirmed] = useState(false);
    // filter rule engine
    const [ruleGroups, setRuleGroups] = useState<Group[]>([]);
    const [presets, setPresets] = useState<{ name: string; groups: Group[] }[]>([]);
    const [presetName, setPresetName] = useState("");
    const [savingPreset, setSavingPreset] = useState(false);
    // conflict resolution
    const [conflictOverrides, setConflictOverrides] = useState<Record<string, "keep" | "replace">>({});
    const [expandedStatuses, setExpandedStatuses] = useState<Record<string, boolean>>({});
    const [cachedConsumers, setCachedConsumers] = useState<any[]>([]);

    const ZONE_MAP_CACHE_KEY = "zone_map_cache";

    // --- ZONE MAP STATE (item 12) ---
    const [zoneMapRows, setZoneMapRows] = useState<{ zone: string; agency: string; address?: string; updatedOn?: string }[]>([]);
    const [zoneMapLoading, setZoneMapLoading] = useState(false);
    const [zoneMapSaving, setZoneMapSaving] = useState(false);
    const [newZone, setNewZone] = useState("");
    const [newZoneAgency, setNewZoneAgency] = useState("");
    const [availableMrus, setAvailableMrus] = useState<string[]>([]);
    const [zoneUploadMode, setZoneUploadMode] = useState<"manual" | "csv">("manual");
    const [zoneUploadRows, setZoneUploadRows] = useState<{ zone: string; agency: string; address?: string }[]>([]);
    const [zoneUploadFileName, setZoneUploadFileName] = useState("");
    const [showZoneGuide, setShowZoneGuide] = useState(false);
    const [newZoneAddress, setNewZoneAddress] = useState("");
    const [zoneAgencyFilter, setZoneAgencyFilter] = useState("All");
    const [zoneViewMode, setZoneViewMode] = useState<"flat" | "agency">("agency");
    const [mruSearch, setMruSearch] = useState("");
    const [resyncing, setResyncing] = useState(false);
    const [resyncResult, setResyncResult] = useState<{ scanned: number; reassigned: number; skippedProtected: number; unchanged: number; unmapped: number } | null>(null);

    // Auto-suggest the column mapping using a 3-tier match:
    //  1. exact header-name match (synonyms, normalized)
    //  2. substring header-name match (still skipping claimed columns)
    //  3. regex value detection over up to 20 samples (80% / 30% for mobile)
    // Returns mapping (target -> csv idx, -1 if none) + per-target confidence.
    const autoSuggestMapping = (headers: string[], dataRows: string[][]) => {
      const normHeaders = headers.map(normalizeHeader)
      const claimed = new Set<number>()
      const map: Record<string, number> = {}
      const conf: Record<string, "name" | "pattern" | "unmatched"> = {}
      const allTargets = [...expectedColumns, ...FILTER_COLUMNS]
      const synFor = (col: string) => (HEADER_SYNONYMS[col] || [col]).map(normalizeHeader)

      // Pass 1: exact name match
      for (const col of allTargets) {
        const syns = synFor(col)
        const found = normHeaders.findIndex((h, i) => !claimed.has(i) && syns.includes(h))
        if (found !== -1) { map[col] = found; conf[col] = "name"; claimed.add(found) }
      }
      // Pass 2: substring name match
      for (const col of allTargets) {
        if (map[col] !== undefined) continue
        const syns = synFor(col)
        const found = normHeaders.findIndex((h, i) =>
          !claimed.has(i) && h.length > 1 && syns.some(s => h.includes(s) || s.includes(h)))
        if (found !== -1) { map[col] = found; conf[col] = "name"; claimed.add(found) }
      }
      // Pass 3: regex value detection (target columns only)
      for (const col of expectedColumns) {
        if (map[col] !== undefined) continue
        const regex = columnRegexMap[col]
        if (!regex) continue
        const threshold = col === "Mobile Number" ? 0.3 : 0.8
        for (let i = 0; i < headers.length; i++) {
          if (claimed.has(i)) continue
          const sample = dataRows.slice(0, 20).map(r => String(r[i] ?? "").trim()).filter(Boolean)
          if (sample.length === 0) continue
          const hit = sample.filter(v => regex.test(v)).length / sample.length
          if (hit > threshold) { map[col] = i; conf[col] = "pattern"; claimed.add(i); break }
        }
      }
      // Fill the rest as unmatched
      for (const col of allTargets) {
        if (map[col] === undefined) { map[col] = -1; conf[col] = "unmatched" }
      }
      return { map, conf }
    }

    // Unified ingest for both CSV and Excel: store the raw grid + auto-suggested
    // mapping, then let the user confirm/correct before any upload is built.
    const ingestParsed = (headers: string[], dataRows: string[][], name: string) => {
      const cleanRows = dataRows.filter(r => Array.isArray(r) && r.length > 1)
      const { map, conf } = autoSuggestMapping(headers, cleanRows)
      setRawHeaders(headers.map(String))
      setRawRows(cleanRows.map(r => r.map(c => String(c ?? ""))))
      setMapping(map)
      setMappingConfidence(conf)
      setMappingConfirmed(false)
      setRuleGroups([])
      setConflictOverrides({})
      setExpandedStatuses({})
      setParsedData([])
      setColumnMapping({})
      setDcUploadResult(null)
      setFileName(name)
    }

    const handleFileUpload = (file: File) => {
      Papa.parse(file, {
        complete: (results: Papa.ParseResult<any[]>) => {
          const rows = (results.data as any[][]) || []
          if (rows.length === 0) return
          ingestParsed(rows[0] as string[], rows.slice(1) as string[][], file.name)
        },
        header: false,
        skipEmptyLines: true,
      })
    }

  const [view, setView] = useHashState<ViewType>("admin", "menu")
  const [users, setUsers] = useState<User[]>([])

  // Google integration status state
  const [tenantStatus, setTenantStatus] = useState<{ linked: boolean; driveFolderId?: string; spreadsheetId?: string; cccName?: string; cccCode?: string } | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)

  const fetchTenantStatus = async () => {
    setLoadingStatus(true)
    try {
      const res = await fetch("/api/admin/tenant-status")
      if (res.ok) {
        setTenantStatus(await res.json())
      }
    } catch (e) {
      console.error(e)
    } fontally {
      setLoadingStatus(false)
    }
  }

  useEffect(() => {
    if (view === "google-onboarding") {
      fetchTenantStatus()
    }
  }, [view])
  const [agencies, setAgencies] = useState<Agency[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [selectedRole, setSelectedRole] = useState<string>("agency")
  const [newRoleName, setNewRoleName] = useState("")
  const [showAddRole, setShowAddRole] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAddAgency, setShowAddAgency] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [visiblePasswordId, setVisiblePasswordId] = useState<string | null>(null)
  const [changingPasswordUser, setChangingPasswordUser] = useState<User | null>(null)
  const [changePasswordValue, setChangePasswordValue] = useState("")
  const [changePasswordConfirm, setChangePasswordConfirm] = useState("")
  const [showChangePwdField, setShowChangePwdField] = useState(false)
  const [showChangePwdConfirm, setShowChangePwdConfirm] = useState(false)

  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    role: "agency",
    agencies: [] as string[],
  })

  const [newAgency, setNewAgency] = useState({
    name: "",
    description: "",
    isActive: true,
  })

  // --- PAYMENT UPLOAD STATE (items 3 + 13) ---
  type PaymentParsed = { consumerId: string; paidAmount: number; paidDate: string }
  const [paymentSource, setPaymentSource] = useState<"Cash Desk" | "Portal">("Cash Desk")
  const [paymentFileName, setPaymentFileName] = useState<string>("")
  const [paymentRows, setPaymentRows] = useState<PaymentParsed[]>([])
  const [paymentParseError, setPaymentParseError] = useState<string | null>(null)
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [paymentResult, setPaymentResult] = useState<{
    receivedRows: number; uniqueConsumers: number; matched: number; notFound: number;
    fullPayments: number; partialPayments: number; notFoundIds: string[];
  } | null>(null)

  // Auto-detect which columns hold consumer id, amount, date.
  const detectPaymentColumns = (headers: string[]) => {
    const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")
    const idCandidates = ["consumerid", "conid", "id", "account", "ca"]
    const amtCandidates = ["paidamount", "amount", "amountpaid", "paid", "received", "credit"]
    const dateCandidates = ["paiddate", "date", "paymentdate", "txndate", "transactiondate"]
    const findOne = (cands: string[]) =>
      headers.findIndex((h) => cands.some((c) => norm(h).includes(c)))
    return {
      idIdx: findOne(idCandidates),
      amtIdx: findOne(amtCandidates),
      dateIdx: findOne(dateCandidates),
    }
  }

  // Convert Excel serial date or string to DD-MM-YYYY (matches app convention).
  const normalizeDate = (raw: any, XLSX?: any): string => {
    if (raw === null || raw === undefined || raw === "") return ""
    // Excel serial number
    if (typeof raw === "number") {
      if (XLSX) {
        const d = XLSX.SSF.parse_date_code(raw)
        if (d) {
          const dd = String(d.d).padStart(2, "0")
          const mm = String(d.m).padStart(2, "0")
          return `${dd}-${mm}-${d.y}`
        }
      }
    }
    const s = String(raw).trim()
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.split("-")
      return `${d}-${m}-${y.slice(0, 4)}`
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s.replace(/\//g, "-")
    // Last resort: let Date parse it
    const parsed = new Date(s)
    if (!isNaN(parsed.getTime())) {
      const dd = String(parsed.getDate()).padStart(2, "0")
      const mm = String(parsed.getMonth() + 1).padStart(2, "0")
      return `${dd}-${mm}-${parsed.getFullYear()}`
    }
    return s
  }

  const parsePaymentFile = (file: File) => {
    setPaymentFileName(file.name)
    setPaymentParseError(null)
    setPaymentResult(null)
    setPaymentRows([])

    const isExcel = /\.(xlsx|xls)$/i.test(file.name)
    if (isExcel) {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const XLSX = await import("xlsx")
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const wb = XLSX.read(data, { type: "array", cellDates: false })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" })
          if (!rows || rows.length < 2) {
            setPaymentParseError("Excel must have at least a header row and one data row.")
            return
          }
          await processPaymentRows(rows as any[][])
        } catch (err: any) {
          setPaymentParseError(`Excel parse failed: ${err?.message || err}`)
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      Papa.parse<any[]>(file, {
        header: false,
        skipEmptyLines: true,
        complete: async (res: any) => {
          const rows = (res.data as any[][]) || []
          if (rows.length < 2) {
            setPaymentParseError("CSV must have at least a header row and one data row.")
            return
          }
          await processPaymentRows(rows)
        },
        error: (err: any) => setPaymentParseError(`CSV parse failed: ${err?.message || err}`),
      })
    }
  }

  const processPaymentRows = async (rows: any[][]) => {
    const headers = (rows[0] || []).map((h) => String(h ?? ""))
    const { idIdx, amtIdx, dateIdx } = detectPaymentColumns(headers)
    if (idIdx === -1 || amtIdx === -1) {
      setPaymentParseError(
        `Could not auto-detect required columns. Found headers: [${headers.join(", ")}]. Need at least a Consumer ID and Amount column.`
      )
      return
    }
    const XLSX = await import("xlsx")
    const parsed: PaymentParsed[] = []
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || []
      const id = String(r[idIdx] ?? "").trim()
      if (!id) continue
      const amtRaw = String(r[amtIdx] ?? "0").replace(/[,\s₹$]/g, "").replace(/[^\d.-]/g, "")
      const amt = parseFloat(amtRaw)
      if (!isFinite(amt) || amt <= 0) continue
      const dateRaw = dateIdx !== -1 ? r[dateIdx] : ""
      parsed.push({ consumerId: id, paidAmount: amt, paidDate: normalizeDate(dateRaw, XLSX) })
    }
    setPaymentRows(parsed)
  }

  const submitPayments = async () => {
    if (paymentRows.length === 0) return
    setPaymentSubmitting(true)
    setPaymentResult(null)
    try {
      const CHUNK_SIZE = 1000;
      const total = paymentRows.length;
      
      let receivedRows = 0;
      let uniqueConsumers = 0;
      let matched = 0;
      let notFound = 0;
      let fullPayments = 0;
      let partialPayments = 0;
      const aggregatedNotFoundIds: string[] = [];

      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunkPayments = paymentRows.slice(i, i + CHUNK_SIZE);
        
        setMessage({
          type: "default" as any,
          text: `Applying payments ${i + 1} to ${Math.min(i + CHUNK_SIZE, total)} of ${total}...`
        });

        const resp = await fetch("/api/payments/bulk-apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: paymentSource, payments: chunkPayments }),
        });

        const contentType = resp.headers.get("content-type") || "";
        let data;
        if (contentType.includes("application/json")) {
          data = await resp.json();
        } else {
          const text = await resp.text();
          throw new Error(text || `Server returned status ${resp.status}`);
        }

        if (!resp.ok || !data.success) {
          throw new Error(data?.error || "Bulk apply failed for payment chunk");
        }

        const s = data.summary;
        receivedRows += s.receivedRows || 0;
        uniqueConsumers += s.uniqueConsumers || 0;
        matched += s.matched || 0;
        notFound += s.notFound || 0;
        fullPayments += s.fullPayments || 0;
        partialPayments += s.partialPayments || 0;
        if (Array.isArray(data.notFoundIds)) {
          aggregatedNotFoundIds.push(...data.notFoundIds);
        }
      }

      setPaymentResult({
        receivedRows,
        uniqueConsumers,
        matched,
        notFound,
        fullPayments,
        partialPayments,
        notFoundIds: aggregatedNotFoundIds.slice(0, 50), // cap display size
      });

      setMessage({
        type: "success",
        text: `Successfully applied payments: ${matched} matched, ${notFound} unmatched.`,
      });
    } catch (err: any) {
      console.error("Payment submit error:", err);
      setMessage({ type: "error", text: err?.message || "Bulk apply failed" })
    } finally {
      setPaymentSubmitting(false)
    }
  }

  // Zone map load/save — with IndexedDB cache for instant loading.
  // Cache is invalidated only when admin explicitly saves changes.
  const loadZoneMap = async () => {
    setZoneMapLoading(true)

    // 1. Show cached data immediately (zero server cost, instant display).
    try {
      const cached = await getFromCache<typeof zoneMapRows>(ZONE_MAP_CACHE_KEY)
      if (cached && cached.length > 0) {
        setZoneMapRows(cached)
        setZoneMapLoading(false) // stop spinner so user sees data right away
      }
    } catch { /* ignore cache errors */ }

    // 2. Refresh from server in background (always keep map + MRUs fresh).
    try {
      const [mapResp, mruResp] = await Promise.all([
        fetch("/api/zone-map"),
        fetch("/api/zone-map/mrus"),
      ])
      if (mapResp.ok) {
        const fresh = await mapResp.json()
        setZoneMapRows(fresh)
        await saveToCache(ZONE_MAP_CACHE_KEY, fresh)
      }
      if (mruResp.ok) setAvailableMrus(await mruResp.json())
    } catch { /* silent — cached data still shown */ }
    finally { setZoneMapLoading(false) }
  }

  const saveZoneMap = async (rows: { zone: string; agency: string; address?: string }[]) => {
    setZoneMapSaving(true)
    try {
      const resp = await fetch("/api/zone-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      })
      if (resp.ok) {
        const updated = rows.map(r => ({ ...r, updatedOn: new Date().toLocaleDateString("en-IN") }))
        setZoneMapRows(updated)
        // Update cache immediately with new data so next open is instant.
        await saveToCache(ZONE_MAP_CACHE_KEY, updated)
      }
    } catch { /* silent */ }
    finally { setZoneMapSaving(false) }
  }

  // Re-apply the current zone map to existing consumers without a DC re-upload.
  // Reassigns consumers whose mapped agency differs; skips protected statuses.
  const resyncAgencies = async () => {
    if (!confirm(
      "Re-apply the current zone map to all existing consumers?\n\n" +
      "Consumers whose mapped agency has changed will be reassigned. " +
      "Consumers in a protected status (disconnected, paid, visited, etc.) are skipped. " +
      "No DC list upload is needed."
    )) return
    setResyncing(true)
    setResyncResult(null)
    try {
      const resp = await fetch("/api/zone-map/resync", { method: "POST" })
      const data = await resp.json()
      if (!resp.ok || !data.success) throw new Error(data?.error || "Re-sync failed")
      setResyncResult(data.summary)
      setMessage({ type: "success", text: `Re-sync complete: ${data.summary.reassigned} consumers reassigned.` })
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Re-sync failed" })
    } finally {
      setResyncing(false)
    }
  }

  const parseZoneCsv = (file: File) => {
    setZoneUploadFileName(file.name)
    Papa.parse<any[]>(file, {
      header: false, skipEmptyLines: true,
      complete: (res) => {
        const rows = (res.data as any[][]) || []
        if (rows.length < 2) { alert("File must have a header row and at least 1 data row."); return }
        const headers = (rows[0] || []).map(h => String(h ?? "").toLowerCase())
        const zoneIdx = headers.findIndex(h => h.includes("mru") || h.includes("zone") || h.includes("off"))
        const agencyIdx = headers.findIndex(h => h.includes("agency") || h.includes("name"))
        const addrIdx = headers.findIndex(h => h.includes("address") || h.includes("area") || h.includes("locality"))
        const zIdx = zoneIdx !== -1 ? zoneIdx : 0
        const aIdx = agencyIdx !== -1 ? agencyIdx : 1
        const parsed = rows.slice(1).map(r => ({
          zone: String(r[zIdx] ?? "").trim().toUpperCase(),
          agency: String(r[aIdx] ?? "").trim(),
          address: addrIdx !== -1 ? String(r[addrIdx] ?? "").trim() : "",
        })).filter(r => r.zone && r.agency)
        setZoneUploadRows(parsed)
      }
    })
  }

  // Clear message after 5s
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [message])

  // Clear modal message after 5s
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [message])

  // Load agencies for dropdowns
  const loadAgencies = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/admin/agencies")
      if (response.ok) {
        const data = await response.json()
        setAgencies(data)
      }
    } catch (error) {
      console.error("Error loading agencies:", error)
      setMessage({ type: "error", text: "Failed to load agencies" })
    } finally {
      setLoading(false)
    }
  }

  // Load initial view or handle view changes
  useEffect(() => {
    if (view === "google-onboarding") {
      fetchTenantStatus()
    }
    if (view === "zoneMap") {
      loadZoneMap()
    }

    if (view === "dcList") {
      // Pre-load cached consumers in background so conflict detection has baseline status data
      getFromCache<any[]>("consumers_data_cache")
        .then(c => { if (c) setCachedConsumers(c) })
        .catch(() => {})
      // Pre-load saved presets from localStorage
      try {
        const p = localStorage.getItem("dc_filter_presets")
        if (p) setPresets(JSON.parse(p))
      } catch {}
    }

    if (view === "users" || view === "agencies" || view === "zoneMap") {
      loadAgencies()
    }
  }, [view])

  // Load users when view changes to users
  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoading(true)
        const response = await fetch("/api/admin/users")
        if (response.ok) {
          const data = await response.json()
          setUsers(data)
        }
      } catch (error) {
        console.error("Error loading users:", error)
        setMessage({ type: "error", text: "Failed to load users" })
      } finally {
        setLoading(false)
      }
    }

    if (view === "users") {
      loadUsers()
    }
  }, [view])

  const loadRoles = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/roles")
      if (res.ok) {
        const data = await res.json()
        setRoles(data)
      }
    } catch (e) {
      console.error("Failed to load roles:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (view === "users" || view === "roles") {
      loadRoles()
    }
  }, [view])

  const saveRolePermissions = async (roleName: string, updatedPerms: Record<string, string[]>) => {
    try {
      setLoading(true)
      const payload = {
        role: roleName,
        ...updatedPerms
      }
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        await loadRoles()
        setMessage({ type: "success", text: `Role permissions for '${roleName}' saved successfully.` })
      } else {
        throw new Error("Failed to save role permissions")
      }
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed to save permissions" })
    } finally {
      setLoading(false)
    }
  }

  const createNewRole = async () => {
    const name = newRoleName.trim().toLowerCase()
    if (!name) return
    
    // Check if already exists
    if (roles.some(r => r.role.toLowerCase() === name)) {
      setMessage({ type: "error", text: "Role already exists" })
      return
    }

    const defaultPerms: Record<string, string[]> = {
      disconnection: ["read"],
      reconnection: ["read"],
      deemed: ["read"],
      dtr: ["read"],
      meter: ["read"],
      nsc: ["read"],
      consumer_master: ["read"],
      meter_replacement: ["read"],
      dtr_painting: ["read"],
      material: ["read"],
      admin: []
    }
    
    await saveRolePermissions(name, defaultPerms)
    setSelectedRole(name)
    setNewRoleName("")
    setShowAddRole(false)
  }

  const deleteRole = async (roleName: string) => {
    if (roleName.toLowerCase() === "admin") return
    if (!confirm(`Are you sure you want to delete the role '${roleName}'?`)) return
    try {
      setLoading(true)
      const res = await fetch(`/api/admin/roles?role=${roleName}`, {
        method: "DELETE"
      })
      if (res.ok) {
        await loadRoles()
        setSelectedRole("agency")
        setMessage({ type: "success", text: `Role '${roleName}' deleted successfully.` })
      } else {
        throw new Error("Failed to delete role")
      }
    } catch (e: any) {
      setMessage({ type: "error", text: e.message || "Failed to delete role" })
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (view === "menu") {
      onClose()
    } else {
      setView("menu")
      setEditingUser(null)
      setEditingAgency(null)
      setShowAddUser(false)
      setShowAddAgency(false)
    }
  }

  // Create new user
  const addUser = async () => {
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      })

      if (response.ok) {
        setMessage({ type: "success", text: "User created successfully" })
        setNewUser({ username: "", password: "", role: "agency", agencies: [] })
        setShowAddUser(false)
        // Refresh users list
        const updatedUsers = await response.json()
        if (Array.isArray(updatedUsers)) {
          setUsers(updatedUsers)
        } else {
          // Re-fetch users
          const refreshRes = await fetch("/api/admin/users")
          if (refreshRes.ok) setUsers(await refreshRes.json())
        }
      } else {
        const errorData = await response.json()
        setMessage({ type: "error", text: errorData.error || "Failed to create user" })
      }
    } catch (error) {
      console.error("Error creating user:", error)
      setMessage({ type: "error", text: "Failed to create user" })
    }
  }

  // Update existing user
  const updateUser = async () => {
    if (!editingUser) return
    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingUser),
      })

      if (response.ok) {
        setMessage({ type: "success", text: "User updated successfully" })
        setEditingUser(null)
        // Refresh users list
        const refreshRes = await fetch("/api/admin/users")
        if (refreshRes.ok) setUsers(await refreshRes.json())
      } else {
        const errorData = await response.json()
        setMessage({ type: "error", text: errorData.error || "Failed to update user" })
      }
    } catch (error) {
      console.error("Error updating user:", error)
      setMessage({ type: "error", text: "Failed to update user" })
    }
  }

  // Delete user
  const deleteUser = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return
    try {
      const response = await fetch(`/api/admin/users?id=${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        setMessage({ type: "success", text: "User deleted successfully" })
        setUsers(users.filter(u => u.id !== id))
      } else {
        const errorData = await response.json()
        setMessage({ type: "error", text: errorData.error || "Failed to delete user" })
      }
    } catch (error) {
      console.error("Error deleting user:", error)
      setMessage({ type: "error", text: "Failed to delete user" })
    }
  }

  // Change password for user
  const changePassword = async () => {
    if (!changingPasswordUser) return
    if (!changePasswordValue.trim() || changePasswordValue !== changePasswordConfirm) {
      setMessage({ type: "error", text: "Passwords do not match or are empty" })
      return
    }
    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...changingPasswordUser, password: changePasswordValue }),
      })
      if (response.ok) {
        setMessage({ type: "success", text: `Password updated for '${changingPasswordUser.username}'` })
        setChangingPasswordUser(null)
        setChangePasswordValue("")
        setChangePasswordConfirm("")
        setShowChangePwdField(false)
        setShowChangePwdConfirm(false)
        // Refresh users list
        const refreshRes = await fetch("/api/admin/users")
        if (refreshRes.ok) setUsers(await refreshRes.json())
      } else {
        const errorData = await response.json()
        setMessage({ type: "error", text: errorData.error || "Failed to change password" })
      }
    } catch (error) {
      console.error("Error changing password:", error)
      setMessage({ type: "error", text: "Failed to change password" })
    }
  }

  // Create new agency
  const addAgency = async () => {
    try {
      const response = await fetch("/api/admin/agencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAgency),
      })

      if (response.ok) {
        setMessage({ type: "success", text: "Agency created successfully" })
        setNewAgency({ name: "", description: "", isActive: true })
        setShowAddAgency(false)
        // Refresh agencies list
        loadAgencies()
      } else {
        const errorData = await response.json()
        setMessage({ type: "error", text: errorData.error || "Failed to create agency" })
      }
    } catch (error) {
      console.error("Error creating agency:", error)
      setMessage({ type: "error", text: "Failed to create agency" })
    }
  }

  // Update existing agency
  const updateAgency = async () => {
    if (!editingAgency) return
    try {
      const response = await fetch("/api/admin/agencies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingAgency),
      })

      if (response.ok) {
        setMessage({ type: "success", text: "Agency updated successfully" })
        setEditingAgency(null)
        loadAgencies()
      } else {
        const errorData = await response.json()
        setMessage({ type: "error", text: errorData.error || "Failed to update agency" })
      }
    } catch (error) {
      console.error("Error updating agency:", error)
      setMessage({ type: "error", text: "Failed to update agency" })
    }
  }

  // Delete agency
  const deleteAgency = async (id: string) => {
    if (!confirm("Are you sure you want to delete this agency?")) return
    try {
      const response = await fetch(`/api/admin/agencies?id=${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        setMessage({ type: "success", text: "Agency deleted successfully" })
        setAgencies(agencies.filter(a => a.id !== id))
      } else {
        const errorData = await response.json()
        setMessage({ type: "error", text: errorData.error || "Failed to delete agency" })
      }
    } catch (error) {
      console.error("Error deleting agency:", error)
      setMessage({ type: "error", text: "Failed to delete agency" })
    }
  }

  // Toggle user agency assignment
  const toggleUserAgency = (agencyName: string, isNewUser = false) => {
    if (isNewUser) {
      const currentAgencies = newUser.agencies || []
      const updated = currentAgencies.includes(agencyName)
        ? currentAgencies.filter(a => a !== agencyName)
        : [...currentAgencies, agencyName]
      setNewUser({ ...newUser, agencies: updated })
    } else if (editingUser) {
      const currentAgencies = editingUser.agencies || []
      const updated = currentAgencies.includes(agencyName)
        ? currentAgencies.filter(a => a !== agencyName)
        : [...currentAgencies, agencyName]
      setEditingUser({ ...editingUser, agencies: updated })
    }
  }

  // Distinct values helper for a column index in rawRows
  const getDistinctValues = (colIdx: number) => {
    if (colIdx < 0) return []
    const set = new Set<string>()
    for (const r of rawRows) {
      const v = String(r[colIdx] ?? "").trim()
      if (v) set.add(v)
    }
    return Array.from(set).sort()
  }

  // Compute final rows: rawRows -> map -> filter by ruleGroups
  const finalUploadRows = useMemo(() => {
    if (rawRows.length === 0) return []
    const mapped = rawRows.map(r => expectedColumns.map(col => {
      const idx = mapping[col]
      return idx !== undefined && idx >= 0 ? String(r[idx] ?? "").trim() : ""
    }))
    if (ruleGroups.length === 0) return mapped
    return mapped.filter((_, rowIdx) => {
      const rawRow = rawRows[rowIdx] || []
      const getVal = (col: string) => {
        const idx = mapping[col]
        return idx !== undefined && idx >= 0 ? String(rawRow[idx] ?? "").trim() : ""
      }
      return rowMatchesGroups(getVal, ruleGroups)
    })
  }, [rawRows, mapping, ruleGroups])

  // Conflict detection: compare finalUploadRows against cachedConsumers
  const conflicts = useMemo(() => {
    if (finalUploadRows.length === 0 || cachedConsumers.length === 0) return []
    const cidIdx = 2 // Consumer Id index in expectedColumns
    const cacheMap = new Map<string, any>()
    for (const c of cachedConsumers) {
      const cid = String(c.consumerId || "").trim()
      if (cid) cacheMap.set(cid, c)
    }
    const list: { consumerId: string; name: string; status: string; newRow: string[] }[] = []
    for (const row of finalUploadRows) {
      const cid = String(row[cidIdx] || "").trim()
      if (!cid) continue
      const existing = cacheMap.get(cid)
      if (!existing) continue
      const st = String(existing.disconStatus || "").trim().toLowerCase()
      if (PROTECTED_STATUSES.has(st)) {
        list.push({ consumerId: cid, name: existing.name || String(row[3] || ""), status: st, newRow: row })
      }
    }
    return list
  }, [finalUploadRows, cachedConsumers])

  const conflictsByStatus = useMemo(() => {
    const map: Record<string, typeof conflicts> = {}
    for (const c of conflicts) {
      if (!map[c.status]) map[c.status] = []
      map[c.status].push(c)
    }
    return map
  }, [conflicts])

  // Returns "keep" | "replace" | "mixed" for a given status cluster
  const statusDecision = (status: string) => {
    const list = conflictsByStatus[status] || []
    if (list.length === 0) return "keep"
    const first = conflictOverrides[list[0].consumerId] || "keep"
    const allSame = list.every(c => (conflictOverrides[c.consumerId] || "keep") === first)
    return allSame ? first : "mixed"
  }

  const setStatusDecision = (status: string, decision: "keep" | "replace") => {
    const list = conflictsByStatus[status] || []
    setConflictOverrides(prev => {
      const next = { ...prev }
      for (const c of list) next[c.consumerId] = decision
      return next
    })
  }

  const setConsumerDecision = (consumerId: string, decision: "keep" | "replace") => {
    setConflictOverrides(prev => ({ ...prev, [consumerId]: decision }))
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      {/* Header with back navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
        </div>
        {view !== "menu" && (
          <Badge variant="outline" className="text-sm font-semibold capitalize">
            {view === "dcList" ? "Upload DC List" : view === "zoneMap" ? "Agency Zone Map" : view === "roles" ? "Manage Roles" : view === "payments" ? "Upload Payments" : view}
          </Badge>
        )}
      </div>

      {/* Global alert messages */}
      {message && (
        <Alert className={`mb-6 ${message.type === "success" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200"}`}>
          {message.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* VIEW: MAIN MENU */}
      {view === "menu" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <DashboardCard
            icon={<Users className="h-8 w-8 text-blue-600" />}
            title="User Management"
            description="Manage user accounts, passwords, and assigned field agencies"
            onClick={() => setView("users")}
          />
          <DashboardCard
            icon={<Building2 className="h-8 w-8 text-indigo-600" />}
            title="Field Agencies"
            description="Create, activate/deactivate agencies and edit organization descriptions"
            onClick={() => setView("agencies")}
          />
          <DashboardCard
            icon={<List className="h-8 w-8 text-purple-600" />}
            title="Upload DC List"
            description="Sync disconnection list with smart mapping, custom filters & history tracking"
            onClick={() => setView("dcList")}
          />
          <DashboardCard
            icon={<Upload className="h-8 w-8 text-green-600" />}
            title="Upload Payments"
            description="Bulk apply CSV/Excel payment files (Cash Desk / Portal) with auto-matching"
            onClick={() => setView("payments")}
          />
          <DashboardCard
            icon={<Building2 className="h-8 w-8 text-orange-600" />}
            title="Agency Zone Map"
            description="Map MRUs to field agencies for automatic consumer assignment on upload"
            onClick={() => setView("zoneMap")}
          />
          <DashboardCard
            icon={<Users className="h-8 w-8 text-amber-600" />}
            title="Manage Roles & Permissions"
            description="Configure granular module permissions per role"
            onClick={() => setView("roles")}
          />
          <DashboardCard
            icon={<Upload className="h-8 w-8 text-cyan-600" />}
            title="Link Google Drive & Sheets"
            description="Connect custom Google Drive folder & Sheet for persistent multi-tenant data storage"
            onClick={() => setView("google-onboarding")}
          />
        </div>
      )}

      {/* VIEW: GOOGLE ONBOARDING / CONFIG */}
      {view === "google-onboarding" && (
        <div className="space-y-6 max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-blue-600" />
                Google Workspace Integration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Link your organizational Google Drive & Google Sheets to automatically persist all application data, reports, and evidence images in your own Google cloud storage.
              </p>

              {loadingStatus ? (
                <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Fetching tenant connection status...
                </div>
              ) : tenantStatus?.linked ? (
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 space-y-1">
                    <div className="font-bold">Google Cloud Linked & Active</div>
                    <div className="text-xs font-mono">CCC Code: {tenantStatus.cccCode}</div>
                    <div className="text-xs">
                      Spreadsheet ID: <span className="font-mono text-gray-700">{tenantStatus.spreadsheetId}</span>
                    </div>
                    {tenantStatus.driveFolderId && (
                      <div className="text-xs">
                        Drive Folder ID: <span className="font-mono text-gray-700">{tenantStatus.driveFolderId}</span>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    Not linked to a custom Google account yet. The default system spreadsheet is being used.
                  </AlertDescription>
                </Alert>
              )}

              <div className="pt-2 flex flex-col gap-3">
                <Button 
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  onClick={() => {
                    // Redirect to OAuth route
                    window.location.href = "/api/auth/google"
                  }}
                >
                  {tenantStatus?.linked ? "Re-authenticate / Change Google Account" : "Connect Google Account (OAuth 2.0)"}
                </Button>
                <p className="text-xs text-gray-500 text-center">
                  You will be prompted to grant permissions to manage Google Sheets and Drive files in your account.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* VIEW: PAYMENT FILE UPLOAD */}
      {view === "payments" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Upload Payments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Upload a CSV or Excel file containing consumer payment records. The file will be parsed in your browser and automatically matched by <strong>Consumer ID</strong>.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Source</Label>
                  <Select value={paymentSource} onValueChange={(val: any) => setPaymentSource(val)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash Desk">Cash Desk (Manual Cash Collections)</SelectItem>
                      <SelectItem value="Portal">Portal (Online Collections)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Payment File</Label>
                  <Input
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv"
                    onChange={(e) => e.target.files && parsePaymentFile(e.target.files[0])}
                  />
                </div>
              </div>

              {paymentFileName && (
                <p className="text-xs text-gray-500">Selected: <span className="font-mono">{paymentFileName}</span></p>
              )}

              {paymentParseError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{paymentParseError}</AlertDescription>
                </Alert>
              )}

              {paymentRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Parsed Rows ({paymentRows.length})</h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setPaymentRows([]); setPaymentFileName(""); setPaymentResult(null); }}
                    >
                      <X className="h-4 w-4 mr-1" /> Clear
                    </Button>
                  </div>
                  <div className="border rounded-md max-h-72 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Consumer ID</TableHead>
                          <TableHead className="text-right">Paid Amount</TableHead>
                          <TableHead>Paid Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paymentRows.slice(0, 50).map((r, i) => (
                          <TableRow key={`${r.consumerId}-${i}`}>
                            <TableCell className="font-mono">{r.consumerId}</TableCell>
                            <TableCell className="text-right">{r.paidAmount.toLocaleString("en-IN")}</TableCell>
                            <TableCell>{r.paidDate || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {paymentRows.length > 50 && (
                      <p className="text-xs text-gray-500 p-2 text-center">
                        Showing first 50 of {paymentRows.length} rows
                      </p>
                    )}
                  </div>

                  <Button
                    onClick={submitPayments}
                    disabled={paymentSubmitting}
                    className="w-full sm:w-auto"
                  >
                    {paymentSubmitting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Applying…</>
                    ) : (
                      <><Upload className="h-4 w-4 mr-2" /> Apply {paymentRows.length} Payments</>
                    )}
                  </Button>
                </div>
              )}

              {paymentResult && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <div><strong>{paymentResult.matched}</strong> of <strong>{paymentResult.uniqueConsumers}</strong> consumers updated.</div>
                      <div className="text-xs">
                        {paymentResult.receivedRows} rows &rarr; {paymentResult.uniqueConsumers} consumers (duplicates summed) &middot; Full: {paymentResult.fullPayments} &middot; Partial: {paymentResult.partialPayments} &middot; Not found: {paymentResult.notFound}
                      </div>
                      {paymentResult.notFoundIds.length > 0 && (
                        <details className="text-xs mt-2">
                          <summary className="cursor-pointer">Show unmatched IDs (first {paymentResult.notFoundIds.length})</summary>
                          <div className="font-mono mt-1 max-h-32 overflow-auto break-all">
                            {paymentResult.notFoundIds.join(", ")}
                          </div>
                        </details>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {view === "dcList" && (
        <div className="space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <h2 className="text-xl font-bold">Upload DC List</h2>
            <div className="flex gap-2 flex-wrap">
              {/* Backup: reads from IndexedDB, zero server cost */}
              <Button
                size="sm"
                variant="outline"
                className="border-green-300 text-green-700 hover:bg-green-50"
                onClick={downloadCacheBackup}
                disabled={backupDownloading}
              >
                {backupDownloading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Preparing…</> : "⬇ Backup Current List"}
              </Button>
              {/* Refresh Lat/Long from Consumer Master — VLOOKUP style */}
              <Button
                size="sm"
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={refreshLatLong}
                disabled={latLongRefreshing}
                title="Match Consumer IDs in DC list with Consumer Master and copy lat/long coordinates"
              >
                {latLongRefreshing
                  ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Refreshing…</>
                  : "📍 Refresh Lat/Long from Master"}
              </Button>
              <Button size="sm" variant="outline" onClick={async () => {
                const XLSX = await import("xlsx")
                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
                  ["off_code", "MRU", "Consumer Id", "Name", "Address", "Base Class", "Device", "O/S Duedate Range", "D2 Net O/S", "Mobile Number"],
                  ["6612107", "AB01MR", "100000001", "CONSUMER NAME", "123 ROAD AREA DISTRICT", "L-1 PHASE", "METER001", "01-01-2024 - 31-03-2024", "5000", "9876543210"],
                  ["6612107", "AB01MR", "100000002", "ANOTHER CONSUMER", "456 STREET TOWN", "L-1 PHASE", "METER002", "01-01-2024 - 31-03-2024", "12000", "9876543211"],
                ]), "DC List")
                XLSX.writeFile(wb, "DC_List_Template.xlsx")
              }}>
                Download Template
              </Button>
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-600 mt-1">
              Upload a CSV or Excel DC list. New IDs are inserted; existing IDs are updated.
              Consumers removed from the new list are archived to <span className="font-mono">DC_History</span>.
              Statuses like Disconnected/Paid are protected — only billing data is updated for them.
              <details className="mt-2">
                <summary className="cursor-pointer text-blue-600 text-xs underline">Show file format guide</summary>
                <div className="mt-2 bg-blue-50 rounded p-3 text-xs space-y-1">
                  <p className="font-semibold text-blue-800">Required columns (must be present as headers):</p>
                  <p><span className="font-mono">off_code</span> · <span className="font-mono">MRU</span> · <span className="font-mono">Consumer Id</span> · <span className="font-mono">Name</span> · <span className="font-mono">Address</span> · <span className="font-mono">Base Class</span> · <span className="font-mono">Device</span> · <span className="font-mono">O/S Duedate Range</span> · <span className="font-mono">D2 Net O/S</span> · <span className="font-mono">Mobile Number</span></p>
                </div>
              </details>
            </p>
          </div>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">File Ingestion & Smart Mapping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-4">
                <Input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
                  className="max-w-xs text-xs"
                />
                {fileName && <span className="text-xs text-gray-500">Selected: <span className="font-mono">{fileName}</span></span>}
              </div>

              {rawHeaders.length > 0 && !mappingConfirmed && (
                <div className="space-y-3 border-t pt-3">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <h4 className="font-semibold text-sm">Confirm Column Mapping ({rawHeaders.length} columns in file, {rawRows.length} rows)</h4>
                    <span className="text-xs text-gray-500">Auto-detected using header synonyms and sample patterns</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 border p-3 rounded-md bg-gray-50 max-h-72 overflow-auto">
                    {[...expectedColumns, ...FILTER_COLUMNS].map(col => {
                      const idx = mapping[col] ?? -1
                      const conf = mappingConfidence[col]
                      const isFilter = (FILTER_COLUMNS as readonly string[]).includes(col)
                      return (
                        <div key={col} className="space-y-1 bg-white p-2 border rounded-md">
                          <div className="flex justify-between text-xs">
                            <span className="font-semibold">{col} {isFilter && <span className="text-[10px] text-purple-600 font-bold">(filter only)</span>}</span>
                            {conf === "name font-semibold" && <span className="text-[10px] text-green-700 bg-green-100 px-1 rounded">Name match</span>}
                            {conf === "pattern" && <span className="text-[10px] text-blue-700 bg-blue-100 px-1 rounded">Pattern match</span>}
                            {conf === "unmatched" && <span className="text-[10px] text-amber-700 bg-amber-100 px-1 rounded">Unmatched</span>}
                          </div>
                          <select
                            value={idx}
                            onChange={(e) => setMapping(prev => ({ ...prev, [col]: parseInt(e.target.value) }))}
                            className="w-full text-xs border rounded p-1"
                          >
                            <option value={-1}>-- Ignore / Not in file --</option>
                            {rawHeaders.map((h, i) => (
                              <option key={i} value={i}>{h} (col {i + 1})</option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                  <Button size="sm" onClick={() => setMappingConfirmed(true)}>Confirm Mapping & Proceed to Filter</Button>
                </div>
              )}

              {mappingConfirmed && (
                <div className="space-y-4 border-t pt-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-sm">Target Rows to Sync ({finalUploadRows.length} of {rawRows.length} match filters)</h4>
                    <Button size="sm" variant="outline" onClick={() => setMappingConfirmed(false)}>Change Mapping</Button>
                  </div>

                  {/* Filter Rule Engine UI */}
                  <div className="border rounded-md p-3 space-y-3 bg-slate-50">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-semibold text-xs text-gray-700">Filter Rules (AND between groups, OR inside group)</span>
                      <div className="flex gap-2">
                        {presets.length > 0 && (
                          <Select onValueChange={(val) => {
                            const p = presets.find(x => x.name === val)
                            if (p) setRuleGroups(p.groups)
                          }}>
                            <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="Load Preset" /></SelectTrigger>
                            <SelectContent>
                              {presets.map(p => <SelectItem key={p.name} value={p.name} className="text-xs">{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRuleGroups(prev => [...prev, { id: Date.now().toString(), conditions: [{ id: Date.now().toString() + "-c", field: "Base Class", operator: "equals", value: [] }] }])}>
                          <Plus className="h-3 w-3 mr-1" /> Add Group
                        </Button>
                      </div>
                    </div>

                    {ruleGroups.length === 0 ? (
                      <p className="text-xs text-gray-500 italic">No filter rules applied. All {rawRows.length} rows will be synced.</p>
                    ) : (
                      <div className="space-y-3">
                        {ruleGroups.map((group, gIdx) => (
                          <div key={group.id} className="border rounded-md p-2 bg-white space-y-2">
                            <div className="flex justify-between items-center text-xs font-semibold text-gray-600">
                              <span>Group {gIdx + 1} (Matches IF ANY condition below holds)</span>
                              <button onClick={() => setRuleGroups(prev => prev.filter(g => g.id !== group.id))} className="text-red-500 hover:underline text-xs">Remove Group</button>
                            </div>
                            {group.conditions.map(cond => {
                              const isNum = NUMERIC_FILTER_FIELDS.has(cond.field)
                              const colIdx = mapping[cond.field] ?? -1
                              const distinctVals = getDistinctValues(colIdx)
                              const ops: Operator[] = isNum ? ["gt", "gte", "lt", "lte", "equals"] : ["equals", "not_equals", "contains", "in"]
                              return (
                                <div key={cond.id} className="flex items-center gap-2 text-xs flex-wrap">
                                  <select
                                    value={cond.field}
                                    onChange={(e) => {
                                      const nf = e.target.value
                                      setRuleGroups(prev => prev.map(g => g.id === group.id ? {
                                        ...g,
                                        conditions: g.conditions.map(c => c.id === cond.id ? { ...c, field: nf, value: [] } : c)
                                      } : g))
                                    }}
                                    className="border rounded px-2 py-1 text-xs"
                                  >
                                    {[...expectedColumns, ...FILTER_COLUMNS].map(col => <option key={col} value={col}>{col}</option>)}
                                  </select>

                                  <select
                                    value={cond.operator}
                                    onChange={(e) => {
                                      const nop = e.target.value as Operator
                                      setRuleGroups(prev => prev.map(g => g.id === group.id ? {
                                        ...g,
                                        conditions: g.conditions.map(c => c.id === cond.id ? { ...c, operator: nop } : c)
                                      } : g))
                                    }}
                                    className="border rounded px-2 py-1 text-xs"
                                  >
                                    {ops.map(op => <option key={op} value={op}>{OPERATOR_LABELS[op] || op}</option>)}
                                  </select>

                                  {/* Value selector */}
                                  {isNum ? (
                                    <Input
                                      type="number"
                                      value={Array.isArray(cond.value) ? cond.value[0] || "" : cond.value}
                                      onChange={(e) => {
                                        const v = e.target.value
                                        setRuleGroups(prev => prev.map(g => g.id === group.id ? {
                                          ...g,
                                          conditions: g.conditions.map(c => c.id === cond.id ? { ...c, value: [v] } : c)
                                        } : g))
                                      }}
                                      className="h-7 w-28 text-xs"
                                      placeholder="Value..."
                                    />
                                  ) : (
                                    <div className="flex gap-1 flex-wrap items-center max-w-md max-h-24 overflow-auto border p-1 rounded bg-gray-50">
                                      {distinctVals.slice(0, 50).map(val => {
                                        const arr = Array.isArray(cond.value) ? cond.value : []
                                        const checked = arr.includes(val)
                                        return (
                                          <label key={val} className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer border ${checked ? "bg-blue-100 border-blue-400 text-blue-800" : "bg-white border-gray-200"}`}>
                                            <input
                                              type="checkbox"
                                              className="hidden"
                                              checked={checked}
                                              onChange={() => {
                                                const next = checked ? arr.filter(x => x !== val) : [...arr, val]
                                                setRuleGroups(prev => prev.map(g => g.id === group.id ? {
                                                  ...g,
                                                  conditions: g.conditions.map(c => c.id === cond.id ? { ...c, value: next } : c)
                                                } : g))
                                              }}
                                            />
                                            {val}
                                          </label>
                                        )
                                      })}
                                    </div>
                                  )}

                                  <button onClick={() => setRuleGroups(prev => prev.map(g => g.id === group.id ? { ...g, conditions: g.conditions.filter(c => c.id !== cond.id) } : g))} className="text-red-400 hover:text-red-600">
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              )
                            })}
                            <Button size="sm" variant="ghost" className="h-6 text-[11px] text-blue-600" onClick={() => setRuleGroups(prev => prev.map(g => g.id === group.id ? { ...g, conditions: [...g.conditions, { id: Date.now().toString(), field: "Base Class", operator: "equals", value: [] }] } : g))}>
                              + Add Condition to Group
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Save preset */}
                    <div className="flex items-center gap-2 border-t pt-2">
                      <Input placeholder="Preset name..." value={presetName} onChange={e => setPresetName(e.target.value)} className="h-7 w-40 text-xs" />
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!presetName.trim()} onClick={() => {
                        const newPresets = [...presets.filter(p => p.name !== presetName), { name: presetName.trim(), groups: ruleGroups }]
                        setPresets(newPresets)
                        localStorage.setItem("dc_filter_presets", JSON.stringify(newPresets))
                        setPresetName("")
                        setMessage({ type: "success", text: "Filter preset saved." })
                      }}>
                        Save Preset
                      </Button>
                    </div>
                  </div>

                  {/* Cycle option */}
                  <div className="flex items-center gap-2 text-xs">
                    <input type="checkbox" id="newCycle" checked={newCycleUpload} onChange={e => setNewCycleUpload(e.target.checked)} className="rounded" />
                    <label htmlFor="newCycle" className="font-semibold cursor-pointer">
                      New Billing Cycle Upload (re-enables disconnections for consumers previously marked Paid/Reconnected)
                    </label>
                  </div>

                  {/* Conflicts Cluster UI */}
                  {conflicts.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm flex items-center gap-1">
                        <ShieldAlert className="h-4 w-4 text-amber-600" /> {conflicts.length} protected consumers in this upload
                      </h4>
                      <p className="text-xs text-gray-500">
                        These already have a field/admin status. Choose <strong>Keep</strong> (protect existing) or
                        <strong> Replace</strong> (overwrite with new list). Default is Keep. Expand to decide per consumer.
                      </p>
                      {Object.entries(conflictsByStatus).map(([status, list]) => {
                        const decision = statusDecision(status)
                        const expanded = !!expandedStatuses[status]
                        return (
                          <div key={status} className="border rounded-md">
                            <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
                              <button onClick={() => setExpandedStatuses(s => ({ ...s, [status]: !expanded }))} className="text-gray-500">
                                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                              <span className="flex-1 font-medium capitalize">{status} <span className="text-gray-400">({list.length})</span></span>
                              <div className="flex gap-1">
                                <button onClick={() => setStatusDecision(status, "keep")}
                                  className={`px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 ${decision === "keep" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                  <ShieldCheck className="h-3 w-3" /> Keep
                                </button>
                                <button onClick={() => setStatusDecision(status, "replace")}
                                  className={`px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1 ${decision === "replace" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                                  <Upload className="h-3 w-3" /> Replace
                                </button>
                                {decision === "mixed" && <span className="text-[10px] text-amber-600 self-center">mixed</span>}
                              </div>
                            </div>
                            {expanded && (
                              <div className="border-t divide-y max-h-48 overflow-auto">
                                {list.map(c => {
                                  const d = conflictOverrides[c.consumerId] === "replace" ? "replace" : "keep"
                                  return (
                                    <div key={c.consumerId} className="flex items-center gap-2 px-2 py-1 text-[11px]">
                                      <span className="font-mono text-gray-500 w-24 shrink-0">{c.consumerId}</span>
                                      <span className="flex-1 truncate">{c.name}</span>
                                      <div className="flex gap-1">
                                        <button onClick={() => setConsumerDecision(c.consumerId, "keep")}
                                          className={`px-1.5 py-0.5 rounded-full ${d === "keep" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>Keep</button>
                                        <button onClick={() => setConsumerDecision(c.consumerId, "replace")}
                                          className={`px-1.5 py-0.5 rounded-full ${d === "replace" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>Replace</button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Preview */}
                  {finalUploadRows.length > 0 && (
                    <>
                      <h4 className="font-semibold text-sm">Preview (first 5 of {finalUploadRows.length})</h4>
                      <div className="border rounded-md overflow-auto max-h-52">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {expectedColumns.map(c => <TableHead key={c} className="text-[11px] px-2 py-1 whitespace-nowrap">{c}</TableHead>)}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {finalUploadRows.slice(0, 5).map((row, i) => (
                              <TableRow key={i}>
                                {row.map((cell, j) => (
                                  <TableCell key={j} className="text-[11px] px-2 py-1 max-w-[100px] truncate">{cell}</TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}

                  <Button className="w-full sm:w-auto" onClick={uploadToGoogleSheet} disabled={isUploading || finalUploadRows.length === 0}>
                    {isUploading
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
                      : <><Upload className="h-4 w-4 mr-2" /> Sync {finalUploadRows.length} rows to Sheet</>}
                  </Button>
                </div>
              )}

              {dcUploadResult && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1 text-sm">
                      <p><strong>{dcUploadResult.total}</strong> rows in file processed.</p>
                      <div className="flex flex-wrap gap-3 text-xs mt-1">
                        <span className="text-green-700">✓ {dcUploadResult.inserted} new inserted</span>
                        <span className="text-blue-700">✓ {dcUploadResult.updated} updated</span>
                        <span className="text-orange-700">⚠ {dcUploadResult.protectedStatusSkipped} had protected status (only OSD/base updated)</span>
                        <span className="text-purple-700">✓ {dcUploadResult.autoAssigned} auto-assigned agency</span>
                        {dcUploadResult.deletedNotInUpload > 0 && (
                          <span className="text-red-700">🗑 {dcUploadResult.deletedNotInUpload} not in new list → saved to history and deleted from sheet</span>
                        )}
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Lat/Long Refresh Result */}
          {latLongResult && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 flex flex-wrap gap-4 items-center">
              <span className="font-semibold">📍 Lat/Long Refresh Result:</span>
              <span className="text-green-700">✓ {latLongResult.updated} updated</span>
              <span className="text-gray-600">↩ {latLongResult.alreadyHad} already had coordinates</span>
              <span className="text-gray-500">✗ {latLongResult.noMaster} not in Consumer Master</span>
              <span className="text-blue-700">{latLongResult.matched} matched total</span>
            </div>
          )}
        </div>
      )}

      {view === "zoneMap" && (
        <div className="space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-xl font-bold">Agency Zone Map</h2>
              <p className="text-sm text-gray-600 mt-1">
                Map MRUs to agencies. Used during DC list upload to auto-assign agency per consumer.
                Changes are tracked in <span className="font-mono text-xs">ZoneMapHistory</span>.
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={resyncing || zoneMapRows.length === 0}
                onClick={resyncAgencies} title="Apply the current zone map to existing consumers — no DC upload needed">
                {resyncing
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Re-syncing…</>
                  : <>Re-sync agencies</>}
              </Button>
              <Button size="sm" variant="outline" onClick={async () => {
                const XLSX = await import("xlsx")
                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
                  ["MRU", "Agency", "Address"],
                  ["AB01MR", "AGENCY NAME", "Area / locality description"],
                  ["AB02MR", "AGENCY NAME 2", "North zone near substation"],
                ]), "ZoneMap")
                XLSX.writeFile(wb, "ZoneMap_Template.xlsx")
              }}>
                Download Template
              </Button>
            </div>
          </div>

          {resyncResult && (
            <Alert className="bg-blue-50 border-blue-200 text-blue-900">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-xs space-y-1">
                <div className="font-bold">Re-sync Complete</div>
                <div className="flex flex-wrap gap-3 mt-1">
                  <span><strong>{resyncResult.scanned}</strong> scanned</span>
                  <span className="text-green-700">✓ <strong>{resyncResult.reassigned}</strong> reassigned</span>
                  <span className="text-orange-700">⚠ <strong>{resyncResult.skippedProtected}</strong> protected skipped</span>
                  <span className="text-gray-600">↩ <strong>{resyncResult.unchanged}</strong> already matched</span>
                  {resyncResult.unmapped > 0 && <span className="text-amber-700">? <strong>{resyncResult.unmapped}</strong> unmapped MRU</span>}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Zone Mapping Mode</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant={zoneUploadMode === "manual" ? "default" : "outline"}
                  onClick={() => setZoneUploadMode("manual")} className="h-7 text-xs">
                  Manual Entry
                </Button>
                <Button size="sm" variant={zoneUploadMode === "csv" ? "default" : "outline"}
                  onClick={() => setZoneUploadMode("csv")} className="h-7 text-xs">
                  Bulk Upload File
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {zoneUploadMode === "manual" ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">MRU / Zone Code</Label>
                      {availableMrus.length > 0 ? (
                        <Select value={newZone} onValueChange={setNewZone}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select or type MRU..." /></SelectTrigger>
                          <SelectContent>
                            {availableMrus.map(m => <SelectItem key={m} value={m} className="text-xs font-mono">{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input placeholder="e.g. AB01MR" value={newZone} onChange={e => setNewZone(e.target.value.toUpperCase())} className="h-8 text-xs font-mono" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Field Agency</Label>
                      <Select value={newZoneAgency} onValueChange={setNewZoneAgency}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select agency..." /></SelectTrigger>
                        <SelectContent>
                          {agencies.filter(a => a.isActive).map(a => <SelectItem key={a.id} value={a.name} className="text-xs">{a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Address / Area (Optional)</Label>
                      <Input placeholder="e.g. North Zone Substation area" value={newZoneAddress} onChange={e => setNewZoneAddress(e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                  <Button size="sm" disabled={!newZone.trim() || !newZoneAgency || zoneMapSaving}
                    onClick={() => {
                      const updated = zoneMapRows.filter(r => r.zone !== newZone.trim())
                      saveZoneMap([...updated, { zone: newZone.trim(), agency: newZoneAgency, address: newZoneAddress.trim() }])
                      setNewZone("")
                      setNewZoneAgency("")
                      setNewZoneAddress("")
                    }}>
                    {zoneMapSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                    Add / Update Mapping
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Input type="file" accept=".csv,.xlsx,.xls" onChange={e => e.target.files && parseZoneCsv(e.target.files[0])} className="max-w-xs text-xs" />
                  {zoneUploadRows.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-green-700">Parsed {zoneUploadRows.length} mappings from {zoneUploadFileName}</p>
                      <div className="border rounded max-h-36 overflow-auto text-xs p-2 bg-gray-50">
                        {zoneUploadRows.slice(0, 10).map((r, i) => (
                          <div key={i} className="flex gap-4 font-mono">
                            <span className="w-20 font-bold">{r.zone}</span>
                            <span className="text-blue-700">{r.agency}</span>
                            <span className="text-gray-500 truncate">{r.address}</span>
                          </div>
                        ))}
                        {zoneUploadRows.length > 10 && <p className="text-[10px] text-gray-400">...and {zoneUploadRows.length - 10} more</p>}
                      </div>
                      <Button size="sm" disabled={zoneMapSaving} onClick={() => {
                        const existingMap = new Map(zoneMapRows.map(r => [r.zone, r]))
                        for (const r of zoneUploadRows) existingMap.set(r.zone, r)
                        saveZoneMap(Array.from(existingMap.values()))
                        setZoneUploadRows([])
                      }}>
                        Apply {zoneUploadRows.length} Mappings to Sheet
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Current Zone Map Table */}
              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">Active MRU Mappings ({zoneMapRows.length})</h3>
                    <button onClick={loadZoneMap} disabled={zoneMapLoading} className="text-gray-400 hover:text-gray-600">
                      <RefreshCw className={`h-3 w-3 ${zoneMapLoading ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    {/* View Mode Toggle */}
                    <div className="flex border rounded-md overflow-hidden">
                      <button onClick={() => setZoneViewMode("agency")}
                        className={`px-2 py-0.5 text-xs ${zoneViewMode === "agency" ? "bg-slate-900 text-white" : "bg-white text-gray-600"}`}>
                        Group by Agency
                      </button>
                      <button onClick={() => setZoneViewMode("flat")}
                        className={`px-2 py-0.5 text-xs ${zoneViewMode === "flat" ? "bg-slate-900 text-white" : "bg-white text-gray-600"}`}>
                        All Rows
                      </button>
                    </div>
                    {/* Agency Filter */}
                    <Select value={zoneAgencyFilter} onValueChange={setZoneAgencyFilter}>
                      <SelectTrigger className="h-7 text-xs w-36"><SelectValue placeholder="Filter Agency" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All" className="text-xs">All Agencies</SelectItem>
                        {agencies.map(a => <SelectItem key={a.id} value={a.name} className="text-xs">{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {/* MRU Search */}
                    <Input placeholder="Search MRU..." value={mruSearch} onChange={e => setMruSearch(e.target.value.toUpperCase())} className="h-7 text-xs w-28 font-mono" />
                  </div>
                </div>

                {(() => {
                  let visibleRows = zoneMapRows
                  if (zoneAgencyFilter !== "All") visibleRows = visibleRows.filter(r => r.agency === zoneAgencyFilter)
                  if (mruSearch) visibleRows = visibleRows.filter(r => r.zone.includes(mruSearch))

                  if (visibleRows.length === 0) return <p className="text-xs text-gray-400 italic text-center py-4">No zone mappings found.</p>

                  return (
                    <>
                      {zoneViewMode === "flat" && (
                        <div className="border rounded-md overflow-auto max-h-72">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs py-1">MRU / Zone</TableHead>
                                <TableHead className="text-xs py-1">Field Agency</TableHead>
                                <TableHead className="text-xs py-1">Address / Area</TableHead>
                                <TableHead className="text-xs py-1">Last Updated</TableHead>
                                <TableHead className="w-10 py-1"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {visibleRows.map((row) => (
                                <TableRow key={row.zone}>
                                  <TableCell className="font-mono text-xs font-bold py-1">{row.zone}</TableCell>
                                  <TableCell className="text-xs py-1 font-medium text-blue-700">{row.agency}</TableCell>
                                  <TableCell className="text-xs text-gray-500 py-1 max-w-[200px] truncate">{row.address || "—"}</TableCell>
                                  <TableCell className="text-xs text-gray-400 py-1">{row.updatedOn || "—"}</TableCell>
                                  <TableCell className="py-1">
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-700"
                                      onClick={() => saveZoneMap(zoneMapRows.filter(r => r.zone !== row.zone))}>
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {zoneViewMode === "agency" && visibleRows.length > 0 && (
                        <ZoneAgencyGrouped
                          zoneMapRows={visibleRows}
                          agencyFilter={zoneAgencyFilter}
                          onDelete={(zone, agency) => saveZoneMap(zoneMapRows.filter(r => !(r.zone === zone && r.agency === agency)))}
                        />
                      )}
                    </>
                  )
                })()}
              </CardContent>
            </Card>
          </div>
        )}
      {view === "roles" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div>
              <h2 className="text-xl font-bold">Manage Roles & Permissions</h2>
              <p className="text-sm text-gray-500 mt-1">Configure module-level actions for roles</p>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Role name..."
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                className="h-9 w-40 text-xs"
              />
              <Button size="sm" onClick={createNewRole} disabled={!newRoleName.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Add Role
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Sidebar roles list */}
            <Card className="md:col-span-1">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Available Roles</CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-1">
                {roles.map((r) => (
                  <div
                    key={r.role}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition text-xs font-semibold ${
                      selectedRole === r.role
                        ? "bg-blue-100 text-blue-800"
                        : "hover:bg-gray-100 text-gray-700"
                    }`}
                    onClick={() => setSelectedRole(r.role)}
                  >
                    <span className="capitalize">{r.role}</span>
                    {r.role !== "admin" && (
                      <button
                        className="text-gray-400 hover:text-red-500 p-0.5"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteRole(r.role)
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Permissions Checkbox Grid */}
            <Card className="md:col-span-3">
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm">
                    Permissions Grid for: <span className="capitalize font-bold text-blue-700">{selectedRole}</span>
                  </CardTitle>

                  {selectedRole !== "admin" && (
                    <Select onValueChange={(tplKey) => {
                      const tpl = ROLE_TEMPLATES[tplKey]
                      if (tpl) {
                        setRoles(prev => prev.map(x => x.role === selectedRole ? { ...x, ...tpl } : x))
                        setMessage({ type: "success", text: `Loaded '${tplKey}' template presets for ${selectedRole}. Click 'Save Grid' to apply.` })
                      }
                    }}>
                      <SelectTrigger className="h-7 w-44 text-xs bg-slate-50 border-slate-200 font-semibold">
                        <SelectValue placeholder="Load Role Template…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="executive" className="text-xs">Executive / Officer</SelectItem>
                        <SelectItem value="agency" className="text-xs">Field Agency (Site)</SelectItem>
                        <SelectItem value="store_keeper" className="text-xs">Store Keeper</SelectItem>
                        <SelectItem value="reader" className="text-xs">Inspector / Reader</SelectItem>
                        <SelectItem value="viewer" className="text-xs">Viewer (Read Only)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {selectedRole !== "admin" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      const r = roles.find((x) => x.role === selectedRole)
                      if (r) {
                        const { role, ...perms } = r
                        saveRolePermissions(selectedRole, perms)
                      }
                    }}
                  >
                    <Save className="h-4 w-4 mr-1" /> Save Grid
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {(() => {
                  const roleData = roles.find((x) => x.role === selectedRole)
                  if (!roleData) return <div className="p-4 text-center text-xs text-gray-500">Select a role</div>

                  const modulesList = [
                    { id: "disconnection", name: "Disconnection" },
                    { id: "reconnection", name: "Reconnection" },
                    { id: "deemed", name: "Deemed Visit" },
                    { id: "dtr", name: "DTR Verification" },
                    { id: "dtr_painting", name: "DTR Painting" },
                    { id: "meter", name: "Meter Management" },
                    { id: "meter_replacement", name: "Replacement List" },
                    { id: "nsc", name: "NSC Management" },
                    { id: "consumer_master", name: "Consumer Master" },
                    { id: "material", name: "Material Management" },
                    { id: "admin", name: "Admin Panel" },
                  ]

                  const togglePerm = (mod: string, act: string) => {
                    if (selectedRole === "admin") return

                    const cur = roleData[mod] || []
                    const next = cur.includes(act)
                      ? cur.filter((x: string) => x !== act)
                      : [...cur, act]

                    setRoles((prev) =>
                      prev.map((x) =>
                        x.role === selectedRole ? { ...x, [mod]: next } : x
                      )
                    )
                  }

                  return (
                    <div className="overflow-x-auto p-4 space-y-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-1/3">Standard Modules</TableHead>
                            <TableHead className="text-xs text-center">Read (View)</TableHead>
                            <TableHead className="text-xs text-center">Create (+ Add)</TableHead>
                            <TableHead className="text-xs text-center">Update Status</TableHead>
                            <TableHead className="text-xs text-center">Delete</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {modulesList.filter(m => !["nsc", "meter_replacement"].includes(m.id)).map((mod) => {
                            const curPerms = roleData[mod.id] || []
                            return (
                              <TableRow key={mod.id}>
                                <TableCell className="text-xs font-semibold text-gray-800">{mod.name}</TableCell>
                                {["read", "create", "update", "delete"].map((actId) => {
                                  const checked = curPerms.includes(actId)
                                  const disabled = selectedRole === "admin"
                                  return (
                                    <TableCell key={actId} className="text-center py-2">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={disabled}
                                        onChange={() => togglePerm(mod.id, actId)}
                                        className="h-4 w-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 disabled:opacity-50 cursor-pointer"
                                      />
                                    </TableCell>
                                  )
                                })}
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>

                      {/* Granular Sub-Actions Section for Workflow Modules */}
                      <div className="pt-2 border-t space-y-4">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Workflow Specific Sub-Action Permissions</h4>
                        
                        {/* NSC Granular */}
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                          <p className="text-xs font-bold text-blue-800">NSC Management Sub-Actions</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            {[
                              { id: "read", label: "Read (View Only)" },
                              { id: "create", label: "Create Application (+ Add NSC)" },
                              { id: "inspect", label: "Start Site Inspection" },
                              { id: "process", label: "Process & Sanction Application" },
                              { id: "project_create", label: "Create Project (NPC/...)" },
                              { id: "po_entry", label: "Enter PO Number" },
                              { id: "agency_complete", label: "Mark Project Work Complete" },
                              { id: "admin_approve", label: "Approve Project Completion" },
                            ].map(sub => {
                              const checked = (roleData["nsc"] || []).includes(sub.id)
                              return (
                                <label key={sub.id} className="flex items-center gap-2 p-1.5 bg-white rounded border border-slate-200 cursor-pointer hover:bg-blue-50/50">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={selectedRole === "admin"}
                                    onChange={() => togglePerm("nsc", sub.id)}
                                    className="h-3.5 w-3.5 rounded text-blue-600"
                                  />
                                  <span className="text-[11px] font-medium text-slate-700">{sub.label}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>

                        {/* Meter Replacement Granular */}
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
                          <p className="text-xs font-bold text-purple-800">Meter Replacement Sub-Actions</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                            {[
                              { id: "read", label: "Read (View Only)" },
                              { id: "create", label: "Propose Meter Replacement" },
                              { id: "issue", label: "Issue Meter from Stock" },
                              { id: "install", label: "Mark Installed (Site)" },
                              { id: "return", label: "Return Meter to Store" },
                              { id: "finalize", label: "Finalize Replacement" },
                            ].map(sub => {
                              const checked = (roleData["meter_replacement"] || []).includes(sub.id)
                              return (
                                <label key={sub.id} className="flex items-center gap-2 p-1.5 bg-white rounded border border-slate-200 cursor-pointer hover:bg-purple-50/50">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={selectedRole === "admin"}
                                    onChange={() => togglePerm("meter_replacement", sub.id)}
                                    className="h-3.5 w-3.5 rounded text-purple-600"
                                  />
                                  <span className="text-[11px] font-medium text-slate-700">{sub.label}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Change Password Dialog */}
      <Dialog open={!!changingPasswordUser} onOpenChange={(open) => { if (!open) setChangingPasswordUser(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password — {changingPasswordUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showChangePwdField ? "text" : "password"}
                  value={changePasswordValue}
                  onChange={(e) => setChangePasswordValue(e.target.value)}
                  placeholder="Enter new password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowChangePwdField(!showChangePwdField)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showChangePwdField ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <div className="relative">
                <Input
                  type={showChangePwdConfirm ? "text" : "password"}
                  value={changePasswordConfirm}
                  onChange={(e) => setChangePasswordConfirm(e.target.value)}
                  placeholder="Confirm new password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowChangePwdConfirm(!showChangePwdConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showChangePwdConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {changePasswordValue && changePasswordConfirm && changePasswordValue !== changePasswordConfirm && (
              <p className="text-xs text-red-500">Passwords do not match</p>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setChangingPasswordUser(null)}>Cancel</Button>
            <Button
              onClick={changePassword}
              disabled={!changePasswordValue || !changePasswordConfirm || changePasswordValue !== changePasswordConfirm}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ZoneAgencyGrouped({
  zoneMapRows,
  agencyFilter,
  onDelete,
}: {
  zoneMapRows: { zone: string; agency: string; address?: string; updatedOn?: string }[]
  agencyFilter: string
  onDelete: (zone: string, agency: string) => void
}) {
  const agencyNames = Array.from(new Set(zoneMapRows.map(r => r.agency))).sort()
  const filtered = agencyFilter === "All" ? agencyNames : agencyNames.filter(a => a === agencyFilter)
  return (
    <div className="space-y-4">
      {filtered.map(agencyName => {
        const rows = zoneMapRows.filter(r => r.agency === agencyName)
        return (
          <div key={agencyName}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-700">{agencyName}</span>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{rows.length} zones</span>
            </div>
            <div className="border rounded-md overflow-auto max-h-52">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-1">Zone / MRU</TableHead>
                    <TableHead className="text-xs py-1">Address / Area</TableHead>
                    <TableHead className="text-xs py-1">Updated</TableHead>
                    <TableHead className="w-10 py-1"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs py-1">{row.zone}</TableCell>
                      <TableCell className="text-xs text-gray-500 py-1 max-w-[200px] truncate">{row.address || "—"}</TableCell>
                      <TableCell className="text-xs text-gray-400 py-1">{row.updatedOn || "—"}</TableCell>
                      <TableCell className="py-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500"
                          onClick={() => onDelete(row.zone, agencyName)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DashboardCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <Card
      className="cursor-pointer hover:shadow-lg hover:scale-105 transition-transform duration-200"
      onClick={onClick}
    >
      <CardHeader className="flex flex-col items-center text-center">
        {icon}
        <CardTitle className="mt-4">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-center text-sm text-gray-600">
        {description}
      </CardContent>
    </Card>
  )
}