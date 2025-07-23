"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Users, Power, Clock, CheckCircle, AlertCircle, TrendingUp, ChevronDown, ChevronUp } from "lucide-react"
import type { ConsumerData } from "@/lib/google-sheets"
import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface DashboardStatsProps {
  consumers: ConsumerData[]
  loading?: boolean
}

interface Stats {
  total: number
  connected: number
  disconnected: number
  pending: number
  billDispute: number
  officeTeam: number
  totalOutstanding: number
}

interface AgencyReport {
  name: string
  total: number
  totalAmount: number
  disconnected: number
  disconnectedAmount: number
  paid: number
  paidAmount: number
  officeTeam: number
  officeTeamAmount: number
  billDispute: number
  billDisputeAmount: number
  notAttended: number
  notAttendedAmount: number
  performance: number
}

export function DashboardStats({ consumers, loading = false }: DashboardStatsProps) {
  const [isSliderOpen, setIsSliderOpen] = useState(false)

  // Calculate statistics
  const stats: Stats = {
    total: consumers.length,
    connected: 0,
    disconnected: 0,
    pending: 0,
    billDispute: 0,
    officeTeam: 0,
    totalOutstanding: 0,
  }

  const agencyReport: Record<string, AgencyReport> = {}

  consumers.forEach((consumer) => {
    const status = consumer.disconStatus.toLowerCase()
    const outstanding = Number.parseFloat(consumer.d2NetOS || "0")
    const agency = consumer.agency || "Unknown"

    if (!agencyReport[agency]) {
      agencyReport[agency] = {
        name: agency,
        total: 0,
        totalAmount: 0,
        disconnected: 0,
        disconnectedAmount: 0,
        paid: 0,
        paidAmount: 0,
        officeTeam: 0,
        officeTeamAmount: 0,
        billDispute: 0,
        billDisputeAmount: 0,
        notAttended: 0,
        notAttendedAmount: 0,
        performance: 0,
      }
    }

    agencyReport[agency].total++
    agencyReport[agency].totalAmount += outstanding
    stats.totalOutstanding += outstanding

    switch (status) {
      case "connected":
        stats.connected++
        agencyReport[agency].notAttended++
        agencyReport[agency].notAttendedAmount += outstanding
        break
      case "paid":
        agencyReport[agency].paid++
        agencyReport[agency].paidAmount += outstanding
        break
      case "disconnected":
        stats.disconnected++
        agencyReport[agency].disconnected++
        agencyReport[agency].disconnectedAmount += outstanding
        break
      case "office team":
        stats.pending++
        stats.officeTeam++
        agencyReport[agency].officeTeam++
        agencyReport[agency].officeTeamAmount += outstanding
        break
      case "bill dispute":
        stats.billDispute++
        agencyReport[agency].billDispute++
        agencyReport[agency].billDisputeAmount += outstanding
        break
      default:
        agencyReport[agency].notAttended++
        agencyReport[agency].notAttendedAmount += outstanding
    }
  })

  // Calculate performance and sort
  const agencyReportData = Object.values(agencyReport)
    .map(agency => ({
      ...agency,
      performance: agency.totalAmount > 0 
        ? ((agency.paidAmount + agency.disconnectedAmount) / agency.totalAmount) * 100
        : 0
    }))
    .sort((a, b) => b.performance - a.performance)

  const getPerformanceColor = (performance: number) => {
    if (performance >= 80) return "bg-green-50 text-green-800"
    if (performance >= 60) return "bg-blue-50 text-blue-800"
    if (performance >= 40) return "bg-yellow-50 text-yellow-800"
    return "bg-red-50 text-red-800"
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center p-4 bg-gray-100 rounded-lg cursor-pointer">
          <h3 className="font-medium">Dashboard Statistics</h3>
          <ChevronDown className="h-5 w-5" />
        </div>
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
      title: "Office Team",
      value: stats.pending.toLocaleString(),
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
    },
    {
      title: "Bill Dispute",
      value: stats.billDispute.toLocaleString(),
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
    <div className="space-y-4">
      <div 
        className="flex justify-between items-center p-4 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200"
        onClick={() => setIsSliderOpen(!isSliderOpen)}
      >
        <h3 className="font-medium">Dashboard Statistics</h3>
        {isSliderOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </div>

      {isSliderOpen && (
        <div className="space-y-6">
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

          <div className="bg-white rounded-lg border overflow-hidden shadow-md text-[1px] font-sans">
            <Table className="compact-table">
              <TableHeader className="bg-white-50">
                {/* Main Header Row */}
                <TableRow className="border-b h-1">
                  <TableHead className="w-[100px] border-r" rowSpan={2}>Agency</TableHead>
                  <TableHead className="text-center border-r px-0.1" colSpan={2}>Total</TableHead>
                  <TableHead className="text-center border-r px-0.1" colSpan={2}>Disconnected</TableHead>
                  <TableHead className="text-center border-r px-0.1" colSpan={2}>Paid</TableHead>
                  <TableHead className="text-center border-r px-0.1" colSpan={2}>Office Team</TableHead>
                  <TableHead className="text-center border-r px-0.1" colSpan={2}>Bill Dispute</TableHead>
                  <TableHead className="text-center border-r px-0.1" colSpan={2}>Not Attended</TableHead>
                  <TableHead className="text-center w-[80px] px-0.1" rowSpan={2}>Performance</TableHead>
                </TableRow>
                
                {/* Sub-header Row */}
                <TableRow className="border-b h-1">
                  {/* Total */}
                  <TableHead className="text-center border-r bg-gray-100 px-0.1 w-[40px]">Count</TableHead>
                  <TableHead className="text-center border-r bg-white-100 px-0.1 w-[40px]">Amount</TableHead>
                  
                  {/* Disconnected */}
                  <TableHead className="text-center border-r bg-grey px-0.1 w-[40px]">Count</TableHead>
                  <TableHead className="text-center border-r bg-white px-0.1 w-[40px]">Amount</TableHead>
                  
                  {/* Paid */}
                  <TableHead className="text-center border-r bg-gray-100 px-0.1 w-[40px]">Count</TableHead>
                  <TableHead className="text-center border-r bg-white-100 px-0.1 w-[40px]">Amount</TableHead>
                  
                  {/* Office Team */}
                  <TableHead className="text-center border-r bg-gray px-0.1 w-[40px]">Count</TableHead>
                  <TableHead className="text-center border-r bg-white px-0.1 w-[40px]">Amount</TableHead>
                  
                  {/* Bill Dispute */}
                  <TableHead className="text-center border-r bg-gray-100 px-0.1 w-[40px]">Count</TableHead>
                  <TableHead className="text-center border-r bg-white-100 px-0.1 w-[40px]">Amount</TableHead>
                  
                  {/* Not Attended */}
                  <TableHead className="text-center border-r bg-gray px-0.1 w-[40px]">Count</TableHead>
                  <TableHead className="text-center px-0.1 bg-white w-[40px]">Amount</TableHead>
                </TableRow>
              </TableHeader>
              
              <TableBody>
                {agencyReportData.map((agency) => (
                  <TableRow key={agency.name} className="hover:bg-gray-50 border-b h-1">
                    {/* Agency Name */}
                    <TableCell className="font-medium border-r px-2 sticky left-0 text-xs">
                      {agency.name}
                    </TableCell>
                    
                    {/* Total */}
                    <TableCell className="text-center border-r px-0.1 bg-gray-50">{agency.total}</TableCell>
                    <TableCell className="text-center border-r px-0.1 bg-white-50">₹{agency.totalAmount.toLocaleString()}</TableCell>
                    
                    {/* Disconnected */}
                    <TableCell className="text-center border-r px-0.1 bg-gray-50">{agency.disconnected}</TableCell>
                    <TableCell className="text-center border-r px-0.1 bg-white">₹{agency.disconnectedAmount.toLocaleString()}</TableCell>
                    
                    {/* Paid */}
                    <TableCell className="text-center border-r px-0.1 bg-gray-50">{agency.paid}</TableCell>
                    <TableCell className="text-center border-r px-0.1 bg-white-50">₹{agency.paidAmount.toLocaleString()}</TableCell>
                    
                    {/* Office Team */}
                    <TableCell className="text-center border-r px-0.1 bg-gray-50">{agency.officeTeam}</TableCell>
                    <TableCell className="text-center border-r px-0.1 bg-white">₹{agency.officeTeamAmount.toLocaleString()}</TableCell>
                    
                    {/* Bill Dispute */}
                    <TableCell className="text-center border-r px-0.1 bg-gray-50">{agency.billDispute}</TableCell>
                    <TableCell className="text-center border-r px-0.1 bg-white-50">₹{agency.billDisputeAmount.toLocaleString()}</TableCell>
                    
                    {/* Not Attended */}
                    <TableCell className="text-center border-r px-0.1 bg-gray-50">{agency.notAttended}</TableCell>
                    <TableCell className="text-center border-r px-0.1 bg-white">₹{agency.notAttendedAmount.toLocaleString()}</TableCell>
                    
                    {/* Performance */}
                    <TableCell className={`text-center border-r px-0.1 font-medium ${getPerformanceColor(agency.performance)} bg-gray-50`}>
                      {(agency.performance).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}