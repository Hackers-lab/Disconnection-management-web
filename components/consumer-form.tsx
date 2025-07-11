"use client"

import type React from "react"
import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Upload, Camera, MapPin, Power, Clock } from "lucide-react"
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
    image: null as File | null,
    imageUrl: "",
  })
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const handleImageUpload = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("consumerId", consumer.consumerId)

      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()
      if (result.success) {
        setFormData((prev) => ({ ...prev, imageUrl: result.url }))
      }
    } catch (error) {
      console.error("Image upload failed:", error)
    } finally {
      setUploading(false)
    }
  }

  const handleStatusUpdate = (status: string) => {
    const currentDate = new Date().toISOString().split("T")[0]
    setFormData((prev) => ({
      ...prev,
      disconStatus: status,
      disconDate: status === "disconnected" ? currentDate : prev.disconDate,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const updatedConsumer: ConsumerData = {
      ...consumer,
      disconStatus: formData.disconStatus,
      disconDate: formData.disconDate,
      agency: formData.agency, // Allow agency update for admin
      notes: formData.notes,
      lastUpdated: new Date().toISOString().split("T")[0],
    }

    try {
      const response = await fetch("/api/consumers/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedConsumer),
      })

      if (response.ok) {
        onSave(updatedConsumer)
      } else {
        throw new Error("Failed to update consumer")
      }
    } catch (error) {
      console.error("Error updating consumer:", error)
      alert("Failed to update consumer. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFormData((prev) => ({ ...prev, image: file }))
      handleImageUpload(file)
    }
  }

  // const handleCameraCapture = async () => {
  //   try {
  //     const stream = await navigator.mediaDevices.getUserMedia({
  //       video: { facingMode: "environment" },
  //     })

  //     const video = document.createElement("video")
  //     video.srcObject = stream
  //     video.play()

  //     alert("Camera functionality would open here. In a real app, this would capture and upload the image.")

  //     stream.getTracks().forEach((track) => track.stop())
  //   } catch (error) {
  //     console.error("Camera access failed:", error)
  //     alert("Camera access denied or not available")
  //   }
  // }

  const handleCameraCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // Use back camera on phones
      });

      const videoElement = videoRef.current;
      if (videoElement) {
        videoElement.srcObject = stream;
        videoElement.play();
        setCameraActive(true);
      }
    } catch (error) {
      console.error("Camera access failed:", error);
      alert("Camera access denied or not available");
    }
  };


  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Button variant="ghost" onClick={onCancel} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Consumer List
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Update Consumer Details</h1>
        <p className="text-gray-600">
          Consumer: {consumer.name} ({consumer.consumerId})
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Consumer Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Consumer Information - Read Only */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Consumer Name</Label>
                    <Input id="name" value={consumer.name} disabled className="bg-gray-50" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="consumerId">Consumer ID</Label>
                    <Input id="consumerId" value={consumer.consumerId} disabled className="bg-gray-50" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" value={consumer.address} disabled className="bg-gray-50" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="outstandingDues">Outstanding Dues</Label>
                    <Input
                      id="outstandingDues"
                      value={`₹${Number.parseFloat(consumer.d2NetOS || "0").toLocaleString()}`}
                      disabled
                      className="bg-gray-50 text-red-600 font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dueDateRange">Due Date Range</Label>
                    <Input id="dueDateRange" value={consumer.osDuedateRange} disabled className="bg-gray-50" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="mobileNumber">Mobile Number</Label>
                    <Input
                      id="mobileNumber"
                      value={consumer.mobileNumber || "Not provided"}
                      disabled
                      className="bg-gray-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="device">Device</Label>
                    <Input id="device" value={consumer.device} disabled className="bg-gray-50" />
                  </div>
                </div>

                {/* Update Section */}
                <div className="pt-4 border-t">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Update Section</h3>

                  {/* Status Update Buttons */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Connection Status</Label>
                      <div className="flex space-x-4">
                        <Button
                          type="button"
                          variant={formData.disconStatus === "disconnected" ? "default" : "outline"}
                          className={`flex-1 ${
                            formData.disconStatus === "disconnected"
                              ? "bg-red-600 hover:bg-red-700 text-white"
                              : "border-red-600 text-red-600 hover:bg-red-50"
                          }`}
                          onClick={() => handleStatusUpdate("disconnected")}
                        >
                          <Power className="h-4 w-4 mr-2" />
                          DISCONNECTED
                        </Button>
                        <Button
                          type="button"
                          variant={formData.disconStatus === "pending" ? "default" : "outline"}
                          className={`flex-1 ${
                            formData.disconStatus === "pending"
                              ? "bg-yellow-600 hover:bg-yellow-700 text-white"
                              : "border-yellow-600 text-yellow-600 hover:bg-yellow-50"
                          }`}
                          onClick={() => handleStatusUpdate("pending")}
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          PENDING
                        </Button>
                      </div>
                      <p className="text-sm text-gray-600">
                        Current Status: <span className="font-medium">{formData.disconStatus}</span>
                        {formData.disconDate && (
                          <span className="ml-2">
                            | Date: <span className="font-medium">{formData.disconDate}</span>
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Agency Selection - Admin Only */}
                    {userRole === "admin" && (
                      <div className="space-y-2">
                        <Label htmlFor="agency">Agency</Label>
                        <select
                          id="agency"
                          value={formData.agency}
                          onChange={(e) => setFormData((prev) => ({ ...prev, agency: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          {availableAgencies.map((agency) => (
                            <option key={agency} value={agency}>
                              {agency}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        placeholder="Add any notes about the consumer..."
                        value={formData.notes}
                        onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                        rows={3}
                      />
                    </div>

                    {/* Image Upload */}
                    <div className="space-y-2">
                      <Label htmlFor="image">Upload Image</Label>
                      <div className="flex items-center space-x-4">
                        <div className="flex-1">
                          <Input
                            id="image"
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="hidden"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => document.getElementById("image")?.click()}
                            className="w-full"
                            disabled={uploading}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            {uploading ? "Uploading..." : formData.image ? formData.image.name : "Choose Image"}
                          </Button>
                        </div>
                        <Button type="button" variant="outline" onClick={handleCameraCapture} disabled={uploading}>
                          <Camera className="h-4 w-4" />
                        </Button>
                      </div>

                      {cameraActive && (
                        <div className="mt-4 space-y-2">
                          <div className="relative w-full max-w-sm h-64 bg-black rounded">
                            <video
                              ref={videoRef}
                              className="absolute inset-0 w-full h-full object-cover rounded"
                              autoPlay
                              playsInline
                            />
                          </div>

                          <Button
                            type="button"
                            onClick={async () => {
                              const video = videoRef.current;
                              if (video) {
                                const canvas = document.createElement("canvas");
                                canvas.width = video.videoWidth;
                                canvas.height = video.videoHeight;
                                canvas.getContext("2d")?.drawImage(video, 0, 0);

                                canvas.toBlob((blob) => {
                                  if (blob) {
                                    const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
                                    setFormData((prev) => ({ ...prev, image: file }));
                                    handleImageUpload(file);
                                  }
                                }, "image/jpeg");

                                const tracks = (video.srcObject as MediaStream)?.getTracks();
                                tracks?.forEach((track) => track.stop());
                                setCameraActive(false);
                              }
                            }}
                          >
                            Capture
                          </Button>
                        </div>
                      )}

                      {formData.imageUrl && (
                        <div className="mt-2">
                          <img
                            src={formData.imageUrl || "/placeholder.svg"}
                            alt="Uploaded"
                            className="w-32 h-32 object-cover rounded"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex space-x-4 pt-4">
                  <Button type="submit" className="flex-1" disabled={saving}>
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    className="flex-1 bg-transparent"
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Information Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700">Nature of Connection</p>
                  <p className="text-sm text-gray-900">{consumer.natureOfConn}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700">Gov/Non-Gov</p>
                  <p className="text-sm text-gray-900">{consumer.govNonGov}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700">Class</p>
                  <p className="text-sm text-gray-900">{consumer.class}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700">Base Class</p>
                  <p className="text-sm text-gray-900">{consumer.baseClass}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700">MRU</p>
                  <p className="text-sm text-gray-900">{consumer.mru}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700">Office Code</p>
                  <p className="text-sm text-gray-900">{consumer.offCode}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-700">Agency</p>
                  <p className="text-sm text-gray-900">{consumer.agency}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Location Info */}
          {consumer.latitude && consumer.longitude && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <MapPin className="h-4 w-4 mr-2" />
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <p className="text-sm font-medium text-gray-700">GIS Pole</p>
                    <p className="text-sm text-gray-900">{consumer.gisPole}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Latitude</p>
                    <p className="text-sm text-gray-900">{consumer.latitude}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Longitude</p>
                    <p className="text-sm text-gray-900">{consumer.longitude}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 bg-transparent"
                    onClick={() => {
                      const url = `https://www.google.com/maps?q=${consumer.latitude},${consumer.longitude}`
                      window.open(url, "_blank")
                    }}
                  >
                    View on Map
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
