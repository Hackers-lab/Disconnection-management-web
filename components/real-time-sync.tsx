"use client"

import { useEffect, useState } from "react"
import type { ConsumerData } from "@/lib/google-sheets"

interface RealTimeSyncProps {
  onDataUpdate: (data: ConsumerData[]) => void
}

export function RealTimeSync({ onDataUpdate }: RealTimeSyncProps) {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const eventSource = new EventSource("/api/consumers/sync")

    eventSource.onopen = () => {
      setConnected(true)
      console.log("Real-time sync connected")
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onDataUpdate(data)
      } catch (error) {
        console.error("Error parsing sync data:", error)
      }
    }

    eventSource.onerror = () => {
      setConnected(false)
      console.log("Real-time sync disconnected")
    }

    return () => {
      eventSource.close()
    }
  }, [onDataUpdate])

  return (
    <div className="flex items-center space-x-2 text-sm">
      <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
      <span className="text-gray-600">{connected ? "Live sync active" : "Sync disconnected"}</span>
    </div>
  )
}
