"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Search,
  Edit,
  MapPin,
  Phone,
  Calendar,
  IndianRupee, 
  Filter,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react"
import { ConsumerForm } from "./consumer-form"
import { AdminPanel } from "./admin-panel"
import { DashboardStats } from "./dashboard-stats"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { ConsumerData } from "@/lib/google-sheets"

interface ConsumerListProps {
  userRole: string
  userAgencies: string[]
  onAdminClick: () => void
  showAdminPanel: boolean
  onCloseAdminPanel: () => void
}

const ITEMS_PER_PAGE = 16

type SortOrder = "none" | "asc" | "desc"

export function ConsumerList({
  userRole,
  userAgencies,
  onAdminClick,
  showAdminPanel,
  onCloseAdminPanel,
}: ConsumerListProps) {
  const [consumers, setConsumers] = useState<ConsumerData[]>([])
  const [agencies, setAgencies] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedConsumer, setSelectedConsumer] = useState<ConsumerData | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [osdRange, setOsdRange] = useState([0, 50000])
  const [maxOsdValue, setMaxOsdValue] = useState(50000)
  const [showFilters, setShowFilters] = useState(userRole === "test")
  const [sortByOSD, setSortByOSD] = useState<SortOrder>("none")
  const [filters, setFilters] = useState({
    agency: "All Agencies",
    address: "",
    name: "",
    consumerId: "",
    status: "All Status",
  })
  const [excludeFilters, setExcludeFilters] = useState({
    excludeDeemedDisconnection: false,
    excludeTemproryDisconnected: false,
  })

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        console.log("🔄 Starting to fetch consumers...")

        // Load consumers
        const consumersResponse = await fetch("/api/consumers", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        })

        if (!consumersResponse.ok) {
          throw new Error(`API Error: ${consumersResponse.status}`)
        }

        const data: ConsumerData[] = await consumersResponse.json()

        // Load agencies for admin
        let agencyList: string[] = []
        if (userRole === "admin") {
          try {
            const agenciesResponse = await fetch("/api/admin/agencies")
            if (agenciesResponse.ok) {
              const agencyData = await agenciesResponse.json()
              agencyList = agencyData.filter((a: any) => a.isActive).map((a: any) => a.name)
            }
          } catch (error) {
            console.warn("Failed to load agencies, using default list")
            agencyList = Array.from(new Set(data.map((c) => c.agency).filter(Boolean)))
          }
        } else {
          agencyList = userAgencies
        }

        setAgencies(agencyList)

        // Calculate max OSD value for slider
        const osdValues = data.map((c) => Number.parseFloat(c.d2NetOS || "0")).filter((v) => !isNaN(v))
        const maxOsd = Math.max(...osdValues, 50000)
        setMaxOsdValue(Math.ceil(maxOsd / 1000) * 1000)
        setOsdRange([0, Math.ceil(maxOsd / 1000) * 1000])

        // Filter consumers based on user role and agencies (case-insensitive)
        let filteredData = data
        if (userRole !== "admin") {
          filteredData = data.filter((consumer) => {
            const consumerAgency = (consumer.agency || "").toUpperCase()
            const userAgenciesUpper = userAgencies.map((a) => a.toUpperCase())
            return userAgenciesUpper.includes(consumerAgency) && consumer.disconStatus !== "&"
          })
        }

        setConsumers(filteredData)
      } catch (error) {
        console.error("💥 Error loading data:", error)
        setError(error instanceof Error ? error.message : "Unknown error occurred")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [userRole, userAgencies])

  // Advanced filtering logic
  const filteredConsumers = consumers.filter((consumer) => {
    // Basic search term filter
    const matchesSearch =
      !searchTerm ||
      consumer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      consumer.consumerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      consumer.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (consumer.agency || "").toLowerCase().includes(searchTerm.toLowerCase())

    // Agency filter (case-insensitive)
    const matchesAgency =
      filters.agency === "All Agencies" || (consumer.agency || "").toUpperCase() === filters.agency.toUpperCase()

    // Address fuzzy match
    const matchesAddress = !filters.address || consumer.address.toLowerCase().includes(filters.address.toLowerCase())

    // Name filter
    const matchesName = !filters.name || consumer.name.toLowerCase().includes(filters.name.toLowerCase())

    // Consumer ID exact match
    const matchesConsumerId =
      !filters.consumerId || consumer.consumerId.toLowerCase().includes(filters.consumerId.toLowerCase())

    // Status filter
    const matchesStatus = filters.status === "All Status" || consumer.disconStatus === filters.status

    // OSD range filter
    const consumerOsd = Number.parseFloat(consumer.d2NetOS || "0")
    const matchesOsdRange = consumerOsd >= osdRange[0] && consumerOsd <= osdRange[1]

    // Exclude filters
    const excludeDeemedDisconnection =
      !excludeFilters.excludeDeemedDisconnection || consumer.disconStatus.toLowerCase() !== "deemed disconnection"

    const excludeTemproryDisconnected =
      !excludeFilters.excludeTemproryDisconnected || !consumer.disconStatus.toLowerCase().includes("temprory")

    return (
      matchesSearch &&
      matchesAgency &&
      matchesAddress &&
      matchesName &&
      matchesConsumerId &&
      matchesStatus &&
      matchesOsdRange &&
      excludeDeemedDisconnection &&
      excludeTemproryDisconnected
    )
  })

  // Apply OSD sorting
  const sortedConsumers = [...filteredConsumers].sort((a, b) => {
    if (sortByOSD === "none") return 0

    const aOsd = Number.parseFloat(a.d2NetOS || "0")
    const bOsd = Number.parseFloat(b.d2NetOS || "0")

    if (sortByOSD === "asc") return aOsd - bOsd
    if (sortByOSD === "desc") return bOsd - aOsd
    return 0
  })

  // Pagination logic
  const totalPages = Math.ceil(sortedConsumers.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedConsumers = sortedConsumers.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters, searchTerm, osdRange, excludeFilters, sortByOSD])

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "connected":
        return "bg-green-100 text-green-800"
      case "disconnected":
        return "bg-red-100 text-red-800"
      case "pending":
        return "bg-yellow-100 text-yellow-800"
      case "deemed disconnection":
        return "bg-orange-100 text-orange-800"
      case "temprory disconnected":
      case "temprory disconnected":
        return "bg-purple-100 text-purple-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const handleUpdateConsumer = (updatedConsumer: ConsumerData) => {
    setConsumers((prev) =>
      prev
        .map((consumer) => (consumer.consumerId === updatedConsumer.consumerId ? updatedConsumer : consumer))
        .filter(
          (consumer) =>
            // Remove disconnected consumers from agency users' view
            userRole === "admin" || consumer.disconStatus !== "&",
        ),
    )
    setSelectedConsumer(null)
  }

  const clearFilters = () => {
    setFilters({
      agency: "All Agencies",
      address: "",
      name: "",
      consumerId: "",
      status: "All Status",
    })
    setSearchTerm("")
    setOsdRange([0, maxOsdValue])
    setExcludeFilters({
      excludeDeemedDisconnection: false,
      excludeTemproryDisconnected: false,
    })
    setSortByOSD("none")
    setCurrentPage(1)
  }

  const toggleOSDSort = () => {
    if (sortByOSD === "none") setSortByOSD("desc")
    else if (sortByOSD === "desc") setSortByOSD("asc")
    else setSortByOSD("none")
  }

  const getSortIcon = () => {
    if (sortByOSD === "asc") return <ArrowUp className="h-4 w-4" />
    if (sortByOSD === "desc") return <ArrowDown className="h-4 w-4" />
    return <ArrowUpDown className="h-4 w-4" />
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <DashboardStats consumers={[]} loading={true} />
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading consumer data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <DashboardStats consumers={[]} loading={false} />
        <div className="flex items-center justify-center py-12">
          <Alert variant="destructive" className="max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Error loading consumer data:</strong>
              <br />
              {error}
              <br />
              <Button
                variant="outline"
                size="sm"
                className="mt-2 bg-transparent"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  if (selectedConsumer) {
    return (
      <ConsumerForm
        consumer={selectedConsumer}
        onSave={handleUpdateConsumer}
        onCancel={() => setSelectedConsumer(null)}
        userRole={userRole}
        availableAgencies={agencies}
      />
    )
  }

  if (showAdminPanel && userRole === "admin") {
    return <AdminPanel onClose={onCloseAdminPanel} />
  }

  return (
    <div className="space-y-6">
      {/* Dashboard Statistics - Always visible */}
      <DashboardStats consumers={filteredConsumers} loading={false} />

      {/* Search and Filter Controls */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex items-center space-x-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search consumers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Sort by OSD Button */}
          <Button
            variant="outline"
            onClick={toggleOSDSort}
            className="flex items-center space-x-2 bg-transparent"
            title={`Sort by Outstanding Dues: ${sortByOSD === "none" ? "None" : sortByOSD === "asc" ? "Low to High" : "High to Low"}`}
          >
            {getSortIcon()}
            <span className="hidden sm:inline">Sort OSD</span>
          </Button>

          {/* Exclude Checkboxes - Hide on small mobile */}
          <div className="hidden sm:flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="excludeDeemedDisconnection"
                checked={excludeFilters.excludeDeemedDisconnection}
                onCheckedChange={(checked) =>
                  setExcludeFilters((prev) => ({ ...prev, excludeDeemedDisconnection: !!checked }))
                }
              />
              <label htmlFor="excludeDeemedDisconnection" className="text-sm text-gray-700">
                Exclude Deemed
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="excludeTemproryDisconnected"
                checked={excludeFilters.excludeTemproryDisconnected}
                onCheckedChange={(checked) =>
                  setExcludeFilters((prev) => ({ ...prev, excludeTemproryDisconnected: !!checked }))
                }
              />
              <label htmlFor="excludeTemproryDisconnected" className="text-sm text-gray-700">
                Exclude Temp
              </label>
            </div>
          </div>

          {/* Filter Button for Non-Admin */}
          {userRole !== "test" && (
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2"
            >
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
            </Button>
          )}

          {(Object.values(filters).some((f) => f !== "All Agencies" && f !== "All Status" && f !== "") ||
            searchTerm ||
            osdRange[0] !== 0 ||
            osdRange[1] !== maxOsdValue ||
            excludeFilters.excludeDeemedDisconnection ||
            excludeFilters.excludeTemproryDisconnected ||
            sortByOSD !== "none") && (
            <Button variant="ghost" onClick={clearFilters} size="sm">
              <X className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )}
        </div>

        {/* Mobile Exclude Checkboxes */}
        <div className="sm:hidden flex flex-col space-y-2 mb-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="excludeDeemedDisconnection-mobile"
              checked={excludeFilters.excludeDeemedDisconnection}
              onCheckedChange={(checked) =>
                setExcludeFilters((prev) => ({ ...prev, excludeDeemedDisconnection: !!checked }))
              }
            />
            <label htmlFor="excludeDeemedDisconnection-mobile" className="text-sm text-gray-700">
              Exclude Deemed Disconnection
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="excludeTemproryDisconnected-mobile"
              checked={excludeFilters.excludeTemproryDisconnected}
              onCheckedChange={(checked) =>
                setExcludeFilters((prev) => ({ ...prev, excludeTemproryDisconnected: !!checked }))
              }
            />
            <label htmlFor="excludeTemproryDisconnected-mobile" className="text-sm text-gray-700">
              Exclude Temprory Disconnected
            </label>
          </div>
        </div>

        {/* OSD Range Slider - Always Visible */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Outstanding Dues Range</label>
            <span className="text-sm text-gray-600">
              ₹{osdRange[0].toLocaleString()} - ₹{osdRange[1].toLocaleString()}
            </span>
          </div>
          <Slider
            value={osdRange}
            onValueChange={setOsdRange}
            max={maxOsdValue}
            min={0}
            step={100}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>₹0</span>
            <span>₹{maxOsdValue.toLocaleString()}</span>
          </div>
        </div>

        {/* Conditional Filters - Always visible for admin, toggleable for others */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 pt-4 border-t">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Agency</label>
              <Select
                value={filters.agency}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, agency: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Agencies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Agencies">All Agencies</SelectItem>
                  {agencies.map((agency) => (
                    <SelectItem key={agency} value={agency}>
                      {agency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Address</label>
              <Input
                placeholder="Filter by address"
                value={filters.address}
                onChange={(e) => setFilters((prev) => ({ ...prev, address: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Name</label>
              <Input
                placeholder="Filter by name"
                value={filters.name}
                onChange={(e) => setFilters((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Consumer ID</label>
              <Input
                placeholder="Search by ID"
                value={filters.consumerId}
                onChange={(e) => setFilters((prev) => ({ ...prev, consumerId: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Status</label>
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Status">All Status</SelectItem>
                  <SelectItem value="connected">Connected</SelectItem>
                  <SelectItem value="disconnected">Disconnected</SelectItem>
                  <SelectItem value="office team">Office Team</SelectItem>
                  <SelectItem value="bill dispute">Bill Dispute</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
          <span>
            Showing {startIndex + 1}-{Math.min(endIndex, sortedConsumers.length)} of {sortedConsumers.length} consumers
            {sortByOSD !== "none" && (
              <span className="ml-2 text-blue-600">
                (sorted by OSD: {sortByOSD === "asc" ? "Low to High" : "High to Low"})
              </span>
            )}
          </span>
          {(Object.values(filters).some((f) => f !== "All Agencies" && f !== "All Status" && f !== "") ||
            searchTerm ||
            osdRange[0] !== 0 ||
            osdRange[1] !== maxOsdValue ||
            excludeFilters.excludeDeemedDisconnection ||
            excludeFilters.excludeTemproryDisconnected ||
            sortByOSD !== "none") && <span className="text-blue-600">Filters active</span>}
        </div>
      </div>

      {/* Consumer Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {paginatedConsumers.map((consumer) => (
          <Card key={consumer.consumerId} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{consumer.name}</CardTitle>
                  <p className="text-sm text-gray-600">{consumer.consumerId}</p>
                </div>
                <div className="flex flex-col items-end space-y-1">
                  <Badge className={getStatusColor(consumer.disconStatus)}>{consumer.disconStatus}</Badge>
                  <Badge variant="outline" className="text-xs">
                    {consumer.agency}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start space-x-2">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-600">{consumer.address}</p>
              </div>
              {consumer.mobileNumber && (
                <a href={`tel:${consumer.mobileNumber}`} className="flex items-center space-x-2 hover:underline">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <p className="text-sm text-blue-600">{consumer.mobileNumber}</p>
                </a>
              )}
              {/*{consumer.mobileNumber && (
                <div className="flex items-center space-x-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <p className="text-sm text-gray-600">{consumer.mobileNumber}</p>
                </div>
              )}*/}

              <div className="flex items-center space-x-2">
                <IndianRupee className="h-4 w-4 text-gray-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-600">
                    ₹{Number.parseFloat(consumer.d2NetOS || "0").toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">Outstanding Dues</p>
                </div>
              </div>

              {consumer.osDuedateRange && (
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">{consumer.osDuedateRange}</p>
                    <p className="text-xs text-gray-500">Due Date Range</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div>
                  <span className="font-medium">Class:</span> {consumer.class}
                </div>
                <div>
                  <span className="font-medium">Device:</span> {consumer.device}
                </div>
              </div>

              {consumer.disconDate && (
                <div className="text-xs text-red-600">
                  <span className="font-medium">Disconnected:</span> {consumer.disconDate}
                </div>
              )}

              <Button onClick={() => setSelectedConsumer(consumer)} 
              className={`w-full mt-4 ${
                  (consumer.disconStatus.toLowerCase() === "disconnected" && userRole !== "admin") 
                    ? "bg-gray-100 text-gray-500 hover:bg-gray-100 cursor-not-allowed" 
                    : ""
                }`}
                size="sm"
                disabled={consumer.disconStatus.toLowerCase() === "disconnected" && userRole !== "admin"}
              >
                <Edit className={`h-4 w-4 mr-2 ${
                    (consumer.disconStatus.toLowerCase() === "disconnected" && userRole !== "admin") 
                      ? "text-gray-400" 
                      : ""
                  }`} />
                Enter Disconnection
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-sm text-gray-600">
            Page {currentPage} of {totalPages} ({sortedConsumers.length} total consumers)
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>

            <div className="flex items-center space-x-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }

                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="w-8 h-8 p-0"
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {sortedConsumers.length === 0 && consumers.length > 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No consumers found matching your search criteria.</p>
          <Button variant="outline" onClick={clearFilters} className="mt-4 bg-transparent">
            Clear all filters
          </Button>
        </div>
      )}

      {consumers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No consumer data available.</p>
        </div>
      )}
    </div>
  )
}
