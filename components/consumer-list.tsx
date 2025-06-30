"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ConsumerForm } from "./consumer-form"
import { AGENCIES } from "@/lib/google-sheets"
import type { ConsumerData } from "@/lib/google-sheets"
import {
  Search,
  Filter,
  RefreshCw,
  MapPin,
  Phone,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Users,
} from "lucide-react"

interface ConsumerListProps {
  consumers: ConsumerData[]
  userRole: string
  userAgency?: string
  onRefresh: () => void
  loading: boolean
}

type SortOrder = "none" | "high-to-low" | "low-to-high"

export function ConsumerList({ consumers, userRole, userAgency, onRefresh, loading }: ConsumerListProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedAgencies, setSelectedAgencies] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [excludeZeroOSD, setExcludeZeroOSD] = useState(false)
  const [excludeNoMobile, setExcludeNoMobile] = useState(false)
  const [selectedConsumer, setSelectedConsumer] = useState<ConsumerData | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortOrder, setSortOrder] = useState<SortOrder>("none")
  const itemsPerPage = 12

  // Get available agencies based on user role
  const availableAgencies = useMemo(() => {
    if (userRole === "admin") {
      return AGENCIES
    }
    return userAgency ? [userAgency] : []
  }, [userRole, userAgency])

  // Filter consumers based on user role and agency
  const accessibleConsumers = useMemo(() => {
    if (userRole === "admin") {
      return consumers
    }
    return consumers.filter((consumer) => consumer.agency === userAgency)
  }, [consumers, userRole, userAgency])

  // Apply filters and search
  const filteredConsumers = useMemo(() => {
    const filtered = accessibleConsumers.filter((consumer) => {
      const matchesSearch =
        consumer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        consumer.consumerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        consumer.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        consumer.mru.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesAgency = selectedAgencies.length === 0 || selectedAgencies.includes(consumer.agency || "")
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(consumer.disconStatus)

      const hasOSD = excludeZeroOSD ? Number.parseFloat(consumer.d2NetOS || "0") > 0 : true
      const hasMobile = excludeNoMobile ? consumer.mobileNumber && consumer.mobileNumber.trim() !== "" : true

      return matchesSearch && matchesAgency && matchesStatus && hasOSD && hasMobile
    })

    // Apply sorting
    if (sortOrder === "high-to-low") {
      filtered.sort((a, b) => Number.parseFloat(b.d2NetOS || "0") - Number.parseFloat(a.d2NetOS || "0"))
    } else if (sortOrder === "low-to-high") {
      filtered.sort((a, b) => Number.parseFloat(a.d2NetOS || "0") - Number.parseFloat(b.d2NetOS || "0"))
    }

    return filtered
  }, [accessibleConsumers, searchTerm, selectedAgencies, selectedStatuses, excludeZeroOSD, excludeNoMobile, sortOrder])

  // Pagination
  const totalPages = Math.ceil(filteredConsumers.length / itemsPerPage)
  const paginatedConsumers = filteredConsumers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const handleAgencyChange = (agency: string, checked: boolean) => {
    setSelectedAgencies((prev) => (checked ? [...prev, agency] : prev.filter((a) => a !== agency)))
    setCurrentPage(1)
  }

  const handleStatusChange = (status: string, checked: boolean) => {
    setSelectedStatuses((prev) => (checked ? [...prev, status] : prev.filter((s) => s !== status)))
    setCurrentPage(1)
  }

  const handleSortToggle = () => {
    const nextOrder: SortOrder =
      sortOrder === "none" ? "high-to-low" : sortOrder === "high-to-low" ? "low-to-high" : "none"
    setSortOrder(nextOrder)
  }

  const getSortIcon = () => {
    switch (sortOrder) {
      case "high-to-low":
        return <ArrowDown className="h-4 w-4" />
      case "low-to-high":
        return <ArrowUp className="h-4 w-4" />
      default:
        return <ArrowUpDown className="h-4 w-4" />
    }
  }

  const getSortLabel = () => {
    switch (sortOrder) {
      case "high-to-low":
        return "High to Low"
      case "low-to-high":
        return "Low to High"
      default:
        return "Sort by OSD"
    }
  }

  const handleConsumerSave = (updatedConsumer: ConsumerData) => {
    setSelectedConsumer(null)
    onRefresh()
  }

  if (selectedConsumer) {
    return (
      <ConsumerForm
        consumer={selectedConsumer}
        onSave={handleConsumerSave}
        onCancel={() => setSelectedConsumer(null)}
        userRole={userRole}
        availableAgencies={availableAgencies}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Search and Filter Controls */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Consumer Management
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button onClick={onRefresh} disabled={loading} variant="outline" size="sm">
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Syncing..." : "Refresh"}
              </Button>
              <Button
                onClick={handleSortToggle}
                variant="outline"
                size="sm"
                className="flex items-center gap-2 bg-transparent"
              >
                {getSortIcon()}
                <span className="hidden sm:inline">{getSortLabel()}</span>
                <span className="sm:hidden">Sort</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search by name, ID, address, or MRU..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              className="pl-10"
            />
          </div>

          {/* Filters */}
          <div className="space-y-4">
            {/* Agency Filter - Only show if admin or multiple agencies */}
            {userRole === "admin" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span className="font-medium">Agencies:</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {availableAgencies.map((agency) => (
                    <div key={agency} className="flex items-center space-x-2">
                      <Checkbox
                        id={`agency-${agency}`}
                        checked={selectedAgencies.includes(agency)}
                        onCheckedChange={(checked) => handleAgencyChange(agency, checked as boolean)}
                      />
                      <label
                        htmlFor={`agency-${agency}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {agency}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status Filter */}
            <div className="space-y-2">
              <span className="font-medium">Status:</span>
              <div className="flex flex-wrap gap-4">
                {["connected", "pending", "disconnected"].map((status) => (
                  <div key={status} className="flex items-center space-x-2">
                    <Checkbox
                      id={`status-${status}`}
                      checked={selectedStatuses.includes(status)}
                      onCheckedChange={(checked) => handleStatusChange(status, checked as boolean)}
                    />
                    <label
                      htmlFor={`status-${status}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer capitalize"
                    >
                      {status}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Exclude Options */}
            <div className="space-y-2">
              <span className="font-medium">Exclude:</span>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="exclude-zero-osd"
                    checked={excludeZeroOSD}
                    onCheckedChange={(checked) => {
                      setExcludeZeroOSD(checked as boolean)
                      setCurrentPage(1)
                    }}
                  />
                  <label
                    htmlFor="exclude-zero-osd"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Zero Outstanding Dues
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="exclude-no-mobile"
                    checked={excludeNoMobile}
                    onCheckedChange={(checked) => {
                      setExcludeNoMobile(checked as boolean)
                      setCurrentPage(1)
                    }}
                  />
                  <label
                    htmlFor="exclude-no-mobile"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    No Mobile Number
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Results Summary */}
          <div className="text-sm text-gray-600 border-t pt-4">
            Showing {paginatedConsumers.length} of {filteredConsumers.length} consumers
            {sortOrder !== "none" && (
              <span className="ml-2 text-blue-600">
                (sorted by OSD: {sortOrder === "high-to-low" ? "High to Low" : "Low to High"})
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Consumer Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {paginatedConsumers.map((consumer) => (
          <Card key={consumer.consumerId} className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{consumer.name}</CardTitle>
                  <p className="text-sm text-gray-600">ID: {consumer.consumerId}</p>
                  <p className="text-sm text-gray-600">MRU: {consumer.mru}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge
                    variant={
                      consumer.disconStatus === "disconnected"
                        ? "destructive"
                        : consumer.disconStatus === "pending"
                          ? "secondary"
                          : "default"
                    }
                  >
                    {consumer.disconStatus}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {consumer.agency || "UNASSIGNED"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <p className="text-sm text-gray-600 line-clamp-2">{consumer.address}</p>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-red-600">
                    ₹{Number.parseFloat(consumer.d2NetOS || "0").toLocaleString()}
                  </span>
                  <span className="text-xs text-gray-500">{consumer.osDuedateRange}</span>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  {consumer.mobileNumber && (
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      <span>{consumer.mobileNumber}</span>
                    </div>
                  )}
                  {consumer.lastUpdated && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{consumer.lastUpdated}</span>
                    </div>
                  )}
                </div>

                {consumer.latitude && consumer.longitude && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin className="h-3 w-3" />
                    <span>Location Available</span>
                  </div>
                )}
              </div>

              <Button onClick={() => setSelectedConsumer(consumer)} className="w-full" size="sm">
                Update Details
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center space-x-2">
          <Button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            variant="outline"
            size="sm"
          >
            Previous
          </Button>

          <div className="flex items-center space-x-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(currentPage - 2 + i, totalPages - 4 + i))
              return (
                <Button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  className="w-8 h-8 p-0"
                >
                  {pageNum}
                </Button>
              )
            })}
          </div>

          <Button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            variant="outline"
            size="sm"
          >
            Next
          </Button>
        </div>
      )}

      {filteredConsumers.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-gray-500">No consumers found matching your criteria.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
