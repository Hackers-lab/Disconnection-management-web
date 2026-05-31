"use client"


import Papa from "papaparse";
import * as XLSX from "xlsx";
import { getFromCache, saveToCache } from "@/lib/indexed-db";
import { Table, TableHeader, TableRow, TableHead, TableCell, TableBody } from "@/components/ui/table";
import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Users, Building2, Upload, List, ArrowLeft, Trash2, Edit, Plus, X, Save, AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { userStorage } from "@/lib/user-storage";

interface AdminPanelProps {
  onClose: () => void
}

type ViewType = "menu" | "users" | "agencies" | "payments" | "dcList" | "zoneMap"

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
        if (parsedData.length === 0) {
            setMessage({ type: "error", text: "No data to upload" });
            return;
        }
        setIsUploading(true);
        setDcUploadResult(null);
        try {
            const response = await fetch("/api/consumers/bulk-upsert", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rows: parsedData, newCycle: newCycleUpload }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || "Failed to upload data");
            }
            setDcUploadResult(result.summary);
            setMessage({
                type: "success",
                text: `Upload complete: ${result.summary.inserted} new, ${result.summary.updated} updated, ${result.summary.autoAssigned} auto-assigned agency.`,
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
    const [dcUploadResult, setDcUploadResult] = useState<{ total: number; inserted: number; updated: number; protectedStatusSkipped: number; autoAssigned: number; archivedNotInUpload: number } | null>(null);
    const [newCycleUpload, setNewCycleUpload] = useState(false);
    const [backupDownloading, setBackupDownloading] = useState(false);

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

    const detectColumnType = (values: any[]) => {
    for (const [colName, regex] of Object.entries(columnRegexMap)) {
        const matches = values.filter(v => regex.test(String(v).trim())).length;
        
        // Special case for mobile numbers (30% threshold)
        if (colName === "Mobile Number") {
        if (matches / values.length > 0.3) { // Lower threshold
            return colName;
        }
        } 
        // Standard 80% threshold for other columns
        else if (matches / values.length > 0.8) {
        return colName;
        }
    }
    return null;
    };


    
    const handleFileUpload = (file: File) => {
        setFileName(file.name);
        Papa.parse(file, {
            complete: (results: Papa.ParseResult<any[]>) => {
            const rows = results.data as any[][];
            if (!rows || rows.length === 0) return;

            const csvHeaders = rows[0];
            const dataRows = rows.slice(1).filter(r => r.length > 1);

            // Create mapping of our expected columns to CSV column indices
            const columnMap: Record<string, number | null> = {};
            
            expectedColumns.forEach(expectedCol => {
                // Find which CSV column matches this expected column
                for (let i = 0; i < csvHeaders.length; i++) {
                const colValues = dataRows.map(r => r[i] || "").slice(0, 20);
                if (columnRegexMap[expectedCol].test(String(colValues[0] || ""))) {
                    columnMap[expectedCol] = i;
                    break;
                }
                }
            });

            // Transform data to only include expected columns in correct order
            const mappedData = dataRows.map(row => {
                return expectedColumns.map(col => {
                const colIndex = columnMap[col];
                return colIndex !== null ? row[colIndex] : "";
                });
            });

            // Convert columnMap values to string for setColumnMapping
            const stringColumnMap: Record<string, string> = {};
            Object.entries(columnMap).forEach(([key, value]) => {
              stringColumnMap[key] = value !== null ? value.toString() : "";
            });
            setColumnMapping(stringColumnMap);
            setParsedData(mappedData);
            },
            header: false,
            skipEmptyLines: true
        });
        };

  const [view, setView] = useState<ViewType>("menu")
  const [users, setUsers] = useState<User[]>([])
  const [agencies, setAgencies] = useState<Agency[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAddAgency, setShowAddAgency] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null)

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
    receivedRows: number; matched: number; notFound: number;
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
  const normalizeDate = (raw: any): string => {
    if (raw === null || raw === undefined || raw === "") return ""
    // Excel serial number
    if (typeof raw === "number") {
      const d = XLSX.SSF.parse_date_code(raw)
      if (d) {
        const dd = String(d.d).padStart(2, "0")
        const mm = String(d.m).padStart(2, "0")
        return `${dd}-${mm}-${d.y}`
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
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const wb = XLSX.read(data, { type: "array", cellDates: false })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" })
          if (!rows || rows.length < 2) {
            setPaymentParseError("Excel must have at least a header row and one data row.")
            return
          }
          processPaymentRows(rows as any[][])
        } catch (err: any) {
          setPaymentParseError(`Excel parse failed: ${err?.message || err}`)
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      Papa.parse<any[]>(file, {
        header: false,
        skipEmptyLines: true,
        complete: (res: any) => {
          const rows = (res.data as any[][]) || []
          if (rows.length < 2) {
            setPaymentParseError("CSV must have at least a header row and one data row.")
            return
          }
          processPaymentRows(rows)
        },
        error: (err: any) => setPaymentParseError(`CSV parse failed: ${err?.message || err}`),
      })
    }
  }

  const processPaymentRows = (rows: any[][]) => {
    const headers = (rows[0] || []).map((h) => String(h ?? ""))
    const { idIdx, amtIdx, dateIdx } = detectPaymentColumns(headers)
    if (idIdx === -1 || amtIdx === -1) {
      setPaymentParseError(
        `Could not auto-detect required columns. Found headers: [${headers.join(", ")}]. Need at least a Consumer ID and Amount column.`
      )
      return
    }
    const parsed: PaymentParsed[] = []
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] || []
      const id = String(r[idIdx] ?? "").trim()
      if (!id) continue
      const amtRaw = String(r[amtIdx] ?? "0").replace(/[,\s₹$]/g, "").replace(/[^\d.-]/g, "")
      const amt = parseFloat(amtRaw)
      if (!isFinite(amt) || amt <= 0) continue
      const dateRaw = dateIdx !== -1 ? r[dateIdx] : ""
      parsed.push({ consumerId: id, paidAmount: amt, paidDate: normalizeDate(dateRaw) })
    }
    setPaymentRows(parsed)
  }

  const submitPayments = async () => {
    if (paymentRows.length === 0) return
    setPaymentSubmitting(true)
    setPaymentResult(null)
    try {
      const resp = await fetch("/api/payments/bulk-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: paymentSource, payments: paymentRows }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.success) {
        throw new Error(data?.error || "Bulk apply failed")
      }
      setPaymentResult({ ...data.summary, notFoundIds: data.notFoundIds || [] })
    } catch (err: any) {
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

  const parseZoneCsv = (file: File) => {
    setZoneUploadFileName(file.name)
    Papa.parse<any[]>(file, {
      header: false, skipEmptyLines: true,
      complete: (res: any) => {
        const rows = res.data as any[][]
        if (!rows || rows.length < 2) return
        // Expect: Zone (col 0), Agency (col 1)
        const parsed = rows.slice(1)
          .map(r => ({ zone: String(r[0] || "").trim().toUpperCase(), agency: String(r[1] || "").trim().toUpperCase() }))
          .filter(r => r.zone && r.agency)
        setZoneUploadRows(parsed)
      },
      error: () => setMessage({ type: "error", text: "Failed to parse zone map CSV" }),
    })
  }

  useEffect(() => { if (view === "zoneMap") loadZoneMap() }, [view])

  // Load agencies when component mounts and when view changes to users
  useEffect(() => {
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
        setNewUser({ username: "", password: "", role: "agency", agencies: [] })
        setShowAddUser(false)
        const usersResponse = await fetch("/api/admin/users")
        setUsers(await usersResponse.json())
        setMessage({ type: "success", text: "User added successfully" })
      } else {
        const error = await response.json()
        throw new Error(error.error || "Failed to add user")
      }
    } catch (error) {
      console.error("Error adding user:", error)
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to add user" })
    }
  }

  // Update user
  const updateUser = async (user: User) => {
    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      })

      if (response.ok) {
        setEditingUser(null)
        const usersResponse = await fetch("/api/admin/users")
        setUsers(await usersResponse.json())
        setMessage({ type: "success", text: "User updated successfully" })
      } else {
        throw new Error("Failed to update user")
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
      const response = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" })
      
      if (response.ok) {
        const usersResponse = await fetch("/api/admin/users")
        setUsers(await usersResponse.json())
        setMessage({ type: "success", text: "User deleted successfully" })
      } else {
        throw new Error("Failed to delete user")
      }
    } catch (error) {
      console.error("Error deleting user:", error)
      setMessage({ type: "error", text: "Failed to delete user" })
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
        setNewAgency({ name: "", description: "", isActive: true })
        setShowAddAgency(false)
        const agenciesResponse = await fetch("/api/admin/agencies")
        setAgencies(await agenciesResponse.json())
        setMessage({ type: "success", text: "Agency added successfully" })
      } else {
        const error = await response.json()
        throw new Error(error.error || "Failed to add agency")
      }
    } catch (error) {
      console.error("Error adding agency:", error)
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Failed to add agency" })
    }
  }

  // Update agency
  const updateAgency = async (agency: Agency) => {
    try {
      const response = await fetch("/api/admin/agencies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agency),
      })

      if (response.ok) {
        setEditingAgency(null)
        const agenciesResponse = await fetch("/api/admin/agencies")
        setAgencies(await agenciesResponse.json())
        setMessage({ type: "success", text: "Agency updated successfully" })
      } else {
        throw new Error("Failed to update agency")
      }
    } catch (error) {
      console.error("Error updating agency:", error)
      setMessage({ type: "error", text: "Failed to update agency" })
    }
  }

  // Delete agency
  const deleteAgency = async (id: string) => {
    if (!confirm("Are you sure you want to delete this agency? This will affect users assigned to this agency.")) return
    
    try {
      const response = await fetch(`/api/admin/agencies/${id}`, { method: "DELETE" })
      
      if (response.ok) {
        const agenciesResponse = await fetch("/api/admin/agencies")
        setAgencies(await agenciesResponse.json())
        const usersResponse = await fetch("/api/admin/users")
        setUsers(await usersResponse.json())
        setMessage({ type: "success", text: "Agency deleted successfully" })
      } else {
        throw new Error("Failed to delete agency")
      }
    } catch (error) {
      console.error("Error deleting agency:", error)
      setMessage({ type: "error", text: "Failed to delete agency" })
    }
  }

  const toggleAgency = (agencies: string[], agency: string) => {
    if (agencies.includes(agency)) {
      return agencies.filter((a) => a !== agency)
    } else {
      return [...agencies, agency]
    }
  }

  const activeAgencies = agencies.filter((a) => a.isActive)

  if (loading) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Back Button */}
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </div>

      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"} className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {view === "menu" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <DashboardCard
            icon={<Users className="h-12 w-12 text-blue-500" />}
            title="Manage Users"
            description="Add, edit, and remove users"
            onClick={() => setView("users")}
          />
          <DashboardCard
            icon={<Building2 className="h-12 w-12 text-green-500" />}
            title="Manage Agencies"
            description="Add, edit, and remove agencies"
            onClick={() => setView("agencies")}
          />
          <DashboardCard
            icon={<Upload className="h-12 w-12 text-purple-500" />}
            title="Upload Payment Data"
            description="Update payment information"
            onClick={() => setView("payments")} 
          />
          <DashboardCard
            icon={<List className="h-12 w-12 text-orange-500" />}
            title="Upload DC List"
            description="Upload & sync disconnection list"
            onClick={() => setView("dcList")}
          />
          <DashboardCard
            icon={<Building2 className="h-12 w-12 text-teal-500" />}
            title="Agency Zone Map"
            description="Map zones to agencies for auto-assign"
            onClick={() => setView("zoneMap")}
          />
        </div>
      )}

  {view === "users" && (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Manage Users</h2>
        <Button onClick={() => setShowAddUser(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* Add User Form */}
      {showAddUser && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Add New User
              <Button variant="ghost" size="sm" onClick={() => setShowAddUser(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="Enter username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Enter password"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={newUser.role}
                onValueChange={(value) => setNewUser({ ...newUser, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="agency">Agency</SelectItem>
                  <SelectItem value="executive">Executive</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(newUser.role === "agency" || newUser.role === "executive") && (
              <div className="space-y-2">
                <Label>Assigned Agencies</Label>
                {activeAgencies.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {activeAgencies.map((agency) => (
                      <div key={agency.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`new-${agency.id}`}
                          checked={newUser.agencies.includes(agency.name)}
                          onChange={() =>
                            setNewUser({
                              ...newUser,
                              agencies: newUser.agencies.includes(agency.name)
                                ? newUser.agencies.filter(a => a !== agency.name)
                                : [...newUser.agencies, agency.name],
                            })
                          }
                          className="rounded"
                        />
                        <label htmlFor={`new-${agency.id}`} className="text-sm">
                          {agency.name}
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No active agencies available</p>
                )}
              </div>
            )}

            <div className="flex space-x-2">
              <Button onClick={addUser} disabled={!newUser.username || !newUser.password}>
                <Save className="h-4 w-4 mr-2" />
                Add User
              </Button>
              <Button variant="outline" onClick={() => setShowAddUser(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

          {/* Users List */}
          <div className="space-y-2">
            {users.map((user) => (
              <Card key={user.id} className="p-2">
                {editingUser?.id === user.id ? (
                  <div className="space-y-4 p-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Username</Label>
                        <Input
                          value={editingUser.username}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, username: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Password</Label>
                        <Input
                          type="password"
                          value={editingUser.password}
                          onChange={(e) =>
                            setEditingUser({ ...editingUser, password: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select
                          value={editingUser.role}
                          onValueChange={(value) =>
                            setEditingUser({ ...editingUser, role: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="agency">Agency</SelectItem>
                            <SelectItem value="executive">Executive</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {(editingUser.role === "agency" || editingUser.role === "executive") && (
                      <div className="space-y-2">
                        <Label>Agencies</Label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {activeAgencies.map((agency) => (
                            <div key={agency.id} className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`edit-${user.id}-${agency.id}`}
                                checked={editingUser.agencies.includes(agency.name)}
                                onChange={() =>
                                  setEditingUser({
                                    ...editingUser,
                                    agencies: toggleAgency(editingUser.agencies, agency.name),
                                  })
                                }
                                className="rounded"
                              />
                              <label htmlFor={`edit-${user.id}-${agency.id}`} className="text-sm">
                                {agency.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex space-x-2">
                      <Button onClick={() => updateUser(editingUser)}>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditingUser(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-normal">{user.username}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                          {user.role}
                        </Badge>
                        {user.agencies?.length > 0 && (
                          <div className="flex gap-1">
                            {user.agencies.map((a) => (
                              <Badge key={a} variant="outline">{a}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingUser({ ...user })}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {user.username !== "admin" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteUser(user.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {view === "agencies" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Manage Agencies</h2>
            <Button onClick={() => setShowAddAgency(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Agency
            </Button>
          </div>

          {/* Add Agency Form */}
          {showAddAgency && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Add New Agency
                  <Button variant="ghost" size="sm" onClick={() => setShowAddAgency(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="agencyName">Agency Name</Label>
                    <Input
                      id="agencyName"
                      value={newAgency.name}
                      onChange={(e) => setNewAgency({ ...newAgency, name: e.target.value })}
                      placeholder="Enter agency name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agencyDescription">Description</Label>
                    <Input
                      id="agencyDescription"
                      value={newAgency.description}
                      onChange={(e) => setNewAgency({ ...newAgency, description: e.target.value })}
                      placeholder="Enter description"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="agencyActive"
                    checked={newAgency.isActive}
                    onChange={(e) => setNewAgency({ ...newAgency, isActive: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="agencyActive" className="text-sm">
                    Active
                  </label>
                </div>

                <div className="flex space-x-2">
                  <Button onClick={addAgency} disabled={!newAgency.name}>
                    <Save className="h-4 w-4 mr-2" />
                    Add Agency
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddAgency(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Agencies List */}
          <div className="space-y-2">
            {agencies.map((agency) => (
              <Card key={agency.id} className="p-2">
                {editingAgency?.id === agency.id ? (
                  <div className="space-y-4 p-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Agency Name</Label>
                        <Input
                          value={editingAgency.name}
                          onChange={(e) =>
                            setEditingAgency({ ...editingAgency, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Input
                          value={editingAgency.description || ""}
                          onChange={(e) =>
                            setEditingAgency({ ...editingAgency, description: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`active-${agency.id}`}
                        checked={editingAgency.isActive}
                        onChange={(e) =>
                          setEditingAgency({ ...editingAgency, isActive: e.target.checked })
                        }
                        className="rounded"
                      />
                      <label htmlFor={`active-${agency.id}`} className="text-sm">
                        Active
                      </label>
                    </div>

                    <div className="flex space-x-2">
                      <Button onClick={() => updateAgency(editingAgency)}>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditingAgency(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold">{agency.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={agency.isActive ? "default" : "secondary"}>
                          {agency.isActive ? "Active" : "Inactive"}
                        </Badge>
                        {agency.description && (
                          <span className="text-sm text-gray-600">{agency.description}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingAgency({ ...agency })}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteAgency(agency.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {view === "payments" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">Upload Payment Data</h2>
            <p className="text-sm text-gray-600 mt-1">
              Upload a Cash Desk or Portal payment file (Excel or CSV). Matched consumers
              are marked Paid with full/partial detection and outstanding balance.
              <details className="mt-2">
                <summary className="cursor-pointer text-blue-600 text-xs underline">Show file format guide</summary>
                <div className="mt-2 bg-blue-50 rounded p-3 text-xs space-y-1">
                  <p className="font-semibold text-blue-800">Required columns (auto-detected by name):</p>
                  <pre className="bg-white rounded p-2 overflow-auto">{`Consumer ID  |  Paid Amount  |  Paid Date (optional)
-----------     -----------     ----------
100000001       5000            15-05-2025
100000002       12000           15-05-2025`}</pre>
                  <ul className="list-disc pl-4 space-y-0.5 text-gray-600">
                    <li>Column names are matched loosely: "Consumer ID", "CA", "Account" all work for ID.</li>
                    <li>"Amount", "Paid Amount", "Credit" all work for amount.</li>
                    <li>"Date", "Paid Date", "Payment Date" work for date (leave blank to use today).</li>
                    <li>Rows with zero or non-numeric amount are skipped.</li>
                    <li>Unmatched consumer IDs are listed in the result — they are not created.</li>
                  </ul>
                </div>
              </details>
            </p>
          </div>

          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Source</Label>
                  <Select
                    value={paymentSource}
                    onValueChange={(v) => setPaymentSource(v as "Cash Desk" | "Portal")}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash Desk">Cash Desk</SelectItem>
                      <SelectItem value="Portal">Portal</SelectItem>
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
                      <div><strong>{paymentResult.matched}</strong> of <strong>{paymentResult.receivedRows}</strong> consumers updated.</div>
                      <div className="text-xs">
                        Full: {paymentResult.fullPayments} &middot; Partial: {paymentResult.partialPayments} &middot; Not found: {paymentResult.notFound}
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
              <Button size="sm" variant="outline" onClick={() => {
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
                  <pre className="bg-white rounded p-2 overflow-auto text-[10px]">{`off_code | MRU      | Consumer Id | Name         | Address       | Base Class | Device    | O/S Duedate Range          | D2 Net O/S | Mobile Number
6612107  | AB01MR   | 100000001   | CONSUMER NAME| 123 ROAD...   | L-1 PHASE  | METER001  | 01-01-2024 - 31-03-2024    | 5000       | 9876543210`}</pre>
                  <ul className="list-disc pl-4 space-y-0.5 text-gray-600">
                    <li>Columns are detected by regex pattern matching, not exact header name.</li>
                    <li>Consumer ID, MRU, and D2 Net O/S are mandatory — rows without them are skipped.</li>
                    <li>Agency is auto-assigned from Zone Map based on MRU. Run Zone Map setup first.</li>
                    <li><strong>Protected statuses</strong> (Disconnected, Paid, Visited, etc.): only OSD and base info are updated — status, date, notes, image are never overwritten.</li>
                    <li>Consumers in the sheet but not in this file are marked as removed and logged to DC_History.</li>
                  </ul>
                </div>
              </details>
            </p>
          </div>

          {/* New cycle toggle */}
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-4 pb-4 space-y-2">
              <div className="flex items-start gap-3">
                <input type="checkbox" id="newCycle" checked={newCycleUpload}
                  onChange={(e) => setNewCycleUpload(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded" />
                <div>
                  <label htmlFor="newCycle" className="font-semibold text-sm text-amber-900 cursor-pointer">
                    New Disconnection Cycle
                  </label>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Check this when uploading a <strong>fresh billing cycle</strong> (e.g. a new quarter's DC list).
                    With this ON, consumers with OSD-changed will have their status reset to <code>connected</code>
                    (treated as a new case). Consumers with <code>bill dispute</code> or <code>office team</code>
                    status are always preserved regardless. Without this, all existing statuses are fully protected.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-2">
                <Label>DC List File (CSV or Excel)</Label>
                <Input
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv"
                  onChange={(e) => {
                    if (!e.target.files?.[0]) return
                    const file = e.target.files[0]
                    setDcUploadResult(null)
                    if (/\.(xlsx|xls)$/i.test(file.name)) {
                      const reader = new FileReader()
                      reader.onload = (ev) => {
                        const wb = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type: "array" })
                        const ws = wb.Sheets[wb.SheetNames[0]]
                        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" }) as any[][]
                        if (rows.length >= 2) {
                          handleFileUpload(new File([file], file.name.replace(/xlsx?$/i, "csv")))
                          // Re-run with parsed rows from XLSX
                          const csvHeaders = (rows[0] || []).map(String)
                          const dataRows = rows.slice(1).filter((r: any[]) => r.length > 1)
                          const columnMap: Record<string, number | null> = {}
                          expectedColumns.forEach(expectedCol => {
                            for (let i = 0; i < csvHeaders.length; i++) {
                              const colValues = dataRows.map((r: any[]) => r[i] || "").slice(0, 20)
                              if (columnRegexMap[expectedCol].test(String(colValues[0] || ""))) {
                                columnMap[expectedCol] = i; break
                              }
                            }
                          })
                          const mappedData = dataRows.map((row: any[]) =>
                            expectedColumns.map(col => {
                              const ci = columnMap[col]
                              return ci !== null && ci !== undefined ? String(row[ci] ?? "") : ""
                            })
                          )
                          const stringMap: Record<string, string> = {}
                          Object.entries(columnMap).forEach(([k, v]) => { stringMap[k] = v !== null ? String(v) : "" })
                          setColumnMapping(stringMap)
                          setParsedData(mappedData)
                          setFileName(file.name)
                        }
                      }
                      reader.readAsArrayBuffer(file)
                    } else {
                      handleFileUpload(file)
                    }
                  }}
                />
                {fileName && <p className="text-xs text-gray-500">Selected: <span className="font-mono">{fileName}</span></p>}
              </div>

              {Object.keys(columnMapping).length > 0 && (
                <div className="rounded-md bg-gray-50 p-3 text-xs space-y-1">
                  <p className="font-semibold text-gray-700">Detected columns:</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(columnMapping).map(([col, idx]) => (
                      <span key={col} className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${idx ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
                        {col} {idx ? "✓" : "✗"}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {parsedData.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">{parsedData.length} rows parsed — preview (first 5)</h4>
                    <Button size="sm" variant="ghost" onClick={() => { setParsedData([]); setFileName(""); setColumnMapping({}); setDcUploadResult(null); }}>
                      <X className="h-4 w-4 mr-1" /> Clear
                    </Button>
                  </div>
                  <div className="border rounded-md overflow-auto max-h-52">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {expectedColumns.map(c => <TableHead key={c} className="text-[11px] px-2 py-1 whitespace-nowrap">{c}</TableHead>)}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedData.slice(0, 5).map((row: any, i: number) => (
                          <TableRow key={i}>
                            {row.map((cell: any, j: number) => (
                              <TableCell key={j} className="text-[11px] px-2 py-1 max-w-[100px] truncate">{cell}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <Button
                    className="w-full sm:w-auto"
                    onClick={uploadToGoogleSheet}
                    disabled={isUploading || parsedData.length === 0}
                  >
                    {isUploading
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
                      : <><Upload className="h-4 w-4 mr-2" /> Sync {parsedData.length} rows to Sheet</>
                    }
                  </Button>
                </>
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
                        {dcUploadResult.archivedNotInUpload > 0 && (
                          <span className="text-gray-600">📦 {dcUploadResult.archivedNotInUpload} removed from new list → archived to DC_History tab</span>
                        )}
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
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
            <Button size="sm" variant="outline" onClick={() => {
              const wb = XLSX.utils.book_new()
              XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
                ["Zone (MRU)", "Agency", "Address"],
                ["AB01MR", "AGENCY NAME", "Area / locality description"],
              ]), "ZoneMap")
              XLSX.writeFile(wb, "ZoneMap_Template.xlsx")
            }}>
              Download Template
            </Button>
          </div>

          {/* Guide */}
          <button className="text-xs text-blue-600 underline" onClick={() => setShowZoneGuide(g => !g)}>
            {showZoneGuide ? "Hide" : "Show"} format guide
          </button>
          {showZoneGuide && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-3 text-xs space-y-2">
                <p className="font-semibold text-blue-800">CSV / Excel format:</p>
                <pre className="bg-white rounded p-2 text-[11px] overflow-auto">{`Zone (MRU),Agency,Address\nAB01MR,AGENCY NAME 1,South Zone near main road\nAB02MR,AGENCY NAME 2,North industrial area`}</pre>
                <ul className="list-disc pl-4 text-gray-600 space-y-0.5">
                  <li><strong>Zone</strong>: MRU code from DC list (e.g. <code>AB01MR</code>). Zone key = first 4 chars.</li>
                  <li><strong>Agency</strong>: Exact name as in Manage Agencies (case-insensitive match on upload).</li>
                  <li><strong>Address</strong>: Optional. Helps decide future agency allocation.</li>
                  <li>Header row required. Changes are logged to <code>ZoneMapHistory</code> sheet.</li>
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Add row + CSV upload tabs */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              {zoneMapLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Button size="sm" variant={zoneUploadMode === "manual" ? "default" : "outline"} onClick={() => setZoneUploadMode("manual")}>Add / Edit</Button>
                    <Button size="sm" variant={zoneUploadMode === "csv" ? "default" : "outline"} onClick={() => setZoneUploadMode("csv")}>Bulk Upload</Button>
                  </div>

                  {/* Manual add row */}
                  {zoneUploadMode === "manual" && (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">MRU</Label>
                        {availableMrus.length > 0 ? (
                          <Select value={newZone} onValueChange={setNewZone}>
                            <SelectTrigger className="h-8"><SelectValue placeholder="Select MRU" /></SelectTrigger>
                            <SelectContent>
                              {availableMrus.map(mru => (
                                <SelectItem key={mru} value={mru}>{mru}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input placeholder="AB01MR" value={newZone}
                            onChange={(e) => setNewZone(e.target.value.toUpperCase())} className="h-8 font-mono" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Agency</Label>
                        <Select value={newZoneAgency} onValueChange={setNewZoneAgency}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Select agency" /></SelectTrigger>
                          <SelectContent>
                            {agencies.filter(a => a.isActive).map(a => (
                              <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Area / Address (optional)</Label>
                        <Input placeholder="e.g. South zone, near market"
                          value={newZoneAddress}
                          onChange={(e) => setNewZoneAddress(e.target.value)}
                          className="h-8 text-xs" />
                      </div>
                      <Button size="sm" className="h-8 self-end"
                        disabled={!newZone || !newZoneAgency || zoneMapSaving}
                        onClick={() => {
                          const zone = newZone.substring(0, 4).toUpperCase()
                          const updated = [
                            ...zoneMapRows.filter(r => r.zone !== zone),
                            { zone, agency: newZoneAgency.toUpperCase(), address: newZoneAddress },
                          ].sort((a, b) => a.zone.localeCompare(b.zone))
                          saveZoneMap(updated)
                          setNewZone(""); setNewZoneAgency(""); setNewZoneAddress("")
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Save
                      </Button>
                    </div>
                  )}

                  {/* Bulk CSV/Excel upload */}
                  {zoneUploadMode === "csv" && (
                    <div className="space-y-2">
                      <Input type="file" accept=".csv,.xlsx,.xls,text/csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          setZoneUploadFileName(file.name)
                          if (/\.(xlsx|xls)$/i.test(file.name)) {
                            const reader = new FileReader()
                            reader.onload = (ev) => {
                              const wb = XLSX.read(new Uint8Array(ev.target?.result as ArrayBuffer), { type: "array" })
                              const ws = wb.Sheets[wb.SheetNames[0]]
                              const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: "" }) as any[][]
                              const parsed = rows.slice(1).map(r => ({
                                zone: String(r[0] || "").trim().toUpperCase().substring(0, 4),
                                agency: String(r[1] || "").trim().toUpperCase(),
                                address: String(r[2] || "").trim(),
                              })).filter(r => r.zone && r.agency)
                              setZoneUploadRows(parsed)
                            }
                            reader.readAsArrayBuffer(file)
                          } else {
                            parseZoneCsv(file)
                          }
                        }}
                      />
                      {zoneUploadFileName && <p className="text-xs text-gray-500">{zoneUploadFileName}</p>}
                      {zoneUploadRows.length > 0 && (
                        <Button size="sm" disabled={zoneMapSaving}
                          onClick={() => {
                            const incoming = new Map(zoneUploadRows.map(r => [r.zone, r]))
                            const merged = [
                              ...zoneMapRows.filter(r => !incoming.has(r.zone)),
                              ...zoneUploadRows,
                            ].sort((a, b) => a.zone.localeCompare(b.zone))
                            saveZoneMap(merged)
                            setZoneUploadRows([]); setZoneUploadFileName("")
                          }}
                        >
                          <Upload className="h-4 w-4 mr-1" /> Apply {zoneUploadRows.length} mappings
                        </Button>
                      )}
                    </div>
                  )}
                  {zoneMapSaving && <p className="text-xs text-blue-600">Saving…</p>}
                </>
              )}
            </CardContent>
          </Card>

          {/* Zone view table — always shown, even when empty */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              {/* MRU Search */}
              <div className="relative">
                <Input
                  placeholder="Search MRU / zone…"
                  value={mruSearch}
                  onChange={(e) => setMruSearch(e.target.value)}
                  className="h-8 pl-8 text-sm"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
                {mruSearch && (
                  <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
                    onClick={() => setMruSearch("")}>✕</button>
                )}
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex gap-2">
                  <Button size="sm" variant={zoneViewMode === "agency" ? "default" : "outline"} onClick={() => setZoneViewMode("agency")}>By Agency</Button>
                  <Button size="sm" variant={zoneViewMode === "flat" ? "default" : "outline"} onClick={() => setZoneViewMode("flat")}>All Zones</Button>
                </div>
                {zoneViewMode === "agency" && zoneMapRows.length > 0 && (
                  <Select value={zoneAgencyFilter} onValueChange={setZoneAgencyFilter}>
                    <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All Agencies</SelectItem>
                      {Array.from(new Set(zoneMapRows.map(r => r.agency))).sort().map(a => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {zoneMapRows.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">No zone mappings yet. Add one above.</p>
              )}

              {(() => {
                // Apply MRU search filter once, shared by both views
                const searchLc = mruSearch.trim().toLowerCase()
                const visibleRows = searchLc
                  ? zoneMapRows.filter(r =>
                      r.zone.toLowerCase().includes(searchLc) ||
                      r.agency.toLowerCase().includes(searchLc) ||
                      (r.address || "").toLowerCase().includes(searchLc)
                    )
                  : zoneMapRows

                if (visibleRows.length === 0 && mruSearch) {
                  return <p className="text-xs text-gray-400 text-center py-2">No zones match &quot;{mruSearch}&quot;</p>
                }

                return (
                  <>
                    {/* Flat table */}
                    {zoneViewMode === "flat" && visibleRows.length > 0 && (
                      <div className="border rounded-md overflow-auto max-h-80">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Zone / MRU</TableHead>
                              <TableHead className="text-xs">Agency</TableHead>
                              <TableHead className="text-xs">Address / Area</TableHead>
                              <TableHead className="text-xs">Updated</TableHead>
                              <TableHead className="w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {visibleRows.map((row, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-mono text-xs">{row.zone}</TableCell>
                                <TableCell className="text-xs">{row.agency}</TableCell>
                                <TableCell className="text-xs text-gray-500 max-w-[160px] truncate">{row.address || "—"}</TableCell>
                                <TableCell className="text-xs text-gray-400">{row.updatedOn || "—"}</TableCell>
                                <TableCell>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500"
                                    onClick={() => saveZoneMap(zoneMapRows.filter(r => r.zone !== row.zone || r.agency !== row.agency))}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* Agency-wise grouped */}
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