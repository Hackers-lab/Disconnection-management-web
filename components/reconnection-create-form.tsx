"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Search, Upload, Loader2, MapPin, Phone, Monitor, Building2 } from "lucide-react"
import { getFromCache } from "@/lib/indexed-db"
import type { ConsumerData } from "@/lib/google-sheets"

interface Props {
  agencies: string[]
  onSave: (requestId: string) => void
  onCancel: () => void
}

export function ReconnectionCreateForm({ agencies, onSave, onCancel }: Props) {
  const [consumerId, setConsumerId] = useState("")
  const [looking, setLooking] = useState(false)
  const [found, setFound] = useState<ConsumerData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [agencyList, setAgencyList] = useState<string[]>(agencies)
  const fileRef = useRef<HTMLInputElement>(null)

  // Load full agency list — session.agencies is empty for admin/executive
  useEffect(() => {
    async function loadAgencies() {
      // Try IndexedDB cache first (already populated by consumer-list)
      const cached = await getFromCache<string[]>("agencies_data_cache")
      if (cached && cached.length > 0) { setAgencyList(cached); return }
      // Fallback: fetch from API
      try {
        const res = await fetch("/api/admin/agencies")
        if (res.ok) {
          const data = await res.json()
          const names = data.filter((a: any) => a.isActive).map((a: any) => a.name)
          if (names.length > 0) setAgencyList(names)
        }
      } catch { /* keep whatever was passed in */ }
    }
    loadAgencies()
  }, [])

  // Form state
  const [mobile, setMobile] = useState("")
  const [agency, setAgency] = useState("")
  const [manualName, setManualName] = useState("")
  const [manualAddress, setManualAddress] = useState("")
  const [manualDevice, setManualDevice] = useState("")
  const [requestImageUrl, setRequestImageUrl] = useState("")
  const [remarks, setRemarks] = useState("")

  // ── Lookup consumer from IndexedDB cache ─────────────────────────────────
  const handleLookup = async () => {
    const id = consumerId.trim()
    if (id.length !== 9) { alert("Consumer ID must be 9 digits."); return }
    setLooking(true)
    setFound(null)
    setNotFound(false)
    try {
      const cache = await getFromCache<ConsumerData[]>("consumers_data_cache")
      const match = cache?.find(c => c.consumerId === id) || null
      if (match) {
        setFound(match)
        setMobile(match.mobileNumber || "")
        setAgency(match.agency || "")
      } else {
        setNotFound(true)
      }
    } finally {
      setLooking(false)
    }
  }

  // ── Image upload ──────────────────────────────────────────────────────────
  const handleImageUpload = async (file: File) => {
    setPreviewUrl(URL.createObjectURL(file))
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("consumerId", consumerId || "manual")
      const res = await fetch("/api/upload-image", { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) setRequestImageUrl(data.url)
    } catch { alert("Image upload failed.") }
    finally { setUploading(false) }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!agency) { alert("Please select an agency."); return }
    if (!mobile.trim()) { alert("Mobile number is required."); return }

    setSubmitting(true)
    try {
      const payload = found
        ? {
            consumerId: found.consumerId,
            name: found.name,
            address: found.address,
            mobile: mobile.trim(),
            agency,
            device: found.device,
            source: "dc_list",
            remarks,
          }
        : {
            consumerId: consumerId.trim(),
            name: manualName.trim(),
            address: manualAddress.trim(),
            mobile: mobile.trim(),
            agency,
            device: manualDevice.trim(),
            source: "manual",
            requestImageUrl,
            remarks,
          }

      const res = await fetch("/api/reconnection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      onSave(data.requestId)
    } catch (e: any) {
      alert(e.message || "Failed to create request")
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = consumerId.trim().length === 9 && (found || notFound)

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-gray-900">New Reconnection Request</h1>
      </div>

      {/* Consumer ID lookup */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Label>Consumer ID (9 digits)</Label>
          <div className="flex gap-2">
            <Input
              value={consumerId}
              onChange={e => {
                setConsumerId(e.target.value.replace(/\D/g, "").slice(0, 9))
                setFound(null)
                setNotFound(false)
              }}
              placeholder="Enter 9-digit Consumer ID"
              maxLength={9}
              className="font-mono tracking-wider"
            />
            <Button onClick={handleLookup} disabled={looking || consumerId.length !== 9} variant="outline">
              {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Found in DC list */}
      {found && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base text-green-800">Consumer found in DC list</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            <p className="font-semibold text-gray-900">{found.name}</p>
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
              <span>{found.address}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Monitor className="h-4 w-4 text-gray-400" />
              <span>Device: {found.device || "—"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Building2 className="h-4 w-4 text-gray-400" />
              <span>Agency: {found.agency || "—"}</span>
            </div>

            <div className="pt-2 space-y-2">
              <Label>Mobile Number (update if changed)</Label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="Mobile number" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Assign Agency</Label>
              <Select value={agency} onValueChange={setAgency}>
                <SelectTrigger><SelectValue placeholder="Select agency..." /></SelectTrigger>
                <SelectContent>
                  {agencyList.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Remarks (optional)</Label>
              <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any notes..." rows={2} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Not in DC list — manual entry */}
      {notFound && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base text-orange-800">Not in DC list — enter details manually</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="space-y-2">
              <Label>Consumer Name *</Label>
              <Input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-2">
              <Label>Address *</Label>
              <Textarea value={manualAddress} onChange={e => setManualAddress(e.target.value)} placeholder="Full address" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Mobile Number *</Label>
              <Input value={mobile} onChange={e => setMobile(e.target.value)} placeholder="Mobile number" />
            </div>
            <div className="space-y-2">
              <Label>Device / Meter</Label>
              <Input value={manualDevice} onChange={e => setManualDevice(e.target.value)} placeholder="Meter / device number" />
            </div>
            <div className="space-y-2">
              <Label>Assign Agency *</Label>
              <Select value={agency} onValueChange={setAgency}>
                <SelectTrigger><SelectValue placeholder="Select agency..." /></SelectTrigger>
                <SelectContent>
                  {agencyList.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Request image — consumer details evidence */}
            <div className="space-y-2">
              <Label>Upload Consumer Details Image (for agency reference)</Label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
              <Button type="button" variant="outline" className="w-full"
                onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                {uploading ? "Uploading..." : "Upload Image"}
              </Button>
              {previewUrl && (
                <img src={previewUrl} alt="Preview" className="w-full h-40 object-cover rounded-lg border" />
              )}
            </div>

            <div className="space-y-2">
              <Label>Remarks (optional)</Label>
              <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any notes..." rows={2} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      {canSubmit && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t z-50 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>Cancel</Button>
          <Button className="flex-[2] h-12 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSubmit} disabled={submitting || uploading}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {submitting ? "Creating..." : "Create Reconnection Request"}
          </Button>
        </div>
      )}
    </div>
  )
}
