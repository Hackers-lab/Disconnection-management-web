"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { 
  ArrowLeft, Upload, Camera, MapPin, Power, Clock, CircleX, Check, RotateCcw,
  Smartphone, IndianRupee, Box, Monitor, AlertCircle, Calendar, Loader2
} from "lucide-react"
import type { ConsumerData } from "@/lib/google-sheets"

interface ConsumerFormProps {
  consumer: ConsumerData
  onSave: (consumer: ConsumerData) => void
  onCancel: () => void
  userRole: string
  availableAgencies: string[]
}

export function ConsumerForm({ consumer, onSave, onCancel, userRole, availableAgencies }: ConsumerFormProps) {
  const [formData, setFormData] = useState({
    ...consumer,
    notes: consumer.notes || "",
    agency: consumer.agency || "",
    image: null as File | null,
    reading: consumer.reading || "",
    imageUrl: consumer.imageUrl,
  })
  
  const [uploading, setUploading] = useState(false)
  const [statusChanged, setStatusChanged] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  // Fetch location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.warn("Location access denied or unavailable", err),
        { enableHighAccuracy: true }
      )
    }
  }, [])

  // Cleanup preview URL on unmount or change
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // --- 1. WATERMARK & COMPRESSION HELPER ---
  const processImage = async (imageFile: File): Promise<File> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.src = URL.createObjectURL(imageFile)
      
      img.onload = async () => {
        // Resize logic: Max dimension 1024px
        let width = img.width
        let height = img.height
        const maxDim = 1024
        
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }

        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        
        if (!ctx) {
          resolve(imageFile)
          return
        }

        // Draw image scaled
        ctx.drawImage(img, 0, 0, width, height)

        // -- Watermark Config --
        const fontSize = Math.max(24, width * 0.035) // Responsive font size
        const padding = fontSize / 2
        const lineHeight = fontSize * 1.3
        const barHeight = (lineHeight * 2) + (padding * 2)

        // Draw Semi-transparent Black Bar at Bottom
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)"
        ctx.fillRect(0, height - barHeight, width, barHeight)

        // Draw Text
        ctx.font = `bold ${fontSize}px sans-serif`
        ctx.fillStyle = "#ffffff"
        ctx.textBaseline = "bottom"
        
        // Line 1: Date
        const dateStr = new Date().toLocaleString("en-IN", { 
          day: '2-digit', month: '2-digit', year: 'numeric', 
          hour: '2-digit', minute: '2-digit', hour12: true 
        })
        ctx.fillText(`Date: ${dateStr}`, padding, height - barHeight + padding + fontSize)

        // Line 2: GPS
        let locStr = "GPS: Waiting for signal..."
        if (location) {
          locStr = `Lat: ${location.lat.toFixed(6)}, Long: ${location.lng.toFixed(6)}`
        } else if (navigator.geolocation) {
           // Try one last fetch if state was null
           try {
             const pos: any = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, {timeout: 2000}))
             locStr = `Lat: ${pos.coords.latitude.toFixed(6)}, Long: ${pos.coords.longitude.toFixed(6)}`
           } catch (e) {
             locStr = "GPS: Location Disabled/Unavailable"
           }
        }
        ctx.fillText(locStr, padding, height - padding)

        // Convert Canvas to File
        canvas.toBlob(async (blob) => {
          if (blob) {
            // Create file from blob (Quality 0.8 gives better quality ~200KB for 1024px)
            const processedFile = new File([blob], imageFile.name, { type: "image/jpeg" })
            console.log(`Processed: ${(imageFile.size / 1024).toFixed(2)} KB -> ${(processedFile.size / 1024).toFixed(2)} KB`)
            resolve(processedFile)
          } else {
            resolve(imageFile)
          }
        }, "image/jpeg", 0.8) // Increased quality to 0.8 for ~200KB target
      }
      
      img.onerror = () => resolve(imageFile)
    })
  }

  // --- 2. UPLOAD TO SERVER ---
  const handleUpload = async (file: File) => {
    // Create immediate preview
    const objectUrl = URL.createObjectURL(file)
    setPreviewUrl(objectUrl)

    setUploading(true)
    try {
      // Process: Watermark -> Compress
      const processedFile = await processImage(file)
      
      setFormData(prev => ({ ...prev, image: processedFile })) // Save file to state for immediate UI feedback

      const uploadData = new FormData()
      uploadData.append("file", processedFile)
      uploadData.append("consumerId", consumer.consumerId)

      const response = await fetch("/api/upload-image", { method: "POST", body: uploadData })
      const result = await response.json()

      if (result.success) {
        setFormData(prev => ({ ...prev, imageUrl: result.url }))
        // Keep local previewUrl active for immediate feedback
      }
    } catch (error) {
      console.error("Upload failed", error)
      alert("Image upload failed. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  // --- 3. CAMERA LOGIC ---
  const startCamera = async () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // Use back camera
      })

      // store stream and activate camera UI first, then attach the stream to the video
      mediaStreamRef.current = stream
      setCameraActive(true)

      // Wait for the video element to mount, then attach stream
      // use requestAnimationFrame to schedule attachment on next paint
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
    } catch (err) {
      console.error("Camera error", err)
      alert("Unable to access camera. Please allow permissions.")
    }
  }

  const capturePhoto = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    const video = videoRef.current
    if (!video) return

    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.drawImage(video, 0, 0)
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" })
          stopCamera()
          handleUpload(file)
        }
      }, "image/jpeg")
    }
  }

  const stopCamera = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    const stream = mediaStreamRef.current || (videoRef.current && (videoRef.current.srcObject as MediaStream))
    if (stream) {
      const tracks = stream.getTracks()
      tracks.forEach((track) => track.stop())
    }

    if (videoRef.current) videoRef.current.srcObject = null
    mediaStreamRef.current = null
    setCameraActive(false)
  }

  const handleStatusUpdate = (status: string) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    const now = new Date();
    const formattedDate = now.toLocaleDateString("en-GB").replace(/\//g, "-");
    setFormData((prev) => ({ ...prev, disconStatus: status, disconDate: formattedDate }));
    setStatusChanged(true);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
    e.preventDefault();

    if (userRole !== "admin") {
      if (!formData.imageUrl) {
        alert("Please upload the image first.")
        return
      }
      if ((formData.disconStatus === "disconnected" || formData.disconStatus === "bill dispute") && !formData.reading) {
        alert("Meter reading is required.")
        return
      }
      if ((formData.disconStatus === "bill dispute" || formData.disconStatus === "office team") && !formData.notes) {
        alert("Remarks are required for Bill Dispute or Office Team status.")
        return
      }
    }

    const updatedConsumer: ConsumerData = {
      ...consumer,
      ...formData,
      lastUpdated: new Date().toISOString().split("T")[0],
    }
    onSave(updatedConsumer);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-28"> {/* Added padding-bottom for sticky footer */}
      
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Button variant="ghost" size="icon" onClick={() => {
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
          onCancel()
        }}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-gray-900">Update Consumer</h1>
      </div>

      {/* --- 1. SINGLE DETAILS CARD --- */}
      <Card className="bg-slate-50 border-slate-200 shadow-sm">
        <CardContent className="p-4 space-y-3">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">{consumer.name}</h2>
                    <p className="text-xs text-gray-500 font-mono">ID: {consumer.consumerId}</p>
                </div>
                <div className="text-right">
                    <div className="text-xl font-bold text-red-600 flex items-center justify-end">
                        <IndianRupee className="h-5 w-5" />
                        {Number(consumer.d2NetOS).toLocaleString()}
                    </div>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wide">Outstanding</span>
                </div>
            </div>

            <div className="flex items-start gap-2 text-sm text-gray-700">
                <MapPin className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                <span className="leading-snug">{consumer.address}</span>
            </div>

            <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs text-gray-600 pt-1">
                <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-gray-400" />
                    <a href={`tel:${consumer.mobileNumber}`} className="font-medium text-blue-600 underline">
                        {consumer.mobileNumber || "N/A"}
                    </a>
                </div>
                <div className="flex items-center gap-2 justify-end">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span>Due: <strong>{consumer.osDuedateRange}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                    <Box className="h-4 w-4 text-gray-400" />
                    <span>Class: {consumer.baseClass}</span>
                </div>
                <div className="flex items-center gap-2 justify-end">
                    <Monitor className="h-4 w-4 text-gray-400" />
                    <span>Device: {consumer.device}</span>
                </div>
            </div>
        </CardContent>
      </Card>

      {/* --- 2. UPDATE FORM --- */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Action & Evidence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
            
            {/* Status Buttons */}
            <div className="space-y-3">
                <Label className="text-xs font-bold text-gray-500 uppercase">Set Status</Label>
                <div className="grid grid-cols-1 gap-3">
                    <div className="flex gap-3">
                        <Button type="button" variant={formData.disconStatus === "disconnected" ? "default" : "outline"} className={`flex-1 h-12 border-2 ${formData.disconStatus === "disconnected" ? "bg-slate-800 hover:bg-slate-900 text-white border-slate-800" : "border-slate-300 text-slate-700 hover:border-slate-800 hover:bg-slate-50"}`} onClick={() => handleStatusUpdate("disconnected")}>
                            <Power className="h-4 w-4 mr-2" /> DISCONNECT
                        </Button>
                        <Button type="button" variant={formData.disconStatus === "bill dispute" ? "default" : "outline"} className={`flex-1 h-12 border-2 ${formData.disconStatus === "bill dispute" ? "bg-slate-800 hover:bg-slate-900 text-white border-slate-800" : "border-slate-300 text-slate-700 hover:border-slate-800 hover:bg-slate-50"}`} onClick={() => handleStatusUpdate("bill dispute")}>
                            <AlertCircle className="h-4 w-4 mr-2" /> DISPUTE
                        </Button>
                    </div>
                    <div className="flex gap-3">
                        <Button type="button" variant={formData.disconStatus === "office team" ? "default" : "outline"} className={`flex-1 h-12 border-2 ${formData.disconStatus === "office team" ? "bg-slate-800 hover:bg-slate-900 text-white border-slate-800" : "border-slate-300 text-slate-700 hover:border-slate-800 hover:bg-slate-50"}`} onClick={() => handleStatusUpdate("office team")}>
                            <Clock className="h-4 w-4 mr-2" /> OFFICE TEAM
                        </Button>
                        <Button type="button" variant={formData.disconStatus === "agency paid" ? "default" : "outline"} className={`flex-1 h-12 border-2 ${formData.disconStatus === "agency paid" ? "bg-slate-800 hover:bg-slate-900 text-white border-slate-800" : "border-slate-300 text-slate-700 hover:border-slate-800 hover:bg-slate-50"}`} onClick={() => handleStatusUpdate("agency paid")}>
                            <Check className="h-4 w-4 mr-2" /> PAID
                        </Button>
                    </div>
                    <div className="flex gap-3">
                        <Button type="button" variant={formData.disconStatus === "not found" ? "default" : "outline"} className={`flex-1 h-12 border-2 ${formData.disconStatus === "not found" ? "bg-slate-800 hover:bg-slate-900 text-white border-slate-800" : "border-slate-300 text-slate-700 hover:border-slate-800 hover:bg-slate-50"}`} onClick={() => handleStatusUpdate("not found")}>
                            <CircleX className="h-4 w-4 mr-2" /> NOT FOUND
                        </Button>
                        {userRole === "admin" && (
                            <Button type="button" variant={formData.disconStatus === "connected" ? "default" : "outline"} className={`flex-1 h-12 border-2 ${formData.disconStatus === "connected" ? "bg-slate-800 hover:bg-slate-900 text-white border-slate-800" : "border-slate-300 text-slate-700 hover:border-slate-800 hover:bg-slate-50"}`} onClick={() => handleStatusUpdate("connected")}>
                                <RotateCcw className="h-4 w-4 mr-2" /> REISSUE
                            </Button>
                        )}
                    </div>
                </div>
                <div className="bg-gray-50 p-2 rounded text-center text-xs text-gray-500">
                    Current: <span className="font-bold text-gray-900 uppercase">{formData.disconStatus}</span>
                    {formData.disconDate && <span> ({formData.disconDate})</span>}
                </div>
            </div>

            {/* Admin: Agency Selection */}
            {userRole === "admin" && (
              <div className="space-y-2 pt-2 border-t">
                <Label>Assign Agency</Label>
                <select 
                  value={formData.agency} 
                  onChange={(e) => setFormData({...formData, agency: e.target.value})}
                  className="w-full p-2 border rounded-md text-sm"
                >
                  <option value="">Select Agency</option>
                  {availableAgencies.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            )}

            {/* Image Upload with Live Camera */}
            <div className="space-y-3 pt-2 border-t">
                <Label className="text-xs font-bold text-gray-500 uppercase">
                  Evidence (Auto-Watermarked) {userRole !== "admin" && <span className="text-red-500">*</span>}
                </Label>
                
                {/* Hidden File Input for Gallery */}
                <input 
                    ref={fileInputRef}
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(file);
                    }}
                />

                {!cameraActive ? (
                    <div className="grid grid-cols-2 gap-3">
                        <Button 
                            type="button" 
                            variant="outline"
                            className="h-12 border-2 border-slate-300 text-slate-700 hover:border-slate-800 hover:bg-slate-50"
                            onClick={startCamera}
                            disabled={uploading}
                        >
                            <Camera className="h-5 w-5 mr-2" /> Camera (Live)
                        </Button>
                        <Button 
                            type="button" 
                            variant="outline"
                            className="h-12 border-2 border-slate-300 text-slate-700 hover:border-slate-800 hover:bg-slate-50"
                            onClick={() => {
                                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                                fileInputRef.current?.click()
                            }}
                            disabled={uploading}
                        >
                            <Upload className="h-5 w-5 mr-2" /> Gallery
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3 bg-black p-2 rounded-lg">
                        <div className="relative w-full h-64 bg-black rounded overflow-hidden">
                            <video 
                                ref={videoRef} 
                                autoPlay 
                                playsInline 
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                        </div>
                        <div className="flex gap-3">
                            <Button className="flex-1 bg-white text-black hover:bg-gray-200" onClick={capturePhoto}>
                                Capture Photo
                            </Button>
                            <Button variant="destructive" onClick={stopCamera}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}

                {/* Preview & Status */}
                {(previewUrl || formData.imageUrl) && !cameraActive && (
                    <div className="relative mt-2 rounded-lg overflow-hidden border border-gray-200">
                        <img 
                            src={previewUrl || formData.imageUrl} 
                            alt="Evidence" 
                            className={`w-full h-48 object-cover ${uploading ? 'opacity-50' : ''}`} 
                        />
                        {uploading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                <div className="bg-white/90 px-4 py-2 rounded-full flex items-center shadow-sm">
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin text-blue-600" />
                                    <span className="text-xs font-medium text-blue-600">Processing...</span>
                                </div>
                            </div>
                        )}
                        {!uploading && formData.imageUrl && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-2 text-center">
                                Uploaded Successfully
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Notes & Reading */}
            <div className="space-y-4 pt-2 border-t">
                <div className="space-y-2">
                    <Label>Meter Reading {userRole !== "admin" && (formData.disconStatus === "disconnected" || formData.disconStatus === "bill dispute") && <span className="text-red-500">*</span>}</Label>
                    <Input 
                        placeholder="Enter reading..." 
                        value={formData.reading} 
                        onChange={e => setFormData({...formData, reading: e.target.value})}
                    />
                </div>
                <div className="space-y-2">
                    <Label>Remarks {userRole !== "admin" && (formData.disconStatus === "bill dispute" || formData.disconStatus === "office team") && <span className="text-red-500">*</span>}</Label>
                    <Textarea 
                        placeholder="Any additional notes..." 
                        value={formData.notes} 
                        onChange={e => setFormData({...formData, notes: e.target.value})}
                    />
                </div>
            </div>

        </CardContent>
      </Card>

      {/* --- 3. LOCATION INFO --- */}
      {consumer.latitude && consumer.longitude && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <MapPin className="h-4 w-4 mr-2" />
              Location Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">GIS Pole:</span>
                <span className="font-medium">{consumer.gisPole || "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Coordinates:</span>
                <span className="font-mono text-xs">{consumer.latitude}, {consumer.longitude}</span>
              </div>
              <Button
                className="w-full mt-2"
                onClick={() => {
                  const url = `https://www.google.com/maps?q=${consumer.latitude},${consumer.longitude}`
                  window.open(url, "_blank")
                }}
              >
                Open in Maps
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* --- STICKY FOOTER ACTIONS --- */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 z-50 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <Button 
            variant="outline" 
            className="flex-1 h-12 border-gray-300 text-gray-700" 
            onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                onCancel()
            }}
        >
            Cancel
        </Button>
        <Button 
            className="flex-[2] h-12 text-lg shadow-sm bg-blue-600 hover:bg-blue-700 text-white" 
            onClick={handleSubmit}
            disabled={uploading}
        >
            {uploading ? "Uploading..." : "Save Update"}
        </Button>
      </div>

    </div>
  )
}