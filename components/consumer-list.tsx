"use client"


import React, { useImperativeHandle, useRef, useMemo, useTransition } from "react"  
import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Calendar as CalendarIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
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
  LayoutGrid,
  List,
  CheckCircle2,
  Power,
  Clock,
  UserX,
  HelpCircle,
} from "lucide-react"
import { DashboardStats } from "./dashboard-stats"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { ConsumerData } from "@/lib/google-sheets"

// Extend ConsumerData type to include sync status
interface ConsumerDataWithSync extends ConsumerData {
  _syncStatus?: 'syncing' | 'error'
}

// Dynamically import heavy components to reduce initial bundle size
const ConsumerForm = dynamic(() => import("./consumer-form").then((mod) => mod.ConsumerForm), {
  loading: () => <div className="flex justify-center p-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
})
const AdminPanel = dynamic(() => import("./admin-panel").then((mod) => mod.AdminPanel))

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

type SortOrder = "none" | "asc" | "desc"

function useBackNavigation(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const isBackRef = useRef(false)

  useEffect(() => {
    if (isOpen) {
      isBackRef.current = false
      window.history.pushState(null, "", window.location.href)

      const onPopState = () => {
        isBackRef.current = true
        onCloseRef.current()
      }

      window.addEventListener("popstate", onPopState)

      return () => {
        window.removeEventListener("popstate", onPopState)
        if (!isBackRef.current) {
          window.history.back()
        }
      }
    }
  }, [isOpen])
}

// Global variable to track last sync time across unmounts/remounts (SPA navigation)
let globalLastSyncTime = 0
const SYNC_COOLDOWN_MS = 60000 // 60 seconds cooldown

const ConsumerList = React.forwardRef<ConsumerListRef, ConsumerListProps>(
  (props, ref) => {
  const { userRole, userAgencies, onAdminClick, showAdminPanel, onCloseAdminPanel } = props
  const [consumers, setConsumers] = useState<ConsumerData[]>([])
  const [agencies, setAgencies] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedConsumer, setSelectedConsumer] = useState<ConsumerData | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [minOsd, setMinOsd] = useState(0)
  const [showFilters, setShowFilters] = useState(userRole === "test")
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [sortByOSD, setSortByOSD] = useState<SortOrder>("desc")
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
    status: "All Status",
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
  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const [previewConsumer, setPreviewConsumer] = useState<ConsumerData | null>(null)

  // Handle back button navigation for modals/overlays
  useBackNavigation(isFilterOpen, () => setIsFilterOpen(false))
  useBackNavigation(!!selectedConsumer, () => setSelectedConsumer(null))
  useBackNavigation(!!previewConsumer, () => setPreviewConsumer(null))
  useBackNavigation(showAdminPanel, onCloseAdminPanel)

  useEffect(() => {
    const savedMode = localStorage.getItem("consumerListViewMode") as "card" | "list"
    if (savedMode === "card" || savedMode === "list") {
      setViewMode(savedMode)
    }
  }, [])

  const consumersRef = useRef<ConsumerData[]>(consumers)
  useEffect(() => {
    consumersRef.current = consumers
  }, [consumers])

  // Memoize agencies key to prevent unnecessary effect triggers on array reference changes
  const agenciesKey = useMemo(() => JSON.stringify(userAgencies), [userAgencies])
          
  useEffect(() => {
    const CACHE_KEY = "consumers_data_cache"
    const AGENCY_CACHE_KEY = "agencies_data_cache"
    const BASE_DATE_KEY = "consumers_base_date"

    async function processData(data: ConsumerData[], preloadedAgencies: string[] | null = null, isBackgroundUpdate = false) {
      // Yield to main thread to prevent UI blocking during heavy processing
      await new Promise(resolve => setTimeout(resolve, 0));

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

      
      // Only reset the range slider on initial load, not during background updates
      if (!isBackgroundUpdate) {
        setMinOsd(0)
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

      // Use transition to keep UI responsive during state update
      startTransition(() => {
        setConsumers(filteredData)
      })
    }

    async function loadData() {
      setLoading(true)
      setError(null)

      let cachedLoaded = false
      let currentData: ConsumerData[] = []

      try {
        // 1. Check IndexedDB for Base Data
        currentData = await getFromCache<ConsumerData[]>(CACHE_KEY) || []
        const cachedDate = await getFromCache<string>(BASE_DATE_KEY)
        const today = new Date().toISOString().split("T")[0]
        
        let cachedAgencies: string[] | null = null
        if (userRole === "admin" || userRole === "viewer") {
          cachedAgencies = await getFromCache<string[]>(AGENCY_CACHE_KEY)
        }

        // Initial render with cached data if available (Optimistic UI)
        if (currentData.length > 0) {
          console.log("✅ [Cache Hit] Loaded from IndexedDB")
          await processData(currentData, cachedAgencies, false)
          setLoading(false)
          cachedLoaded = true
          setIsCachedData(true)
        }

        // 2. Determine if we need to fetch Base (Missing or Stale)
        const needsBaseFetch = !currentData.length || cachedDate !== today

        // 3. Check Cooldown (Prevent double-fetch or rapid re-fetch on navigation)
        const now = Date.now()
        if (cachedLoaded && !needsBaseFetch && (now - globalLastSyncTime < SYNC_COOLDOWN_MS)) {
          console.log("⏳ Sync skipped (cooldown active)")
          setLoading(false)
          return
        }

        if (needsBaseFetch) {
          if (!cachedLoaded) setLoading(true)
          else setIsBackgroundUpdating(true)
          
          console.log("⬇️ Fetching Base Data (Full Download)...")
          const baseResponse = await fetch("/api/consumers/base")
          
          if (!baseResponse.ok) throw new Error(`Base API Error: ${baseResponse.status}`)
          
          const baseData: ConsumerData[] = await baseResponse.json()
          currentData = baseData
          
          // Save Base to Cache
          await saveToCache(CACHE_KEY, baseData)
          await saveToCache(BASE_DATE_KEY, today)
          
          globalLastSyncTime = Date.now() // Update sync time
          
          // Update UI with fresh base
          await processData(baseData, cachedAgencies, cachedLoaded)
        }

        // 4. ALWAYS fetch Patch (Delta Sync)
        if (cachedLoaded && !needsBaseFetch) setIsBackgroundUpdating(true)
        globalLastSyncTime = Date.now() // Mark sync start
        
        console.log("🩹 Fetching Patch Data (Delta Sync)...")
        const patchResponse = await fetch("/api/consumers/patch")
        
        if (patchResponse.ok) {
          const patchData: ConsumerData[] = await patchResponse.json()
          
          if (patchData.length > 0) {
            console.log(`🔀 Merging ${patchData.length} patch updates...`)
            
            // 5. Merge Patch into Base
            // Create a map for faster lookup/upsert
            const dataMap = new Map(currentData.map(c => [c.consumerId, c]))
            
            patchData.forEach(patchItem => {
              dataMap.set(patchItem.consumerId, patchItem)
            })
            
            const mergedData = Array.from(dataMap.values())
            
            // 6. Update State and Cache
            await saveToCache(CACHE_KEY, mergedData)
            await processData(mergedData, cachedAgencies, true)
          } else {
            console.log("✨ No new patches found")
          }
        }

        // Handle Agencies Refresh (Admin/Viewer) 
        // Only fetch if missing from cache OR if we just did a full Base sync (daily refresh)
        if ((userRole === "admin" || userRole === "viewer") && (!cachedAgencies || needsBaseFetch)) {
           const agenciesRes = await fetch("/api/admin/agencies")
           if (agenciesRes.ok) {
             const agencyData = await agenciesRes.json()
             const freshAgencies = agencyData.filter((a: any) => a.isActive).map((a: any) => a.name)
             await saveToCache(AGENCY_CACHE_KEY, freshAgencies)
             setAgencies(freshAgencies)
          }
        }

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
  }, [userRole, agenciesKey]) // Use stable key instead of array reference

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
  const filteredConsumers = useMemo(() => consumers.filter((consumer) => {
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
    const matchesOsd = consumerOsd >= minOsd

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
      matchesOsd &&
      matchesDateRange &&
      excludeDeemedDisconnection &&
      excludeTemproryDisconnected
    )
  }), [consumers, searchTerm, filters, minOsd, excludeFilters, dateFilter])

  // Apply OSD sorting
  const sortedConsumers = useMemo(() => [...filteredConsumers].sort((a, b) => {
    // 1. Connected First
    const isConnectedA = (a.disconStatus || "").toLowerCase() === "connected"
    const isConnectedB = (b.disconStatus || "").toLowerCase() === "connected"
    
    if (isConnectedA && !isConnectedB) return -1
    if (!isConnectedA && isConnectedB) return 1

    // 2. OSD Sort
    if (sortByOSD === "none") return 0

    const aOsd = Number.parseFloat(a.d2NetOS || "0")
    const bOsd = Number.parseFloat(b.d2NetOS || "0")

    if (sortByOSD === "asc") return aOsd - bOsd
    if (sortByOSD === "desc") return bOsd - aOsd
    return 0
  }), [filteredConsumers, sortByOSD])

    // Helper to ensure links work even if "https://" is missing in the sheet
  const getValidUrl = (url: string | undefined) => {
    if (!url) return "#";
    const cleanUrl = url.trim();
    if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) {
      return cleanUrl;
    }
    return `https://${cleanUrl}`;
  };

  const getStatusIcon = (status: string) => {
    const s = (status || "").toLowerCase()
    if (s === "connected") return <CheckCircle2 className="h-4 w-4 text-green-600" />
    if (s === "disconnected") return <Power className="h-4 w-4 text-red-600" />
    if (s === "pending" || s === "office team") return <Clock className="h-4 w-4 text-yellow-600" />
    if (s === "bill dispute") return <AlertCircle className="h-4 w-4 text-orange-500" />
    if (s.includes("deemed")) return <UserX className="h-4 w-4 text-red-500" />
    return <HelpCircle className="h-4 w-4 text-gray-400" />
  }

  // Pagination logic
  const itemsPerPage = viewMode === "list" ? 100 : 12
  const totalPages = Math.ceil(sortedConsumers.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedConsumers = sortedConsumers.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters, searchTerm, minOsd, excludeFilters, sortByOSD, viewMode])

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
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
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
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
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
    setMinOsd(0)
    setExcludeFilters({
      excludeDeemedDisconnection: false,
      excludeTemproryDisconnected: false,
    })
    setSortByOSD("desc")
    setDateFilter({
      from: null,
      to: null,
      isActive: false
    })
    setCurrentPage(1)
  }

  const toggleOSDSort = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
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
      <div className="bg-white p-4 rounded-lg shadow-sm border sticky top-[64px] z-30">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search id, name, address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-8"
            />
            {searchTerm && (
              <X
                className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-red-500 cursor-pointer hover:text-red-700"
                onClick={() => setSearchTerm("")}
              />
            )}
          </div>

          <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="relative shrink-0">
                <Filter className="h-4 w-4" />
                {(Object.values(filters).some((f) => f !== "All Agencies" && f !== "All Status" && f !== "All Classes" && f !== "All MRUs" && f !== "") ||
                  minOsd > 0 ||
                  dateFilter.isActive ||
                  sortByOSD !== "desc") && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 bg-blue-600 rounded-full border-2 border-white" />
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[300px] sm:w-[400px] overflow-y-auto">
              <SheetHeader className="mb-6">
                <SheetTitle>Filters & Sort</SheetTitle>
                <SheetDescription>
                  Filter consumers by agency, status, and other criteria.
                </SheetDescription>
              </SheetHeader>
              
              <div className="space-y-4 pb-20">
                {/* OSD Range */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-sm font-medium whitespace-nowrap">Min Outstanding</label>
                    <div className="relative flex-1 max-w-[120px]">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                      <Input
                        type="number"
                        value={minOsd || ""}
                        onChange={(e) => setMinOsd(Number(e.target.value))}
                        className="h-8 pl-5 pr-6"
                        placeholder="0"
                      />
                      {minOsd > 0 && (
                        <X
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-red-500 cursor-pointer hover:text-red-700"
                          onClick={() => setMinOsd(0)}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMinOsd(3000)}>{`>= 3k`}</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMinOsd(5000)}>{`>= 5k`}</Button>
                  </div>
                </div>

                {/* Date Filter */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">Disconnection Date</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">From</span>
                      <Input
                        type="date"
                        value={dateFilter.from ? format(dateFilter.from, 'yyyy-MM-dd') : ''}
                        onChange={(e) => setDateFilter(prev => ({ ...prev, from: e.target.value ? new Date(e.target.value) : null, isActive: true }))}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold">To</span>
                      <Input
                        type="date"
                        value={dateFilter.to ? format(dateFilter.to, 'yyyy-MM-dd') : ''}
                        onChange={(e) => setDateFilter(prev => ({ ...prev, to: e.target.value ? new Date(e.target.value) : null, isActive: true }))}
                        className="h-8"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-7 text-xs" 
                      onClick={() => {
                        setDateFilter({
                          from: null,
                          to: null,
                          isActive: false
                        });
                      }}
                    >
                      All
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-7 text-xs" 
                      onClick={() => {
                        const now = new Date();
                        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                        setDateFilter({
                          from: new Date(todayStr),
                          to: new Date(todayStr),
                          isActive: true
                        });
                      }}
                    >
                      Today
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-7 text-xs" 
                      onClick={() => {
                        const now = new Date();
                        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                        const past = new Date(now);
                        past.setDate(now.getDate() - 7);
                        const pastStr = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
                        setDateFilter({
                          from: new Date(pastStr),
                          to: new Date(todayStr),
                          isActive: true
                        });
                      }}
                    >
                      Last 7d
                    </Button>
                  </div>
                </div>

                {/* Dropdowns */}
                <div className="space-y-3">
                  <div className="grid grid-cols-3 items-center gap-2">
                    <label className="text-sm font-medium col-span-1">Agency</label>
                    <div className="col-span-2">
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
                  </div>

                  <div className="grid grid-cols-3 items-center gap-2">
                    <label className="text-sm font-medium col-span-1">Status</label>
                    <div className="col-span-2">
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
                  </div>

                  <div className="grid grid-cols-3 items-center gap-2">
                    <label className="text-sm font-medium col-span-1">MRU</label>
                    <div className="col-span-2">
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
                  
                  <div className="grid grid-cols-3 items-center gap-2">
                    <label className="text-sm font-medium col-span-1">Base Class</label>
                    <div className="col-span-2">
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
                  </div>
                </div>

                {/* Sort */}
                <div className="space-y-2 pt-4 border-t">
                  <label className="text-sm font-medium">Sorting</label>
                  <Button
                    variant="outline"
                    onClick={toggleOSDSort}
                    className="w-full justify-between"
                  >
                    <span>Sort by Outstanding Dues</span>
                    {getSortIcon()}
                  </Button>
                </div>

                {/* Clear Filters */}
                <Button 
                  variant="destructive" 
                  className="w-full mt-8"
                  onClick={() => {
                    clearFilters();
                  }}
                >
                  <X className="mr-2 h-4 w-4" /> Clear All Filters
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center border rounded-md bg-white ml-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 rounded-none rounded-l-md ${viewMode === "card" ? "bg-gray-100 text-blue-600" : "text-gray-500"}`}
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                setViewMode("card")
                localStorage.setItem("consumerListViewMode", "card")
              }}
              title="Card View"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <div className="w-px h-5 bg-gray-200" />
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 rounded-none rounded-r-md ${viewMode === "list" ? "bg-gray-100 text-blue-600" : "text-gray-500"}`}
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                setViewMode("list")
                localStorage.setItem("consumerListViewMode", "list")
              }}
              title="List View"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Summary Footer in Sticky Header */}
        <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
           <div className="flex items-center gap-2">
              <span>{sortedConsumers.length} consumers</span>
              {isBackgroundUpdating && <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />}
           </div>
           {(Object.values(filters).some((f) => f !== "All Agencies" && f !== "All Status" && f !== "All Classes" && f !== "All MRUs" && f !== "") ||
              minOsd > 0 ||
              dateFilter.isActive ||
              sortByOSD !== "desc") && (
              <div className="flex items-center gap-1">
                <span className="text-blue-600 font-medium">Filters Active</span>
                <X
                  className="h-4 w-4 text-red-500 cursor-pointer hover:text-red-700"
                  onClick={clearFilters}
                />
              </div>
           )}
        </div>
      </div>

      {/* Consumer Cards */}
      {viewMode === "card" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {paginatedConsumers.map((consumer) => (
            <Card key={consumer.consumerId} className="hover:shadow-md transition-shadow overflow-hidden max-w-full">
              <CardHeader className="pb-3 break-words whitespace-normal">
                <div className="flex items-start justify-between w-full gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-lg break-words whitespace-normal line-clamp-2 leading-tight">{consumer.name}</CardTitle>
                    <p className="text-sm text-gray-600">{consumer.consumerId}</p>
                  </div>
                  <div className="flex flex-col items-end space-y-1 shrink-0">
                    <div className="flex items-center gap-1">
                      {consumer._syncStatus === 'syncing' && (
                        <RefreshCw className="h-3 w-3 animate-spin text-blue-500" title="Syncing..." />
                      )}
                      {consumer._syncStatus === 'error' && (
                        <AlertCircle className="h-3 w-3 text-red-500" title="Sync failed (saved locally)" />
                      )}
                      <Badge className={getStatusColor(consumer.disconStatus)}>{consumer.disconStatus}</Badge>
                    </div>
                    <Badge variant="outline" className="text-xs max-w-[120px] truncate block">
                      {consumer.agency}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 break-words whitespace-normal">
                <div className="flex items-start space-x-2 min-w-0">
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-gray-600 line-clamp-2" title={consumer.address}>{consumer.address}</p>
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

                <Button onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    setSelectedConsumer(consumer)
                }} 
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
      ) : (
        <>
          {/* Desktop Table View (Hidden on Mobile) */}
          <div className="hidden md:block bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">ID / Name</th>
                    <th className="px-4 py-3 whitespace-nowrap">Address</th>
                    <th className="px-4 py-3 whitespace-nowrap">Mobile</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">OSD</th>
                    <th className="px-4 py-3 whitespace-nowrap text-center">Status</th>
                    <th className="px-4 py-3 whitespace-nowrap text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginatedConsumers.map((consumer) => (
                    <tr key={consumer.consumerId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{consumer.consumerId}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[150px]" title={consumer.name}>{consumer.name}</div>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <div className="truncate text-gray-600" title={consumer.address}>{consumer.address}</div>
                        <div className="text-xs text-gray-400">{consumer.agency}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {consumer.mobileNumber ? (
                           <a href={`tel:${consumer.mobileNumber}`} className="hover:text-blue-600 hover:underline">{consumer.mobileNumber}</a>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="font-medium text-red-600">₹{Number.parseFloat(consumer.d2NetOS || "0").toLocaleString()}</div>
                        <div className="text-xs text-gray-500">{consumer.agency}</div>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                         <Badge className={`${getStatusColor(consumer.disconStatus)} whitespace-nowrap`}>{consumer.disconStatus}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <Button 
                          onClick={() => {
                            if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                            setSelectedConsumer(consumer)
                          }} 
                          size="sm"
                          className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
                          disabled={(consumer.disconStatus.toLowerCase() !== "connected" && userRole !== "admin" && userRole !== "executive") || userRole === "viewer"}
                        >
                          Update
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile List View (Hidden on Desktop) */}
          <div className="md:hidden space-y-2">
            {paginatedConsumers.map((consumer) => (
              <div 
                key={consumer.consumerId} 
                onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    setPreviewConsumer(consumer)
                }}
                className={`bg-white p-2 rounded-lg shadow-sm border active:bg-gray-50 transition-colors ${
                  ((consumer.disconStatus.toLowerCase() !== "connected" && userRole !== "admin" && userRole !== "executive") || userRole === "viewer")
                    ? "opacity-90" 
                    : "cursor-pointer"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                     <div className="shrink-0">{getStatusIcon(consumer.disconStatus)}</div>
                     <div className="font-semibold text-sm text-gray-900 shrink-0">{consumer.consumerId}</div>
                     <div className="text-xs text-gray-500 flex items-center gap-1 min-w-0">
                        <span className="truncate">{consumer.name}</span>
                     </div>
                  </div>
                  <div className="text-xs font-bold text-red-600 whitespace-nowrap shrink-0 mt-0.5">
                     ₹{Number.parseFloat(consumer.d2NetOS || "0").toLocaleString()}
                  </div>
                </div>
                
                <div className="flex justify-between items-center mt-0.5 pl-6">
                  <div className="text-xs text-gray-600 truncate mr-2">
                    {consumer.address}
                  </div>
                  <div className="flex items-center -mr-2">
                    {consumer.mobileNumber && (
                       <a href={`tel:${consumer.mobileNumber}`} onClick={(e) => e.stopPropagation()} className="p-1 text-blue-600 mr-1">
                          <Phone className="h-4 w-4" />
                       </a>
                    )}
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-6 w-6 text-blue-600 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                        if (!((consumer.disconStatus.toLowerCase() !== "connected" && userRole !== "admin" && userRole !== "executive") || userRole === "viewer")) {
                          setSelectedConsumer(consumer)
                        }
                      }}
                      disabled={((consumer.disconStatus.toLowerCase() !== "connected" && userRole !== "admin" && userRole !== "executive") || userRole === "viewer")}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="h-[2px] bg-gray-200 w-full mt-2 rounded-full" />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-sm text-gray-600">
            Page {currentPage} of {totalPages} ({sortedConsumers.length} total consumers)
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                setCurrentPage(Math.max(1, currentPage - 1))
              }}
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
                    onClick={() => {
                        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                        setCurrentPage(pageNum)
                    }}
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
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                setCurrentPage(Math.min(totalPages, currentPage + 1))
              }}
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

      {/* Mobile PIP View Dialog */}
      <Dialog open={!!previewConsumer} onOpenChange={(open) => !open && setPreviewConsumer(null)}>
        <DialogContent className="max-w-sm p-0 overflow-hidden rounded-lg">
          <DialogTitle className="sr-only">Consumer Details</DialogTitle>
          <DialogDescription className="sr-only">
            Details of the selected consumer
          </DialogDescription>
          {previewConsumer && (
            <Card className="border-0 shadow-none">
              <CardHeader className="pb-3 bg-gray-50 border-b">
                <div className="flex items-start justify-between w-full">
                  <div className="min-w-0">
                    <CardTitle className="text-lg break-words whitespace-normal">{previewConsumer.name}</CardTitle>
                    <p className="text-sm text-gray-600">{previewConsumer.consumerId}</p>
                  </div>
                  <div className="flex flex-col items-end space-y-1">
                    <Badge className={getStatusColor(previewConsumer.disconStatus)}>{previewConsumer.disconStatus}</Badge>
                    <Badge variant="outline" className="text-xs">
                      {previewConsumer.agency}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="flex items-start space-x-2">
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-600">{previewConsumer.address}</p>
                </div>
                
                {previewConsumer.mobileNumber && (
                  <div className="flex items-center space-x-2">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <a href={`tel:${previewConsumer.mobileNumber}`} className="text-sm text-blue-600 hover:underline">
                      {previewConsumer.mobileNumber}
                    </a>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <IndianRupee className="h-4 w-4 text-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-600">
                      ₹{Number.parseFloat(previewConsumer.d2NetOS || "0").toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">Outstanding Dues</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                  <div><span className="font-medium">Class:</span> {previewConsumer.baseClass}</div>
                  <div><span className="font-medium">Device:</span> {previewConsumer.device}</div>
                  <div className="col-span-2"><span className="font-medium">Due:</span> {previewConsumer.osDuedateRange}</div>
                </div>

                {(previewConsumer.imageUrl || (previewConsumer as any).image) && (
                  <div className="pt-2">
                    <a
                      href={getValidUrl((previewConsumer.imageUrl || (previewConsumer as any).image) as string)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-2 text-xs font-medium text-blue-600 hover:underline"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span>View Uploaded Image</span>
                    </a>
                  </div>
                )}

                <Button 
                  className="w-full" 
                  onClick={() => {
                    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
                    setPreviewConsumer(null);
                    if (!((previewConsumer.disconStatus.toLowerCase() !== "connected" && userRole !== "admin" && userRole !== "executive") || userRole === "viewer")) {
                      setSelectedConsumer(previewConsumer);
                    }
                  }}
                  disabled={(previewConsumer.disconStatus.toLowerCase() !== "connected" && userRole !== "admin" && userRole !== "executive") || userRole === "viewer"}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Update Status
                </Button>
              </CardContent>
            </Card>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
})

export { ConsumerList }
