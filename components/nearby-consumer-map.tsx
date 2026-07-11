"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, MapPin, Navigation, ArrowLeft, RefreshCw, X } from "lucide-react"
import type { ConsumerData } from "@/lib/google-sheets"

interface Props {
  consumers: ConsumerData[]
  onClose: () => void
  onGoToConsumer: (consumer: ConsumerData) => void
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const phi1 = lat1 * Math.PI / 180
  const phi2 = lat2 * Math.PI / 180
  const deltaPhi = (lat2 - lat1) * Math.PI / 180
  const deltaLambda = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Returns a color class string based on disconnection status
function getStatusColor(status: string): string {
  const s = (status || "").toLowerCase()
  if (s === "connected") return "#ef4444"          // red
  if (s === "disconnected") return "#22c55e"       // green
  if (s === "paid" || s === "agency paid") return "#16a34a" // dark green
  if (s === "visited") return "#f97316"            // orange
  if (s === "not found") return "#8b5cf6"          // purple
  if (s === "bill dispute" || s === "office team") return "#0ea5e9" // blue
  return "#64748b"                                  // slate default
}

export function NearbyConsumerMap({ consumers, onClose, onGoToConsumer }: Props) {
  const [range, setRange] = useState<number>(500)
  const [leafletLoaded, setLeafletLoaded] = useState(false)
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null)
  const [loadingLocation, setLoadingLocation] = useState(true)
  const [filterPending, setFilterPending] = useState(true)

  // Store callback in ref so Leaflet popup HTML can call it without stale closure
  const goToRef = useRef(onGoToConsumer)
  useEffect(() => { goToRef.current = onGoToConsumer }, [onGoToConsumer])

  // Expose a global bridge so Leaflet popup buttons can trigger the navigation
  useEffect(() => {
    ;(window as any).__nearbyConsumerGo = (consumerId: string) => {
      const consumer = consumers.find(c => c.consumerId === consumerId)
      if (consumer) goToRef.current(consumer)
    }
    return () => { delete (window as any).__nearbyConsumerGo }
  }, [consumers])

  // ── Load Leaflet dynamically from CDN ─────────────────────────────────────
  useEffect(() => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    document.head.appendChild(link)

    const script = document.createElement("script")
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    script.async = true
    document.body.appendChild(script)
    script.onload = () => setLeafletLoaded(true)

    return () => {
      if (document.head.contains(link)) document.head.removeChild(link)
      if (document.body.contains(script)) document.body.removeChild(script)
    }
  }, [])

  // ── GPS Location ──────────────────────────────────────────────────────────
  const fetchLocation = () => {
    setLoadingLocation(true)
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.")
      setUserCoords([25.452202, 88.021090])
      setLoadingLocation(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords([pos.coords.latitude, pos.coords.longitude])
        setLoadingLocation(false)
      },
      () => {
        alert("GPS location access denied. Centering on default coordinate.")
        setUserCoords([25.452202, 88.021090])
        setLoadingLocation(false)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  useEffect(() => {
    if (leafletLoaded) fetchLocation()
  }, [leafletLoaded])

  // ── Map Render ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userCoords || !leafletLoaded) return

    const L = (window as any).L
    if (!L) return

    let zoom = 16
    if (range >= 5000) zoom = 12
    else if (range >= 3000) zoom = 13
    else if (range >= 1500) zoom = 14
    else if (range >= 1000) zoom = 15

    const map = L.map("nearby-consumer-map-container").setView(userCoords, zoom)

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map)

    // Range circle
    L.circle(userCoords, {
      color: "#2563eb", fillColor: "#3b82f6",
      fillOpacity: 0.07, radius: range, weight: 1.5
    }).addTo(map)

    // User location pulsing marker
    L.marker(userCoords, {
      icon: L.divIcon({
        className: "custom-user-marker",
        html: `
          <div class="relative flex items-center justify-center h-5 w-5">
            <div class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></div>
            <div class="relative inline-flex rounded-full h-4 w-4 bg-blue-600 border-2 border-white shadow-md"></div>
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })
    }).addTo(map).bindTooltip("You are here", { permanent: false, direction: "top" })

    let nearestConsumer: { consumer: ConsumerData; lat: number; lng: number; dist: number } | null = null

    // Filter consumers with valid lat/long
    const withCoords = consumers.filter(c => {
      const lat = parseFloat(c.latitude || "")
      const lng = parseFloat(c.longitude || "")
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0
    })

    withCoords.forEach(consumer => {
      const lat = parseFloat(consumer.latitude!)
      const lng = parseFloat(consumer.longitude!)
      const distance = getDistanceMeters(userCoords[0], userCoords[1], lat, lng)

      if (distance > range) return

      const status = (consumer.disconStatus || "").toLowerCase()
      const isPending = ["connected", "visited", "not found"].includes(status)

      // "Pending Only" mode hides paid/disconnected consumers
      if (filterPending && !isPending) return

      if (!nearestConsumer || distance < nearestConsumer.dist) {
        nearestConsumer = { consumer, lat, lng, dist: distance }
      }

      const color = getStatusColor(consumer.disconStatus)
      const osd = Number.parseFloat(consumer.d2NetOS || "0").toLocaleString()

      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: "custom-consumer-marker",
          html: `
            <div style="
              padding: 2px 7px;
              background: ${color};
              border: 2px solid rgba(0,0,0,0.15);
              border-radius: 999px;
              font-size: 9px;
              font-weight: 800;
              font-family: monospace;
              color: white;
              white-space: nowrap;
              box-shadow: 0 1px 4px rgba(0,0,0,0.25);
              letter-spacing: 0.03em;
            ">
              ${consumer.consumerId}
            </div>
          `,
          iconAnchor: [20, 10]
        })
      }).addTo(map)

      // Escape consumer ID for HTML attribute safety
      const safeId = consumer.consumerId.replace(/"/g, "&quot;")

      marker.bindPopup(`
        <div style="font-family: system-ui, sans-serif; font-size: 12px; padding: 6px 8px; line-height: 1.6; color: #1e293b; min-width: 200px; max-width: 240px;">
          <p style="margin: 0 0 6px 0; font-weight: 800; font-size: 13px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">
            ${consumer.name}
          </p>
          <p style="margin: 2px 0; color: #475569;">ID: <strong style="color:#0f172a; font-family:monospace;">${consumer.consumerId}</strong></p>
          <p style="margin: 2px 0; color: #475569;">OSD: <strong style="color:#dc2626;">₹${osd}</strong></p>
          <p style="margin: 2px 0; color: #475569;">Class: <strong style="color:#0f172a;">${consumer.baseClass || consumer.class || "—"}</strong></p>
          <p style="margin: 2px 0; color: #475569;">Status: <strong style="color:${color}; text-transform:capitalize;">${consumer.disconStatus || "—"}</strong></p>
          <p style="margin: 2px 0; color: #475569;">Distance: <strong style="color:#0f172a;">${Math.round(distance)} m</strong></p>
          ${consumer.mobileNumber ? `<p style="margin: 2px 0; color: #475569;">Mobile: <a href="tel:${consumer.mobileNumber}" style="color:#2563eb;">${consumer.mobileNumber}</a></p>` : ""}
          <button
            type="button"
            style="margin-top: 10px; width: 100%; padding: 7px 0; background: #2563eb; color: #fff; font-weight: 700; font-size: 11px; border-radius: 8px; border: none; cursor: pointer;"
            onclick="window.__nearbyConsumerGo && window.__nearbyConsumerGo('${safeId}')"
          >
            Go to Card Update →
          </button>
        </div>
      `, { maxWidth: 260 })
    })

    // Nearest consumer dashed line + arrow
    if (nearestConsumer) {
      const nc = nearestConsumer as { consumer: ConsumerData; lat: number; lng: number; dist: number }
      L.polyline([userCoords, [nc.lat, nc.lng]], {
        color: "#ef4444", weight: 2, dashArray: "5,5", opacity: 0.85
      }).addTo(map)

      const midLat = (userCoords[0] + nc.lat) / 2
      const midLng = (userCoords[1] + nc.lng) / 2
      const dy = nc.lat - userCoords[0]
      const dx = Math.cos(Math.PI / 180 * userCoords[0]) * (nc.lng - userCoords[1])
      const angle = Math.atan2(dx, dy) * 180 / Math.PI

      L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: "direction-arrow-marker",
          html: `<div style="transform: rotate(${angle}deg); font-size: 15px; color: #ef4444; font-weight: bold; line-height: 1; text-shadow: 0 0 3px #fff;">▲</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        })
      }).addTo(map).bindTooltip(
        `Nearest: ${nc.consumer.consumerId} (${Math.round(nc.dist)}m)`,
        { permanent: true, direction: "top", className: "px-2 py-0.5 rounded bg-red-600 text-white font-mono text-[9px] font-bold border-none shadow-md" }
      )
    }

    return () => { map.remove() }
  }, [userCoords, range, consumers, leafletLoaded, filterPending])

  return (
    <div className="flex flex-col h-[80vh] w-full border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-xl relative animate-in fade-in duration-300">

      {/* Header */}
      <div className="bg-slate-900 text-white px-3 py-2 flex justify-between items-center z-40 gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-8 w-8 hover:bg-slate-800 text-white">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Navigation className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-bold tracking-tight">Nearby Consumer Radar</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Pending only toggle */}
          <Button
            variant="ghost"
            onClick={() => setFilterPending(!filterPending)}
            className={`h-7 px-2.5 text-[10px] font-bold rounded-lg border transition-all duration-200 ${
              filterPending
                ? "bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30 hover:text-orange-400"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
            }`}
          >
            {filterPending ? "Pending Only" : "Showing All"}
          </Button>

          {loadingLocation && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />}

          <Button
            variant="ghost"
            size="icon"
            onClick={fetchLocation}
            className="rounded-full h-8 w-8 text-slate-400 hover:text-white"
            title="Refresh GPS Location"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Legend bar */}
      <div className="bg-slate-800 px-3 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 shrink-0">
        {[
          { color: "#ef4444", label: "Connected" },
          { color: "#f97316", label: "Visited" },
          { color: "#22c55e", label: "Disconnected" },
          { color: "#16a34a", label: "Paid" },
          { color: "#8b5cf6", label: "Not Found" },
          { color: "#0ea5e9", label: "Dispute/Office" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-[10px] text-slate-300 font-medium">{label}</span>
          </div>
        ))}
      </div>

      {/* Map body */}
      <div className="flex-grow relative min-h-0 w-full bg-slate-100">
        {(!leafletLoaded || loadingLocation) && (
          <div className="absolute inset-0 bg-slate-50 flex flex-col items-center justify-center text-slate-500 text-sm gap-2.5 z-50">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="font-semibold text-xs">Retrieving GPS location &amp; loading map…</p>
          </div>
        )}
        <div id="nearby-consumer-map-container" className="absolute inset-0 w-full h-full z-10" />
      </div>

      {/* Range footer */}
      <div className="bg-slate-50 border-t px-4 py-3 flex items-center justify-between gap-4 z-40 w-full shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <MapPin className="h-4 w-4 text-red-500" />
          <span className="text-xs font-bold text-slate-700">
            Range: <span className="text-blue-600 font-mono font-extrabold">
              {range >= 1000 ? `${(range / 1000).toFixed(1)} km` : `${range}m`}
            </span>
          </span>
        </div>
        <div className="flex-grow max-w-xs sm:max-w-md">
          <input
            type="range"
            min="500"
            max="5000"
            step="500"
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
            disabled={loadingLocation}
          />
        </div>
      </div>
    </div>
  )
}
