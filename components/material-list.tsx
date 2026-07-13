"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import {
  Package, Search, Plus, ArrowDownToLine, ArrowUpFromLine,
  ListChecks, Loader2, RefreshCw, ChevronLeft, Trash2,
  FileDown, FileSpreadsheet, Eye, Settings, AlertTriangle, ArrowLeft,
  Pencil, Check, MoreVertical, X, ImageIcon
} from "lucide-react"
import type { Material, MaterialStock, MaterialReceive, MaterialIssue } from "@/lib/material-types"
import { MATERIAL_CATEGORIES } from "@/lib/material-types"
import { MaterialReceiveForm } from "./material-receive-form"
import { MaterialIssueForm } from "./material-issue-form"
import { MaterialHistoryDialog } from "./material-history-dialog"
import { getFromCache, saveToCache } from "@/lib/indexed-db"

const CACHE_KEY = "material_data_cache"

type MainView = "menu" | "stock" | "settings" | "receive" | "issue"
type SettingsSubTab = "catalogue" | "transactions"

interface Props {
  userRole: string
  userAgencies: string[]
  username: string
}

export function MaterialList({ userRole, userAgencies, username }: Props) {
  const [view, setView] = useState<MainView>("menu")
  const [settingsTab, setSettingsTab] = useState<SettingsSubTab>("catalogue")

  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")

  // Data
  const [stock, setStock] = useState<MaterialStock[]>([])
  const [catalogue, setCatalogue] = useState<Material[]>([])
  const [receives, setReceives] = useState<MaterialReceive[]>([])
  const [issues, setIssues] = useState<MaterialIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState<"idle" | "loading" | "updated">("loading")
  const [error, setError] = useState<string | null>(null)

  // Dialogs
  const [historyMaterial, setHistoryMaterial] = useState<MaterialStock | null>(null)

  // Add material states
  const [newMatDesc, setNewMatDesc] = useState("")
  const [newMatNo, setNewMatNo] = useState("")
  const [newMatUnit, setNewMatUnit] = useState("nos")
  const [newMatCategory, setNewMatCategory] = useState("Other")
  const [newMatThreshold, setNewMatThreshold] = useState("0")
  const [addingMaterial, setAddingMaterial] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  
  const [newMatPhoto, setNewMatPhoto] = useState<File | null>(null)
  const [newMatPhotoPreview, setNewMatPhotoPreview] = useState<string | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const startEditMaterial = (m: Material) => {
    setEditingMaterial(m)
    setNewMatDesc(m.description)
    setNewMatNo(m.materialNo || "")
    setNewMatUnit(m.unit)
    setNewMatCategory(m.category)
    setNewMatThreshold(String(m.threshold || 0))
    setNewMatPhoto(null)
    setNewMatPhotoPreview(m.photoUrl || null)
  }

  const cancelEditMaterial = () => {
    setEditingMaterial(null)
    setNewMatDesc("")
    setNewMatNo("")
    setNewMatUnit("nos")
    setNewMatCategory("Other")
    setNewMatThreshold("0")
    setNewMatPhoto(null)
    setNewMatPhotoPreview(null)
  }

  const canWrite = userRole === "admin" || userRole === "executive"

  // ── Caching & Fetching ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setSyncState("loading")
    try {
      setError(null)
      // 1. Try local cache hit
      const cached = await getFromCache<any>(CACHE_KEY)
      if (cached && !silent) {
        setStock(cached.stock || [])
        setCatalogue(cached.catalogue || [])
        setReceives(cached.receives || [])
        setIssues(cached.issues || [])
        setLoading(false)
      }

      // 2. Fetch fresh
      const [stockRes, receiveRes, issueRes] = await Promise.all([
        fetch("/api/material"),
        fetch("/api/material/receive"),
        fetch("/api/material/issue"),
      ])

      let freshStock: MaterialStock[] = []
      let freshCatalogue: Material[] = []
      let freshReceives: MaterialReceive[] = []
      let freshIssues: MaterialIssue[] = []

      if (stockRes.ok) {
        const data = await stockRes.json()
        freshStock = data.stock || []
        freshCatalogue = data.catalogue || []
        setStock(freshStock)
        setCatalogue(freshCatalogue)
      }
      if (receiveRes.ok) {
        freshReceives = await receiveRes.json()
        setReceives(freshReceives)
      }
      if (issueRes.ok) {
        freshIssues = await issueRes.json()
        setIssues(freshIssues)
      }

      // 3. Update cache
      await saveToCache(CACHE_KEY, {
        stock: freshStock,
        catalogue: freshCatalogue,
        receives: freshReceives,
        issues: freshIssues,
      })

      setSyncState("updated")
      setTimeout(() => setSyncState("idle"), 2500)
    } catch (e: any) {
      setError(e.message || "Failed to load fresh material data")
      setSyncState("idle")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Filters & Search ───────────────────────────────────────────────────────────
  const q = search.toLowerCase()

  const filteredStock = useMemo(() =>
    stock.filter(s => {
      if (categoryFilter !== "all" && s.category !== categoryFilter) return false
      if (!q) return true
      return s.description.toLowerCase().includes(q) ||
             s.materialNo.toLowerCase().includes(q) ||
             s.category.toLowerCase().includes(q)
    })
  , [stock, q, categoryFilter])

  const filteredCatalogue = useMemo(() =>
    catalogue.filter(m => {
      if (categoryFilter !== "all" && m.category !== categoryFilter) return false
      if (!q) return true
      return m.description.toLowerCase().includes(q) ||
             m.materialNo.toLowerCase().includes(q)
    })
  , [catalogue, q, categoryFilter])

  const filteredReceives = useMemo(() =>
    receives.filter(r => {
      if (!q) return true
      return r.materialDesc.toLowerCase().includes(q) ||
             r.receiveId.toLowerCase().includes(q) ||
             r.challanRef.toLowerCase().includes(q) ||
             r.receivedFrom.toLowerCase().includes(q)
    })
  , [receives, q])

  const filteredIssues = useMemo(() =>
    issues.filter(i => {
      if (!q) return true
      return i.materialDesc.toLowerCase().includes(q) ||
             i.issueId.toLowerCase().includes(q) ||
             i.recipientName.toLowerCase().includes(q) ||
             i.purpose.toLowerCase().includes(q)
    })
  , [issues, q])

  // ── Add/Edit Catalogue Item ───────────────────────────────────────────────────
  const handleAddMaterial = async () => {
    if (!newMatDesc.trim()) return
    setAddingMaterial(true)
    try {
      const isEdit = !!editingMaterial
      const url = "/api/material/catalogue"
      const method = isEdit ? "PUT" : "POST"
      
      const fd = new FormData()
      if (editingMaterial) {
        fd.append("materialId", editingMaterial.materialId)
      }
      fd.append("materialNo", newMatNo.trim())
      fd.append("description", newMatDesc.trim())
      fd.append("unit", newMatUnit)
      fd.append("category", newMatCategory)
      fd.append("threshold", newMatThreshold)
      
      if (newMatPhoto) {
        fd.append("photo", newMatPhoto)
      } else if (editingMaterial && editingMaterial.photoUrl) {
        fd.append("existingPhotoUrl", editingMaterial.photoUrl)
      }

      const res = await fetch(url, {
        method,
        body: fd,
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save")
      
      cancelEditMaterial()
      fetchData(true)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setAddingMaterial(false)
    }
  }

  // ── Delete Transactions ───────────────────────────────────────────────────────
  const handleDeleteReceive = async (receiveId: string) => {
    if (!confirm("Are you sure you want to delete this receive transaction? This will restore stock levels.")) return
    try {
      const res = await fetch(`/api/material/receive?receiveId=${receiveId}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed")
      fetchData(true)
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleDeleteIssue = async (issueId: string) => {
    if (!confirm("Are you sure you want to delete this issue transaction? This will return materials to stock.")) return
    try {
      const res = await fetch(`/api/material/issue?issueId=${issueId}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed")
      fetchData(true)
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleDeleteCatalogueItem = async (materialId: string) => {
    if (!confirm("Are you sure you want to delete this material from the catalogue?")) return
    try {
      const res = await fetch(`/api/material/catalogue?materialId=${materialId}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed")
      fetchData(true)
    } catch (e: any) {
      alert(e.message)
    }
  }

  // ── Reports ───────────────────────────────────────────────────────────────────
  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx")
      const wb = XLSX.utils.book_new()

      // Sheet 1: Stock Register
      const stockRows = stock.map((s, idx) => ({
        "S.No": idx + 1,
        "Material ID": s.materialId,
        "Material No": s.materialNo || "—",
        "Description": s.description,
        "Category": s.category,
        "Total Received": s.totalReceived,
        "Total Issued": s.totalIssued,
        "Available Stock": s.currentStock,
        "Unit": s.unit,
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockRows), "Stock Register")

      // Sheet 2: Received Receipts
      const recvRows = receives.map((r, idx) => ({
        "S.No": idx + 1,
        "Challan / Receive ID": r.receiveId,
        "Material ID": r.materialId,
        "Description": r.materialDesc,
        "Qty": r.quantity,
        "Unit": r.unit,
        "Challan Ref": r.challanRef || "—",
        "Date Received": r.receivedDate,
        "Source / Received From": r.receivedFrom,
        "Recorded By": r.createdBy,
        "Remarks": r.remarks || "—",
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recvRows), "Received History")

      // Sheet 3: Issued Receipts
      const issueRows = issues.map((i, idx) => ({
        "S.No": idx + 1,
        "Issue ID": i.issueId,
        "Material ID": i.materialId,
        "Description": i.materialDesc,
        "Qty": i.quantity,
        "Unit": i.unit,
        "Recipient Name": i.recipientName,
        "Recipient Designation": i.recipientDesignation || "—",
        "Purpose": i.purpose || "—",
        "Date Issued": i.issueDate,
        "Issued By": i.issuedBy,
        "Remarks": i.remarks || "—",
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(issueRows), "Issued History")

      XLSX.writeFile(wb, `Material_Stock_Report_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) {
      console.error(e)
      alert("Failed to export Excel report")
    }
  }

  const exportPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf")
      const { default: autoTable } = await import("jspdf-autotable")

      const doc = new jsPDF({ orientation: "landscape" })
      doc.setFontSize(14)
      doc.setTextColor(30, 41, 59)
      doc.text("Office Store Material Stock Register", 14, 15)

      doc.setFontSize(8)
      doc.setTextColor(100)
      doc.text(`Generated on: ${new Date().toLocaleDateString("en-IN")} · User: ${username}`, 14, 20)

      const headers = [["Material ID", "Material No", "Description", "Category", "Unit", "Total Inward", "Total Outward", "Available Stock"]]
      const body = stock.map(s => [
        s.materialId,
        s.materialNo || "—",
        s.description,
        s.category,
        s.unit,
        s.totalReceived.toString(),
        s.totalIssued.toString(),
        s.currentStock.toString()
      ])

      autoTable(doc, {
        startY: 24,
        head: headers,
        body: body,
        styles: { fontSize: 7.5, font: "helvetica" },
        headStyles: { fillColor: [15, 23, 42] },
        columnStyles: { 2: { cellWidth: 80 } }
      })

      doc.save(`Material_Stock_Register_${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (e) {
      console.error(e)
      alert("Failed to export PDF report")
    }
  }

  if (loading && stock.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
          <p className="text-sm text-gray-500">Loading store inventory...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-10">
      {/* ── HEADER ── */}
      {view !== "receive" && view !== "issue" && (
        <div className="flex items-center justify-between flex-wrap gap-2 border-b pb-4">
          <div className="flex items-center gap-2">
            {view !== "menu" && (
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setView("menu")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 leading-none">
                <Package className="h-6 w-6 text-amber-600" />
                {view === "menu" && "Material Management"}
                {view === "stock" && "Stock Register"}
                {view === "settings" && "Settings"}
              </h2>
              <p className="text-[11px] text-gray-500 mt-1">
                {view === "menu" && "Store stock keeping, challan inward entry, and tool/material issues."}
                {view === "stock" && "View balance stock and activity timelines."}
                {view === "settings" && "Manage item catalogue lists and delete logs."}
              </p>
            </div>
          </div>
          <div />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3.5 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── 1. MAIN MENU PANEL ── */}
      {view === "menu" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
          {/* Receive Card */}
          {canWrite && (
            <Card
              className="hover:shadow-lg transition-all duration-300 border hover:border-emerald-200 hover:bg-emerald-50/20 cursor-pointer overflow-hidden group"
              onClick={() => setView("receive")}
            >
              <CardContent className="p-5 text-center space-y-3">
                <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 transition group-hover:scale-105">
                  <ArrowDownToLine className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">Receive Material</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Challan Inward entry (Multi-item)</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Issue Card */}
          {canWrite && (
            <Card
              className="hover:shadow-lg transition-all duration-300 border hover:border-orange-200 hover:bg-orange-50/20 cursor-pointer overflow-hidden group"
              onClick={() => setView("issue")}
            >
              <CardContent className="p-5 text-center space-y-3">
                <div className="mx-auto w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center text-orange-700 transition group-hover:scale-105">
                  <ArrowUpFromLine className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">Issue Material</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Handover to recipient (Multi-item)</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stock Card */}
          <Card
            className="hover:shadow-lg transition-all duration-300 border hover:border-amber-200 hover:bg-amber-50/20 cursor-pointer overflow-hidden group col-span-1"
            onClick={() => setView("stock")}
          >
            <CardContent className="p-5 text-center space-y-3">
              <div className="mx-auto w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 transition group-hover:scale-105">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-gray-900">Stock Register</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">View balance stock & histories</p>
              </div>
            </CardContent>
          </Card>

          {/* Settings Card */}
          {canWrite && (
            <Card
              className="hover:shadow-lg transition-all duration-300 border hover:border-gray-300 hover:bg-gray-50/50 cursor-pointer overflow-hidden group col-span-1"
              onClick={() => setView("settings")}
            >
              <CardContent className="p-5 text-center space-y-3">
                <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 transition group-hover:scale-105">
                  <Settings className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">Settings</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Manage catalogue & clear errors</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── 2. STOCK REGISTER VIEW ── */}
      {view === "stock" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search description or code..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10 pr-8 rounded-xl h-9 text-sm"
              />
              {search && (
                <X 
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer" 
                  onClick={() => setSearch("")} 
                />
              )}
            </div>

            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="h-9 rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs font-semibold hover:bg-gray-100 transition-colors shrink-0 outline-none"
            >
              <option value="all">All Categories</option>
              {MATERIAL_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchData(true)}
              disabled={syncState === "loading"}
              className="shrink-0 rounded-xl h-9 w-9 p-0 bg-gray-50 border-gray-200 hover:bg-gray-100 transition-colors"
              title="Refresh stock data"
            >
              <RefreshCw className={`h-4 w-4 ${syncState === "loading" ? "animate-spin text-blue-500" : "text-gray-600"}`} />
            </Button>

            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="shrink-0 rounded-xl h-9 w-9 p-0 bg-gray-50 border-gray-200 hover:bg-gray-100 transition-colors"
                title="Export Options"
              >
                <MoreVertical className="h-4 w-4 text-gray-600" />
              </Button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 mt-1.5 w-40 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1.5 text-xs">
                    <button
                      onClick={() => { exportExcel(); setShowExportMenu(false) }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 font-medium text-gray-700"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Export Excel
                    </button>
                    <button
                      onClick={() => { exportPDF(); setShowExportMenu(false) }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 font-medium text-gray-700"
                    >
                      <FileDown className="h-3.5 w-3.5 text-blue-600" /> Export PDF
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Stock Table */}
          <Card className="overflow-hidden border border-gray-200">
            <Table>
              <TableHeader className="bg-slate-900 hover:bg-slate-900">
                <TableRow>
                  <TableHead className="text-xs text-white">Item Name</TableHead>
                  <TableHead className="text-xs text-white text-right">Available Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStock.map((s, idx) => {
                  const isLow = s.currentStock < s.threshold
                  const stockColor = isLow ? "text-red-600 font-bold" : "text-gray-900 font-semibold"
                  return (
                    <TableRow key={`${s.materialId}-${idx}`} className="hover:bg-slate-50/50">
                      <TableCell className="text-xs flex items-center gap-2">
                        {s.photoUrl ? (
                          <img 
                            src={s.photoUrl} 
                            alt="" 
                            className="h-7 w-7 rounded-lg object-cover border bg-gray-50 flex-shrink-0" 
                          />
                        ) : (
                          <div className="h-7 w-7 rounded-lg border bg-gray-50 flex items-center justify-center flex-shrink-0 text-gray-400">
                            <Package className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <span 
                          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-semibold"
                          onClick={() => setHistoryMaterial(s)}
                        >
                          {s.description}
                        </span>
                      </TableCell>
                      <TableCell className={`text-xs text-right ${stockColor}`}>
                        <span className={isLow ? "bg-red-50 border border-red-200 px-2 py-0.5 rounded inline-block" : ""}>
                          {s.currentStock} {s.unit}
                        </span>
                        {isLow && (
                          <span className="block text-[9px] text-red-500 font-medium mt-0.5">
                            Min Threshold: {s.threshold}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredStock.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-10 text-xs text-gray-400">
                      No matching material stock found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* ── 3. SETTINGS & ADMIN PANEL ── */}
      {view === "settings" && canWrite && (
        <div className="space-y-4">
          {/* Sub Tab selector */}
          <div className="flex gap-2 border-b pb-2">
            <button
              onClick={() => setSettingsTab("catalogue")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                settingsTab === "catalogue" ? "bg-slate-900 text-white" : "text-gray-500 hover:text-slate-900"
              }`}
            >
              Configure Catalogue
            </button>
            <button
              onClick={() => setSettingsTab("transactions")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                settingsTab === "transactions" ? "bg-slate-900 text-white" : "text-gray-500 hover:text-slate-900"
              }`}
            >
              Delete Wrong Entries
            </button>
          </div>

          {/* Sub-view A: Manage Catalogue */}
          {settingsTab === "catalogue" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Add/Edit form */}
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader className="py-3.5 border-b">
                    <CardTitle className="text-sm font-bold">
                      {editingMaterial ? "Edit Material Definition" : "Add Material Definition"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3 text-xs">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Material Description *</Label>
                      <Input
                        placeholder="e.g. 11KV AAAC WSL 30SMM"
                        value={newMatDesc}
                        onChange={e => setNewMatDesc(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">SAP Code / Material No</Label>
                      <Input
                        placeholder="e.g. 592010621"
                        value={newMatNo}
                        onChange={e => setNewMatNo(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Measurement Unit</Label>
                        <select
                          value={newMatUnit}
                          onChange={e => setNewMatUnit(e.target.value)}
                          className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-xs"
                        >
                          <option value="nos">nos (Numbers)</option>
                          <option value="km">km (Kilometers)</option>
                          <option value="kg">kg (Kilograms)</option>
                          <option value="meters">meters</option>
                          <option value="sets">sets</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Category</Label>
                        <select
                          value={newMatCategory}
                          onChange={e => setNewMatCategory(e.target.value)}
                          className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-xs"
                        >
                          {MATERIAL_CATEGORIES.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Minimum Stock Threshold</Label>
                      <Input
                        type="number"
                        min="0"
                        placeholder="e.g. 10"
                        value={newMatThreshold}
                        onChange={e => setNewMatThreshold(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Material Photo</Label>
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="border border-dashed rounded-xl p-3 text-center cursor-pointer hover:bg-slate-50 transition-colors flex flex-col items-center justify-center min-h-[90px] relative bg-white overflow-hidden group"
                      >
                        {newMatPhotoPreview ? (
                          <>
                            <img src={newMatPhotoPreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-semibold">
                              Change Photo
                            </div>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="h-5 w-5 text-gray-400 mb-1" />
                            <span className="text-[10px] text-gray-400">Drag & drop or click to upload</span>
                          </>
                        )}
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="image/*"
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) {
                              setNewMatPhoto(file)
                              const reader = new FileReader()
                              reader.onload = ev => setNewMatPhotoPreview(ev.target?.result as string)
                              reader.readAsDataURL(file)
                            }
                          }}
                          className="hidden"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 mt-3">
                      {editingMaterial && (
                        <Button
                          onClick={cancelEditMaterial}
                          variant="outline"
                          className="flex-1 h-9 text-xs"
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        onClick={handleAddMaterial}
                        disabled={addingMaterial || !newMatDesc.trim()}
                        className={`bg-slate-900 hover:bg-slate-800 text-white h-9 text-xs ${editingMaterial ? "flex-1" : "w-full"}`}
                      >
                        {addingMaterial ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : editingMaterial ? (
                          <Check className="h-3.5 w-3.5 mr-1" />
                        ) : (
                          <Plus className="h-3.5 w-3.5 mr-1" />
                        )}
                        {editingMaterial ? "Save Changes" : "Add to Catalogue"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Catalogue Table List */}
              <div className="lg:col-span-2 space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <Input
                      placeholder="Filter catalogue..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                  <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="h-8 rounded-md border border-gray-200 bg-white px-2 text-[11px]"
                  >
                    <option value="all">All Categories</option>
                    {MATERIAL_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <Card className="overflow-hidden border border-gray-200 max-h-[50vh] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead className="text-xs py-2 h-8">Code</TableHead>
                        <TableHead className="text-xs py-2 h-8">Description</TableHead>
                        <TableHead className="text-xs py-2 h-8">Category</TableHead>
                        <TableHead className="text-xs py-2 h-8 text-center w-20">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCatalogue.map((m, idx) => (
                        <TableRow key={`${m.materialId}-${idx}`} className="hover:bg-slate-50/30">
                          <TableCell className="font-mono text-[11px] py-2 leading-none">
                            {m.materialNo || m.materialId}
                          </TableCell>
                          <TableCell className="text-xs py-2 font-medium flex items-center gap-2">
                            {m.photoUrl ? (
                              <img src={m.photoUrl} alt="" className="h-7 w-7 rounded-lg object-cover border bg-gray-50 flex-shrink-0" />
                            ) : (
                              <div className="h-7 w-7 rounded-lg border bg-gray-50 flex items-center justify-center flex-shrink-0 text-gray-400">
                                <Package className="h-3.5 w-3.5" />
                              </div>
                            )}
                            <span>{m.description}</span>
                          </TableCell>
                          <TableCell className="text-[10px] py-2"><Badge variant="secondary">{m.category}</Badge></TableCell>
                          <TableCell className="py-2 text-center">
                            <div className="flex justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-blue-500 rounded-full hover:bg-blue-50"
                                onClick={() => startEditMaterial(m)}
                                title="Edit Material"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-red-500 rounded-full hover:bg-red-50"
                                onClick={() => handleDeleteCatalogueItem(m.materialId)}
                                title="Delete Material"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </div>
            </div>
          )}

          {/* Sub-view B: Deleting Incorrect Entries */}
          {settingsTab === "transactions" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Receives List */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
                  Inward Receipts (Challan Logs)
                </p>
                <div className="border rounded-lg bg-white divide-y max-h-[60vh] overflow-y-auto">
                  {receives.map((r, idx) => (
                    <div key={`${r.receiveId}-${idx}`} className="p-3 text-xs space-y-1.5 relative group">
                      <div className="flex items-start justify-between pr-8">
                        <div>
                          <p className="font-semibold text-gray-900">{r.materialDesc}</p>
                          <p className="text-[10px] text-gray-500 font-mono">
                            ID: {r.receiveId} · Qty: <span className="font-bold text-emerald-700">{r.quantity} {r.unit}</span>
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-700 bg-white border-red-100 hover:bg-red-50 absolute top-3 right-3 opacity-80 group-hover:opacity-100"
                          onClick={() => handleDeleteReceive(r.receiveId)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 text-[10px] text-gray-400">
                        <div><span className="font-medium text-gray-500">Challan:</span> {r.challanRef || "—"}</div>
                        <div><span className="font-medium text-gray-500">From:</span> {r.receivedFrom}</div>
                        <div><span className="font-medium text-gray-500">Date:</span> {r.receivedDate}</div>
                        <div><span className="font-medium text-gray-500">By:</span> {r.createdBy}</div>
                      </div>
                    </div>
                  ))}
                  {receives.length === 0 && (
                    <p className="text-center py-10 text-xs text-gray-400">No inward records found</p>
                  )}
                </div>
              </div>

              {/* Issues List */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <ArrowUpFromLine className="h-4 w-4 text-orange-600" />
                  Outward Handovers (Issues Logs)
                </p>
                <div className="border rounded-lg bg-white divide-y max-h-[60vh] overflow-y-auto">
                  {issues.map((i, idx) => (
                    <div key={`${i.issueId}-${idx}`} className="p-3 text-xs space-y-1.5 relative group">
                      <div className="flex items-start justify-between pr-8">
                        <div>
                          <p className="font-semibold text-gray-900">{i.materialDesc}</p>
                          <p className="text-[10px] text-gray-500 font-mono">
                            ID: {i.issueId} · Qty: <span className="font-bold text-orange-700">-{i.quantity} {i.unit}</span>
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-700 bg-white border-red-100 hover:bg-red-50 absolute top-3 right-3 opacity-80 group-hover:opacity-100"
                          onClick={() => handleDeleteIssue(i.issueId)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 text-[10px] text-gray-400">
                        <div><span className="font-medium text-gray-500">To:</span> {i.recipientName} ({i.recipientDesignation || "—"})</div>
                        <div><span className="font-medium text-gray-500">Purpose:</span> {i.purpose || "—"}</div>
                        <div><span className="font-medium text-gray-500">Date:</span> {i.issueDate}</div>
                        <div><span className="font-medium text-gray-500">By:</span> {i.issuedBy}</div>
                      </div>
                    </div>
                  ))}
                  {issues.length === 0 && (
                    <p className="text-center py-10 text-xs text-gray-400">No outward records found</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

         {/* ── 4. RECEIVE FORM VIEW ── */}
         {view === "receive" && (
           <MaterialReceiveForm
             catalogue={catalogue.filter(m => m.isActive)}
             onSuccess={() => { setView("menu"); fetchData(true) }}
             onCancel={() => setView("menu")}
           />
         )}

         {/* ── 5. ISSUE FORM VIEW ── */}
         {view === "issue" && (
           <MaterialIssueForm
             catalogue={catalogue.filter(m => m.isActive)}
             stock={stock}
             onSuccess={() => { setView("menu"); fetchData(true) }}
             onCancel={() => setView("menu")}
           />
         )}

      <MaterialHistoryDialog
        material={historyMaterial}
        open={!!historyMaterial}
        onClose={() => setHistoryMaterial(null)}
        receives={receives}
        issues={issues}
      />
    </div>
  )
}
