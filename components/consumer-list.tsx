"use client"


import React, { useImperativeHandle, useRef } from "react"  
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Calendar as CalendarIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import {
  Search,
  Edit,
  MapPin,
  Phone,
  IndianRupee, 
  Filter,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Database,
  Cloud,
  RefreshCw,
  Trash2,
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
  onDownload: () => void
  onDownloadDefaulters: () => void
}
interface ConsumerListRef {  // <-- Add this interface
  getCurrentConsumers: () => ConsumerData[]
}

// IndexedDB Helper Functions to handle large datasets (>5MB)
const DB_NAME = "DisconnectionAppDB"
const STORE_NAME = "keyval"

function openDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  } catch (error) {
    console.warn(`Error reading ${key} from cache:`, error)
    return null
  }
}

async function saveToCache(key: string, data: any) {
  try {
    const db = await openDB()
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(data, key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } catch (error) {
    console.warn(`Error saving ${key} to cache:`, error)
  }
}

const ITEMS_PER_PAGE = 12

type SortOrder = "none" | "asc" | "desc"

const ConsumerList = React.forwardRef<ConsumerListRef, ConsumerListProps>(
  (props, ref) => {
  const { userRole, userAgencies, onAdminClick, showAdminPanel, onCloseAdminPanel } = props
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
  const [dateFilter, setDateFilter] = useState<{
    from: Date | null
    to: Date | null
    isActive: boolean
  }>({
    from: null,
    to: null,
    isActive: false
  })
  const [filters, setFilters] = useState({
    agency: "All Agencies",
    mru: "All MRUs",
    address: "",
    name: "",
    consumerId: "",
    status: (userRole === "admin" || userRole === "executive" || userRole === "viewer") ? "All Status" : "connected",
    baseClass: "All Classes",
  })
  const [excludeFilters, setExcludeFilters] = useState({
    excludeDeemedDisconnection: false,
    excludeTemproryDisconnected: false,
  })
  const [baseClasses, setBaseClasses] = useState<string[]>([])
  const [mrus, setMrus] = useState<string[]>([])
  const [isCachedData, setIsCachedData] = useState(false)
  const [isBackgroundUpdating, setIsBackgroundUpdating] = useState(false)

  const consumersRef = useRef<ConsumerData[]>(consumers)
  useEffect(() => {
    consumersRef.current = consumers
  }, [consumers])
          
  useEffect(() => {
    const CACHE_KEY = "consumers_data_cache"
    const AGENCY_CACHE_KEY = "agencies_data_cache"

    async function processData(data: ConsumerData[], preloadedAgencies: string[] | null = null, isBackgroundUpdate = false) {
      // Merge local pending/error states with incoming network data to prevent "Silent Reversion"
      if (isBackgroundUpdate) {
        data = data.map(newC => {
          const existing = consumersRef.current.find(c => c.consumerId === newC.consumerId)
          if (existing && (existing._syncStatus === 'syncing' || existing._syncStatus === 'error')) {
            return existing
          }
          return newC
        })
      }

      // Debug: Check for image property existence to help troubleshoot missing images
      if (data.length > 0 && !isBackgroundUpdate) {
        const sampleWithImage = data.find(c => c.imageUrl || (c as any).image);
        if (sampleWithImage) {
           console.log("📸 Image found in data for consumer:", sampleWithImage.consumerId);
        } else {
           console.log("⚠️ No 'imageUrl' or 'image' property found in data. Available keys:", Object.keys(data[0]));
        }
      }

      // Extract unique baseClasses (ignore empty/null)
      const uniqueBaseClasses = Array.from(
        new Set(
          data
            .map(c => (c.baseClass || "").toUpperCase().trim())
            .filter(bc => bc !== "")
        )
      ).sort()
      setBaseClasses(uniqueBaseClasses)

      // Load agencies for admin
      let agencyList: string[] = []
      if (preloadedAgencies && preloadedAgencies.length > 0) {
        agencyList = preloadedAgencies
      } else if (userRole === "admin" || userRole === "viewer") {
        // Fallback fetch if not preloaded
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
      const calculatedMax = Math.ceil(maxOsd / 1000) * 1000
      setMaxOsdValue(calculatedMax)
      
      // Only reset the range slider on initial load, not during background updates
      if (!isBackgroundUpdate) {
        setOsdRange([0, calculatedMax])
      }

      // Filter consumers based on user role and agencies (case-insensitive)
      let filteredData = data

      if (userRole !== "admin" && userRole !== "viewer") {
        const userAgenciesUpper = userAgencies.map((a) => a.toUpperCase())

        if (userRole === "executive") {
          // Executive: their agencies + any "bill dispute"
          filteredData = data.filter((consumer) => {
            const consumerAgency = (consumer.agency || "").toUpperCase()
            const isOwnAgency = userAgenciesUpper.includes(consumerAgency)
            const isBillDispute = consumer.disconStatus?.toLowerCase() === "bill dispute"
            return (isOwnAgency || isBillDispute) && consumer.disconStatus !== "&"
          })
        } else {
          // Normal agency user
          filteredData = data.filter((consumer) => {
            const consumerAgency = (consumer.agency || "").toUpperCase()
            return userAgenciesUpper.includes(consumerAgency) && consumer.disconStatus !== "&"
          })
        }
      }
      const uniqueMrus = Array.from(
        new Set(
          filteredData
            .map(c => (c.mru || "").trim())
            .filter(m => m !== "")
        )
      ).sort()
      setMrus(uniqueMrus)

      setConsumers(filteredData)
    }

    async function loadData() {
      // Try to load from cache first
      let cachedLoaded = false
      try {
        // Use IndexedDB instead of localStorage
        const cachedConsumers = await getFromCache<ConsumerData[]>(CACHE_KEY)
        
        let cachedAgencies: string[] | null = null
        if (userRole === "admin" || userRole === "viewer") {
          cachedAgencies = await getFromCache<string[]>(AGENCY_CACHE_KEY)
        }

        if (cachedConsumers && Array.isArray(cachedConsumers) && cachedConsumers.length > 0) {
          console.log("✅ [Cache Hit] Loaded from IndexedDB")
          await processData(cachedConsumers, cachedAgencies, false)
          setLoading(false)
          cachedLoaded = true
          setIsCachedData(true)
        }
      } catch (e) {
        console.error("Cache load failed", e)
      }

      if (!cachedLoaded) setLoading(true)
      else setIsBackgroundUpdating(true)
      setError(null)

      try {
        console.log("🔄 [Network] Fetching fresh data...")
        // Load consumers
        const promises: Promise<Response>[] = [
          fetch("/api/consumers", {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
          })
        ]

        // Parallel fetch for agencies if admin
        if (userRole === "admin" || userRole === "viewer") {
          promises.push(fetch("/api/admin/agencies"))
        }

        const responses = await Promise.all(promises)
        const consumersResponse = responses[0]

        if (!consumersResponse.ok) {
          throw new Error(`API Error: ${consumersResponse.status}`)
        }

        const data: ConsumerData[] = await consumersResponse.json()
        console.log("✅ [Network] Downloaded fresh data")

        // Handle Agencies
        let freshAgencies: string[] | null = null
        if (userRole === "admin" || userRole === "viewer") {
          if (responses[1] && responses[1].ok) {
            const agencyData = await responses[1].json()
            freshAgencies = agencyData.filter((a: any) => a.isActive).map((a: any) => a.name)
            // Cache agencies
            await saveToCache(AGENCY_CACHE_KEY, freshAgencies)
          }
        }

        // Update cache
        try {
          await saveToCache(CACHE_KEY, data)
        } catch (e) {
          console.warn("Cache save failed", e)
        }

        // Process fresh data (pass true if we already loaded cache to avoid resetting UI state like slider)
        await processData(data, freshAgencies, cachedLoaded)
        setIsCachedData(false)

      } catch (error) {
        console.error("💥 Error loading data:", error)
        if (!cachedLoaded) {
          setError(error instanceof Error ? error.message : "Unknown error occurred")
        }
      } finally {
        setLoading(false)
        setIsBackgroundUpdating(false)
      }
    }

    loadData()
  }, [userRole, userAgencies])

  const clearCache = async () => {
    if (confirm("Are you sure you want to clear the cache and reload?")) {
      try {
        const db = await openDB()
        const transaction = db.transaction(STORE_NAME, "readwrite")
        const store = transaction.objectStore(STORE_NAME)
        const request = store.clear()
        request.onsuccess = () => window.location.reload()
      } catch (e) {
        console.error("Failed to clear cache", e)
      }
    }
  }

  // Advanced filtering logic
  const filteredConsumers = consumers.filter((consumer) => {
    // Basic search term filter
    // Date range filter  
    function normalizeDate(dateValue: string | Date | null | undefined): string | null {
      if (!dateValue) return null;

      // If it's already a Date object
      if (dateValue instanceof Date) {
        return dateValue.toISOString().split('T')[0]; // YYYY-MM-DD
      }

      // If it's a string in YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return dateValue; // already in correct format
      }

      // If it's a string in DD-MM-YYYY format
      if (/^\d{2}-\d{2}-\d{4}$/.test(dateValue)) {
        const [day, month, year] = dateValue.split("-");
        return `${year}-${month}-${day}`; // convert to YYYY-MM-DD
      }

      // If it's some other format, try to parse
      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }

      return null; // Unknown format
    }


    const matchesDateRange =
      !dateFilter.isActive ||
      (() => {
        const disconDateNorm = normalizeDate(consumer.disconDate);
        const fromNorm = normalizeDate(dateFilter.from);
        const toNorm = normalizeDate(dateFilter.to);

        if (!disconDateNorm) return false; // skip if no valid date

        return (
          (!fromNorm || disconDateNorm >= fromNorm) &&
          (!toNorm || disconDateNorm <= toNorm)
        );
      })();

    const matchesSearch =
      !searchTerm ||
      consumer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      consumer.consumerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      consumer.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      consumer.device.toLowerCase().includes(searchTerm.toLowerCase()) ||
      consumer.mobileNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (consumer.agency || "").toLowerCase().includes(searchTerm.toLowerCase())
    

    // Base class filter
    const matchesBaseClass = 
      filters.baseClass === "All Classes" || 
      (consumer.baseClass || "").toUpperCase() === filters.baseClass.toUpperCase()
    // Agency filter (case-insensitive)
    const matchesAgency =
      filters.agency === "All Agencies" || (consumer.agency || "").toUpperCase() === filters.agency.toUpperCase()

    const matchesMru = 
      filters.mru === "All MRUs" || (consumer.mru || "") === filters.mru

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
      matchesMru &&
      matchesAddress &&
      matchesBaseClass &&
      matchesName &&
      matchesConsumerId &&
      matchesStatus &&
      matchesOsdRange &&
      matchesDateRange &&
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

    // Helper to ensure links work even if "https://" is missing in the sheet
  const getValidUrl = (url: string | undefined) => {
    if (!url) return "#";
    const cleanUrl = url.trim();
    if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
      return cleanUrl;
    }
    return `https://${cleanUrl}`;
  };

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
        return "bg-purple-100 text-purple-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }



  const handleUpdateConsumer = async (updatedConsumer: ConsumerData) => {
    // 1. Optimistic Update: Mark as syncing and update local state/cache immediately
    const syncingConsumer = { ...updatedConsumer, _syncStatus: 'syncing' as const };
    
    setConsumers((prev) => {
      const newList = prev
        .map((c) => (c.consumerId === updatedConsumer.consumerId ? syncingConsumer : c))
        .filter((c) => userRole === "admin" || c.disconStatus !== "&");
      saveToCache("consumers_data_cache", newList);
      return newList;
    });
    setSelectedConsumer(null);

    // 2. Background Sync with Retry Logic
    const attemptSync = async (data: ConsumerData, retriesLeft: number) => {
      try {
        const response = await fetch("/api/consumers/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (!response.ok) throw new Error("Update failed");

        // Success: Clear sync status
        setConsumers((prev) => {
          const newList = prev.map((c) => 
            c.consumerId === data.consumerId ? { ...data, _syncStatus: undefined } : c
          );
          saveToCache("consumers_data_cache", newList);
          return newList;
        });
      } catch (error) {
        if (retriesLeft > 0) {
          console.warn(`Sync failed for ${data.consumerId}. Retrying in 5s...`);
          setTimeout(() => attemptSync(data, retriesLeft - 1), 5000);
        } else {
          // Permanent Failure: Mark as error
          setConsumers((prev) => {
            const newList = prev.map((c) => 
              c.consumerId === data.consumerId ? { ...data, _syncStatus: 'error' as const } : c
            );
            saveToCache("consumers_data_cache", newList);
            return newList;
          });
        }
      }
    };

    attemptSync(updatedConsumer, 3);
  }

  const clearFilters = () => {
    setFilters({
      agency: "All Agencies",
      address: "",
      mru: "All MRUs",
      name: "",
      consumerId: "",
      status: "All Status",
      baseClass: "All Classes",
    })
    setSearchTerm("")
    setOsdRange([0, maxOsdValue])
    setExcludeFilters({
      excludeDeemedDisconnection: false,
      excludeTemproryDisconnected: false,
    })
    setSortByOSD("none")
    setDateFilter({
      from: null,
      to: null,
      isActive: false
    })
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

  useImperativeHandle(ref, () => ({
    getCurrentConsumers: () => filteredConsumers,
  }));

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
        {/* Responsive filter/search row */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4 mb-4">
          {/* Search field */}
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search id, name, address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filter/sort controls */}
          <div className="flex flex-wrap gap-2 items-center mt-2 md:mt-0">
            {/* Date Filter Button */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`flex items-center space-x-2 bg-transparent ${dateFilter.isActive ? "bg-blue-50 border-blue-300" : ""}`}
                >
                  <CalendarIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Dates</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-2 rounded-lg shadow-md">
                <div className="space-y-4 text-xs">
                  <div className="flex gap-2">
                    <div className="space-y-1 flex-1">
                      <label className="text-[10px] text-gray-600 font-medium">From</label>
                      <Input
                        type="date"
                        value={dateFilter.from?.toISOString().split('T')[0] || ''}
                        onChange={(e) =>
                          setDateFilter((prev) => ({
                            ...prev,
                            from: e.target.value ? new Date(e.target.value) : null,
                            isActive: true,
                          }))
                        }
                        className="h-7 text-xs px-2 w-full"
                      />
                    </div>
                    <div className="space-y-1 flex-1">
                      <label className="text-[10px] text-gray-600 font-medium">To</label>
                      <Input
                        type="date"
                        value={dateFilter.to?.toISOString().split('T')[0] || ''}
                        onChange={(e) =>
                          setDateFilter((prev) => ({
                            ...prev,
                            to: e.target.value ? new Date(e.target.value) : null,
                            isActive: true,
                          }))
                        }
                        className="h-7 text-xs px-2 w-full"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setDateFilter({ from: null, to: null, isActive: false })}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Base Class Filter */}
            <div>
              <Select
                value={filters.baseClass}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, baseClass: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Classes">All Classes</SelectItem>
                  {baseClasses.map((bc) => (
                    <SelectItem key={bc} value={bc}>
                      {bc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            {/* Clear Filters Button */}
            {(Object.values(filters).some((f) => f !== "All Agencies" && f !== "All Status" && f !== "All Classes" && f !== "") ||
              searchTerm ||
              osdRange[0] !== 0 ||
              osdRange[1] !== maxOsdValue ||
              excludeFilters.excludeDeemedDisconnection ||
              excludeFilters.excludeTemproryDisconnected ||
              dateFilter.isActive ||
              sortByOSD !== "none") && (
              <Button variant="ghost" onClick={clearFilters} size="sm">
                <X className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            )}
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
            step={1000}
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

            {/* <div className="space-y-2">
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
            </div> */}

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
                  <SelectItem value="Paid">Paid</SelectItem>
                  <SelectItem value="agency paid">Agency Paid</SelectItem>
                  <SelectItem value="not found">Not Found</SelectItem>
                </SelectContent>
              </Select>
            </div>
{/* 6. Insert MRU Filter Here */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">MRU</label>
              <Select
                value={filters.mru}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, mru: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All MRUs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All MRUs">All MRUs</SelectItem>
                  {mrus.map((mru) => (
                    <SelectItem key={mru} value={mru}>
                      {mru}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
          <div className="flex items-center gap-2 flex-wrap">
            Showing {startIndex + 1}-{Math.min(endIndex, sortedConsumers.length)} of {sortedConsumers.length} consumers
            
            {isCachedData ? (
              <div className="flex items-center gap-1">
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 gap-1 font-normal text-gray-500">
                  <Database className="h-3 w-3" /> Cached
                </Badge>
                <Button variant="ghost" size="icon" className="h-5 w-5 text-gray-400 hover:text-red-500" onClick={clearCache} title="Clear Cache">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 font-normal bg-green-50 text-green-700 border-green-200">
                <Cloud className="h-3 w-3" /> Live
              </Badge>
            )}
            
            {isBackgroundUpdating && (
              <span className="flex items-center text-xs text-blue-600 animate-pulse ml-1">
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Updating...
              </span>
            )}

            {sortByOSD !== "none" && (
              <span className="ml-2 text-blue-600">
                (sorted by OSD: {sortByOSD === "asc" ? "Low to High" : "High to Low"})
              </span>
            )}
            {dateFilter.isActive && (
              <span className="ml-2 text-blue-600">
                (date range: {dateFilter.from ? format(dateFilter.from, 'MMM dd, yyyy') : ''} 
                {dateFilter.to ? ` to ${format(dateFilter.to, 'MMM dd, yyyy')}` : ''})
              </span>
            )}
          </div>
          {(Object.values(filters).some((f) => f !== "All Agencies" && f !== "All Status" && f !== "") ||
            searchTerm ||
            osdRange[0] !== 0 ||
            osdRange[1] !== maxOsdValue ||
            dateFilter.isActive ||
            excludeFilters.excludeDeemedDisconnection ||
            excludeFilters.excludeTemproryDisconnected ||
            sortByOSD !== "none") && <span className="text-blue-600">Filters active</span>}
        </div>
      </div>

      {/* Consumer Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {paginatedConsumers.map((consumer) => (
          <Card key={consumer.consumerId} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3 break-words whitespace-normal">
              <div className="flex items-start justify-between w-full">
                <div className="min-w-0">
                  <CardTitle className="text-lg break-words whitespace-normal">{consumer.name}</CardTitle>
                  <p className="text-sm text-gray-600">{consumer.consumerId}</p>
                </div>
                <div className="flex flex-col items-end space-y-1">
                  <div className="flex items-center gap-1">
                    {consumer._syncStatus === 'syncing' && (
                      <RefreshCw className="h-3 w-3 animate-spin text-blue-500" title="Syncing..." />
                    )}
                    {consumer._syncStatus === 'error' && (
                      <AlertCircle className="h-3 w-3 text-red-500" title="Sync failed (saved locally)" />
                    )}
                    <Badge className={getStatusColor(consumer.disconStatus)}>{consumer.disconStatus}</Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {consumer.agency}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 break-words whitespace-normal">
              <div className="flex items-start space-x-2 min-w-0">
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-600 break-words whitespace-normal">{consumer.address}</p>
              </div>
              {consumer.mobileNumber && (
                <a href={`tel:${consumer.mobileNumber}`} className="flex items-center space-x-2 hover:underline">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <p className="text-sm text-blue-600">{consumer.mobileNumber}</p>
                </a>
              )}

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
                  <CalendarIcon className="h-4 w-4 text-gray-400" />
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
                  <span className="font-medium">Last Updated:</span> {consumer.disconDate}
                </div>
              )}

              {/* 👇 UPDATED IMAGE LINK SECTION 👇 */}
              {(consumer.imageUrl || (consumer as any).image) && (
                <div className="pt-2 pb-1 relative z-10"> {/* Added z-10 and spacing */}
                  <a
                    href={getValidUrl((consumer.imageUrl || (consumer as any).image) as string)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer"
                    onClick={(e) => e.stopPropagation()} 
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>View Uploaded Image</span>
                  </a>
                </div>
              )}
              {/* 👆 END UPDATED SECTION 👆 */}

              <Button onClick={() => setSelectedConsumer(consumer)} 
              className={`w-full mt-4 ${
                  ((consumer.disconStatus.toLowerCase() !== "connected" && userRole !== "admin" && userRole !== "executive") || userRole === "viewer")
                    ? "bg-gray-100 text-gray-500 hover:bg-gray-100 cursor-not-allowed" 
                    : ""
                }`}
                size="sm"
                disabled={(consumer.disconStatus.toLowerCase() !== "connected" && userRole !== "admin" && userRole !== "executive") || userRole === "viewer"}
              >
                <Edit className={`h-4 w-4 mr-2 ${
                    ((consumer.disconStatus.toLowerCase() !== "connected" && userRole !== "admin" && userRole !== "executive") || userRole === "viewer") 
                      ? "text-gray-400" 
                      : ""
                  }`} />
                Update Status
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
})

export { ConsumerList }
