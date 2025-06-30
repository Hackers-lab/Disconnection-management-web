"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Users, Power, Clock, CheckCircle, AlertCircle, TrendingUp } from "lucide-react"
import type { ConsumerData } from "@/lib/google-sheets"

interface DashboardStatsProps {
  consumers: ConsumerData[]
  loading?: boolean
}

interface Stats {
  total: number
  connected: number
  disconnected: number
  pending: number
  deemedDisconnection: number
  temporaryDisconnected: number
  totalOutstanding: number
}

export function DashboardStats({ consumers, loading = false }: DashboardStatsProps) {
  // Calculate statistics from provided consumers
  const stats: Stats = {
    total: consumers.length,
    connected: 0,
    disconnected: 0,
    pending: 0,
    deemedDisconnection: 0,
    temporaryDisconnected: 0,
    totalOutstanding: 0,
  }

  consumers.forEach((consumer) => {
    const status = consumer.disconStatus.toLowerCase()
    const outstanding = Number.parseFloat(consumer.d2NetOS || "0")

    stats.totalOutstanding += outstanding

    switch (status) {
      case "connected":
        stats.connected++
        break
      case "disconnected":
        stats.disconnected++
        break
      case "pending":
        stats.pending++
        break
      case "deemed disconnection":
        stats.deemedDisconnection++
        break
      case "temporary disconnected":
      case "temprory disconnected":
        stats.temporaryDisconnected++
        break
    }
  })

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-3">
              <div className="h-3 bg-gray-200 rounded mb-2"></div>
              <div className="h-6 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const statCards = [
    {
      title: "Total",
      value: stats.total.toLocaleString(),
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Connected",
      value: stats.connected.toLocaleString(),
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Disconnected",
      value: stats.disconnected.toLocaleString(),
      icon: Power,
      color: "text-red-600",
      bgColor: "bg-red-50",
    },
    {
      title: "Pending",
      value: stats.pending.toLocaleString(),
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
    },
    {
      title: "Deemed Disconnection",
      value: stats.deemedDisconnection.toLocaleString(),
      icon: AlertCircle,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      title: "Total Outstanding",
      value: `₹${stats.totalOutstanding.toLocaleString()}`,
      icon: TrendingUp,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
      {statCards.map((stat, index) => (
        <Card key={index} className="hover:shadow-md transition-shadow">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">{stat.title}</p>
                <p className="text-lg font-bold text-gray-900">{stat.value}</p>
              </div>
              <div className={`p-1.5 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
