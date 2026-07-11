"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Camera, Upload, Loader2, MapPin, RadioTower, Sparkles } from "lucide-react"
import type { DTRRecord } from "@/lib/dtr-service"

interface Props {
  dtr: DTRRecord
  userRole: string
  username: string
  onSave: () => void
  onCancel: () => void
}

export function DTRInspectionForm({ dtr, userRole, username, onSave, onCancel }: Props) {
  // Prep populate with existing values if available
  const [actualFeeder, setActualFeeder] = useState(dtr.actualFeeder || dtr.feederName || "")
  const [actualRating, setActualRating] = useState(dtr.actualRating || dtr.kvCapacity || "")
  const [actualLocation, setActualLocation] = useState(dtr.actualLocation || dtr.locationName || "")
  const [supplyOffice, setSupplyOffice] = useState(dtr.supplyOffice || "KUSHIDA")
  
  const [latlong, setLatlong] = useState(dtr.latlong || "")
  const [imageUrl, setImageUrl] = useState(dtr.image || "")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  
  // Inspection parameters
  const [painting, setPainting] = useState<string>(dtr.painting || "Pending")
  const [kiosk, setKiosk] = useState<string>(dtr.kiosk || "Good")
  const [la, setLa] = useState<string>(dtr.la || "Good")
  const [ne, setNe] = useState<string>(dtr.ne || "Good")
  
  // RYBN Loads
  const [loadR, setLoadR] = useState(dtr.loadR || "")
  const [loadY, setLoadY] = useState(dtr.loadY || "")
  const [loadB, setLoadB] = useState(dtr.loadB || "")
  const [loadN, setLoadN] = useState(dtr.loadN || "")
  
  const [remarks, setRemarks] = useState(dtr.remarks || "")
  
  // State helpers
  const [uploading, setUploading] = useState(false)
  const [fetchingLocation, setFetchingLocation] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Camera helpers ────────────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      streamRef.current = s
      setCameraOn(true)
      requestAnimationFrame(() => { if (videoRef.current) videoRef.current.srcObject = s })
    } catch { alert("Camera unavailable.") }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }

  const capturePhoto = () => {
    const v = videoRef.current
    if (!v) return
    const canvas = document.createElement("canvas")
    canvas.width = v.videoWidth; canvas.height = v.videoHeight
    canvas.getContext("2d")?.drawImage(v, 0, 0)
    canvas.toBlob(blob => {
      if (blob) { stopCamera(); uploadImage(new File([blob], "capture.jpg", { type: "image/jpeg" })) }
    }, "image/jpeg")
  }

  // ── Image compression (watermark with DTR Code) ───────────────────
  const processImage = async (file: File): Promise<File> => {
    return new Promise(resolve => {
      const img = new Image()
      img.src = URL.createObjectURL(file)
      img.onload = () => {
        let w = img.width, h = img.height
        const max = 1024
        if (w > max || h > max) {
          if (w > h) { h = Math.round(h * max / w); w = max }
          else { w = Math.round(w * max / h); h = max }
        }
        const canvas = document.createElement("canvas")
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext("2d")
        if (!ctx) { resolve(file); return }
        ctx.drawImage(img, 0, 0, w, h)

        const fs = Math.max(20, w * 0.032)
        const pad = fs / 2
        const barH = fs * 1.3 * 2 + pad * 2
        ctx.fillStyle = "rgba(0,0,0,0.65)"
        ctx.fillRect(0, h - barH, w, barH)
        ctx.font = `bold ${fs}px sans-serif`
        ctx.fillStyle = "#fff"
        ctx.textBaseline = "bottom"
        const dateStr = new Date().toLocaleString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })
        ctx.fillText(`Date: ${dateStr}`, pad, h - barH + pad + fs)
        ctx.fillText(`DTR Code — ID: ${dtr.dtrCode}`, pad, h - pad)

        canvas.toBlob(blob => resolve(blob ? new File([blob], file.name, { type: "image/jpeg" }) : file), "image/jpeg", 0.8)
      }
      img.onerror = () => resolve(file)
    })
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  const uploadImage = async (file: File) => {
    setPreviewUrl(URL.createObjectURL(file))
    setUploading(true)
    try {
      const compressed = await processImage(file)
      const fd = new FormData()
      fd.append("file", compressed)
      fd.append("consumerId", dtr.dtrCode) // API route expects consumerId, we map it to dtrCode
      const res = await fetch("/api/upload-image", { method: "POST", body: fd })
      const data = await res.json()
      if (data.success) setImageUrl(data.url)
    } catch { alert("Upload failed.") }
    finally { setUploading(false) }
  }

  // ── Geolocation ───────────────────────────────────────────────────────────
  const getGeolocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.")
      return
    }
    setFetchingLocation(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6)
        const lng = position.coords.longitude.toFixed(6)
        setLatlong(`${lat}, ${lng}`)
        setFetchingLocation(false)
      },
      () => {
        alert("Unable to retrieve location. Please check your browser permission.")
        setFetchingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!actualFeeder.trim()) { alert("Actual Feeder is required."); return }
    if (!actualRating.trim()) { alert("Actual Rating (Capacity) is required."); return }
    if (!actualLocation.trim()) { alert("Actual Location is required."); return }
    if (!latlong.trim()) { alert("GPS coordinates (LatLong) are required."); return }

    setSubmitting(true)
    try {
      const res = await fetch("/api/dtr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dtrCode: dtr.dtrCode,
          feederName: dtr.feederName,
          locationName: dtr.locationName,
          kvCapacity: dtr.kvCapacity,
          status: "EXIST", // Verified existence
          actualFeeder: actualFeeder.trim(),
          actualRating: actualRating.trim(),
          actualLocation: actualLocation.trim(),
          supplyOffice: supplyOffice.trim(),
          latlong: latlong.trim(),
          image: imageUrl,
          painting,
          kiosk,
          la,
          ne,
          loadR: loadR.trim(),
          loadY: loadY.trim(),
          loadB: loadB.trim(),
          loadN: loadN.trim(),
          remarks: remarks.trim(),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed to submit DTR verification")
      onSave()
    } catch (e: any) {
      alert(e.message || "Failed to save verification")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-28">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel} className="rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">DTR Physical Verification</h1>
          <p className="text-sm text-gray-500 font-mono">DTR Code: {dtr.dtrCode}</p>
        </div>
      </div>

      <Card className="border border-gray-150 shadow-sm overflow-hidden">
        <CardContent className="p-6 space-y-6">
          
          {/* Reference Info */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3 items-start">
            <RadioTower className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">System Reference</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm text-blue-900">
                <div><span className="opacity-75">Feeder:</span> <strong>{dtr.feederName || "—"}</strong></div>
                <div><span className="opacity-75">Capacity:</span> <strong>{dtr.kvCapacity ? `${dtr.kvCapacity} kVA` : "—"}</strong></div>
                <div className="col-span-2"><span className="opacity-75">Location:</span> <strong>{dtr.locationName || "—"}</strong></div>
              </div>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            
            {/* Feeder Confirmation */}
            <div className="space-y-2">
              <Label htmlFor="actualFeeder" className="text-gray-700 font-medium">Actual Feeder Name</Label>
              <Input
                id="actualFeeder"
                placeholder="Confirm Feeder Name"
                value={actualFeeder}
                onChange={e => setActualFeeder(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>

            {/* Rating / Capacity */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="actualRating" className="text-gray-700 font-medium">Actual KV Rating</Label>
                <Input
                  id="actualRating"
                  placeholder="e.g. 25, 63, 100"
                  value={actualRating}
                  onChange={e => setActualRating(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplyOffice" className="text-gray-700 font-medium">Supply Office</Label>
                <Input
                  id="supplyOffice"
                  value={supplyOffice}
                  onChange={e => setSupplyOffice(e.target.value)}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>

            {/* Actual Location */}
            <div className="space-y-2">
              <Label htmlFor="actualLocation" className="text-gray-700 font-medium">Actual Location Name / Landmark</Label>
              <Input
                id="actualLocation"
                placeholder="Where is the transformer located?"
                value={actualLocation}
                onChange={e => setActualLocation(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>

            {/* Coordinates Section */}
            <div className="space-y-2">
              <Label htmlFor="latlong" className="text-gray-700 font-medium">GPS Coordinates (Latitude, Longitude)</Label>
              <div className="flex gap-2">
                <Input
                  id="latlong"
                  placeholder="e.g. 25.452202, 88.021090"
                  value={latlong}
                  onChange={e => setLatlong(e.target.value)}
                  className="h-11 rounded-xl font-mono text-sm"
                />
                <Button 
                  type="button" 
                  onClick={getGeolocation} 
                  disabled={fetchingLocation}
                  variant="outline"
                  className="h-11 px-4 rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50 shrink-0"
                >
                  {fetchingLocation ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <MapPin className="h-5 w-5 mr-1" />
                      GPS
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* DTR Painting Option */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-gray-700 font-bold flex items-center gap-1.5 text-base">
                <Sparkles className="h-4 w-4 text-orange-600" />
                DTR Painting & Inspections
              </Label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="painting" className="text-gray-700 font-medium">DTR Painting</Label>
                <Select value={painting} onValueChange={setPainting}>
                  <SelectTrigger id="painting" className="h-11 rounded-xl">
                    <SelectValue placeholder="Painting status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Done">Done (Completed)</SelectItem>
                    <SelectItem value="Pending">Pending (Not Painted)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="kiosk" className="text-gray-700 font-medium">Kiosk Box Status</Label>
                <Select value={kiosk} onValueChange={setKiosk}>
                  <SelectTrigger id="kiosk" className="h-11 rounded-xl">
                    <SelectValue placeholder="Kiosk status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Good">Good</SelectItem>
                    <SelectItem value="Defective">Defective</SelectItem>
                    <SelectItem value="Missing">Missing / None</SelectItem>
                    <SelectItem value="Not Applicable">Not Applicable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="la" className="text-gray-700 font-medium">Lightning Arrester (LA)</Label>
                <Select value={la} onValueChange={setLa}>
                  <SelectTrigger id="la" className="h-11 rounded-xl">
                    <SelectValue placeholder="LA status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Good">Good (Working)</SelectItem>
                    <SelectItem value="Defective">Defective (Damaged)</SelectItem>
                    <SelectItem value="Missing">Missing</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ne" className="text-gray-700 font-medium">Neutral Earthing (NE)</Label>
                <Select value={ne} onValueChange={setNe}>
                  <SelectTrigger id="ne" className="h-11 rounded-xl">
                    <SelectValue placeholder="NE status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Good">Good</SelectItem>
                    <SelectItem value="Defective">Defective</SelectItem>
                    <SelectItem value="Missing">Missing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Load Currents RYBN */}
            <div className="space-y-2 pt-2">
              <Label className="text-gray-700 font-medium">Inspection Load Currents (in Amps)</Label>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label htmlFor="loadR" className="text-[10px] text-gray-500 font-mono block mb-1">R-Phase</Label>
                  <Input
                    id="loadR"
                    type="number"
                    placeholder="Amps"
                    value={loadR}
                    onChange={e => setLoadR(e.target.value)}
                    className="h-10 rounded-lg text-center"
                  />
                </div>
                <div>
                  <Label htmlFor="loadY" className="text-[10px] text-gray-500 font-mono block mb-1">Y-Phase</Label>
                  <Input
                    id="loadY"
                    type="number"
                    placeholder="Amps"
                    value={loadY}
                    onChange={e => setLoadY(e.target.value)}
                    className="h-10 rounded-lg text-center"
                  />
                </div>
                <div>
                  <Label htmlFor="loadB" className="text-[10px] text-gray-500 font-mono block mb-1">B-Phase</Label>
                  <Input
                    id="loadB"
                    type="number"
                    placeholder="Amps"
                    value={loadB}
                    onChange={e => setLoadB(e.target.value)}
                    className="h-10 rounded-lg text-center"
                  />
                </div>
                <div>
                  <Label htmlFor="loadN" className="text-[10px] text-gray-500 font-mono block mb-1">Neutral (N)</Label>
                  <Input
                    id="loadN"
                    type="number"
                    placeholder="Amps"
                    value={loadN}
                    onChange={e => setLoadN(e.target.value)}
                    className="h-10 rounded-lg text-center"
                  />
                </div>
              </div>
            </div>

            {/* Remarks */}
            <div className="space-y-2">
              <Label htmlFor="remarks" className="text-gray-700 font-medium">Remarks / Description</Label>
              <Textarea
                id="remarks"
                placeholder="Add comments on transformer physical condition..."
                rows={3}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                className="rounded-xl resize-none"
              />
            </div>

            {/* Evidence Image */}
            <div className="space-y-2 pt-2">
              <Label className="text-gray-700 font-medium">DTR Photo (Upload / Capture)</Label>
              <input 
                ref={fileRef} 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} 
              />
              
              {cameraOn ? (
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                    <Button type="button" onClick={capturePhoto} className="bg-red-600 hover:bg-red-700 text-white rounded-full h-12 px-6">
                      Capture
                    </Button>
                    <Button type="button" variant="secondary" onClick={stopCamera} className="rounded-full h-12 px-6">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="h-14 rounded-2xl border-dashed border-gray-300"
                    onClick={startCamera} 
                    disabled={uploading}
                  >
                    <Camera className="h-5 w-5 mr-2 text-indigo-600" />
                    Use Camera
                  </Button>
                  
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="h-14 rounded-2xl border-dashed border-gray-300"
                    onClick={() => fileRef.current?.click()} 
                    disabled={uploading}
                  >
                    <Upload className="h-5 w-5 mr-2 text-blue-600" />
                    Open Gallery
                  </Button>
                </div>
              )}

              {/* Preview image */}
              {(previewUrl || imageUrl) && !cameraOn && (
                <div className="relative rounded-2xl overflow-hidden border mt-3 max-h-48 bg-gray-50 flex items-center justify-center">
                  <img 
                    src={previewUrl || imageUrl} 
                    alt="DTR evidence" 
                    className={`max-h-48 object-contain ${uploading ? 'opacity-40' : ''}`} 
                  />
                  {uploading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12 rounded-xl text-gray-700 border-gray-200"
              onClick={onCancel}
              disabled={submitting || uploading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-[2] h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-100"
              onClick={handleSubmit}
              disabled={submitting || uploading}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save Verification"
              )}
            </Button>
          </div>
          
        </CardContent>
      </Card>
    </div>
  )
}
