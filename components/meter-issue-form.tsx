"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Search, Loader2, X as XIcon } from "lucide-react"
import { getFromCache } from "@/lib/indexed-db"
import type { ConsumerData } from "@/lib/google-sheets"
import type { MeterStock, IssuePurpose } from "@/lib/meter-types"
import { METER_TYPES } from "@/lib/meter-types"

const PURPOSE_OPTIONS: { value: IssuePurpose; label: string }[] = [
  { value: "faulty_replacement", label: "Faulty / Defective Replacement" },
  { value: "burnt_replacement",  label: "Burnt Meter Replacement" },
  { value: "slow_fast",          label: "Slow / Fast Meter" },
  { value: "nsc",                label: "New Service Connection (NSC)" },
]

interface Props {
  availableStock: MeterStock[]
  agencies: string[]
  onSave: (issueId: string) => void
  onCancel: () => void
}

export function MeterIssueForm({ availableStock, agencies, onSave, onCancel }: Props) {
  const [purpose, setPurpose]           = useState<IssuePurpose>("faulty_replacement")
  const [consumerId, setConsumerId]     = useState("")
  const [nscReceiveNo, setNscReceiveNo] = useState("")
  const [consumerName, setConsumerName] = useState("")
  const [agency, setAgency]             = useState("")
  const [consumerAddress, setConsumerAddress] = useState("")
  const [consumerMobile, setConsumerMobile]   = useState("")
  const [consumerDevice, setConsumerDevice]   = useState("")
  const [serialNo, setSerialNo]           = useState("")
  const [typeFilter, setTypeFilter]       = useState("all")
  const [serialSearch, setSerialSearch]   = useState("")
  const [consumerFoundInDC, setConsumerFoundInDC] = useState(false)
  const [remarks, setRemarks]           = useState("")
  const [looking, setLooking]           = useState(false)
  const [submitting, setSubmitting]     = useState(false)
  const [agencyList, setAgencyList]     = useState<string[]>(agencies)
  const [nscQuery, setNscQuery]         = useState("")
  const [nscSuggestions, setNscSuggestions] = useState<ConsumerData[]>([])
  const [nscAllData, setNscAllData]     = useState<ConsumerData[]>([])

  // Load full agency list (same pattern as reconnection form)
  useEffect(() => {
    async function load() {
      const cached = await getFromCache<string[]>("agencies_data_cache")
      if (cached && cached.length > 0) { setAgencyList(cached); return }
      try {
        const res = await fetch("/api/admin/agencies")
        if (res.ok) {
          const data = await res.json()
          const names = data.filter((a: any) => a.isActive).map((a: any) => a.name)
          if (names.length > 0) setAgencyList(names)
        }
      } catch { /* keep prop */ }
    }
    load()
  }, [])

  // Load consumer data for NSC autocomplete
  useEffect(() => {
    if (purpose !== "nsc") return
    getFromCache<ConsumerData[]>("consumers_data_cache").then(data => {
      if (data) setNscAllData(data)
    })
  }, [purpose])

  useEffect(() => {
    if (!nscQuery.trim() || purpose !== "nsc") { setNscSuggestions([]); return }
    const q = nscQuery.toLowerCase()
    const results = nscAllData.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.consumerId?.includes(q) ||
      c.address?.toLowerCase().includes(q)
    ).slice(0, 8)
    setNscSuggestions(results)
  }, [nscQuery, nscAllData, purpose])

  const selectNscConsumer = (c: ConsumerData) => {
    setConsumerName(c.name || "")
    setConsumerAddress(c.address || "")
    setConsumerMobile(c.mobileNumber || "")
    setConsumerDevice(c.device || "")
    setNscQuery(c.name || "")
    setNscSuggestions([])
  }

  // Lookup consumer from cache
  const lookupConsumer = async () => {
    if (!consumerId.trim()) return
    setLooking(true)
    try {
      const cache = await getFromCache<ConsumerData[]>("consumers_data_cache")
      const match = cache?.find(c => c.consumerId === consumerId.trim())
      if (match) {
        setConsumerName(match.name)
        setConsumerAddress(match.address || "")
        setConsumerMobile(match.mobileNumber || "")
        setConsumerDevice(match.device || "")
        setAgency(match.agency || "")
        setConsumerFoundInDC(true)
      } else {
        setConsumerName("")
        setConsumerAddress("")
        setConsumerMobile("")
        setConsumerDevice("")
        setConsumerFoundInDC(false)
      }
    } finally { setLooking(false) }
  }

  // Filter available meters by type + serial search
  const filteredStock = availableStock.filter(m => {
    if (m.condition !== "available") return false
    if (typeFilter !== "all" && m.typeLabel !== typeFilter) return false
    if (serialSearch.trim()) return m.serialNo.toLowerCase().includes(serialSearch.toLowerCase())
    return true
  })

  const handleSubmit = async () => {
    if (!serialNo)        { alert("Select a meter serial number."); return }
    if (!agency)          { alert("Select an agency."); return }
    if (purpose !== "nsc" && !consumerId.trim()) { alert("Consumer ID is required."); return }
    if (purpose === "nsc" && !nscReceiveNo.trim()) { alert("NSC Receive No is required."); return }
    if (purpose !== "nsc" && !consumerFoundInDC) {
      if (!consumerName.trim())    { alert("Consumer name is required."); return }
      if (!consumerAddress.trim()) { alert("Address is required (consumer not in DC list)."); return }
      if (!consumerMobile.trim())  { alert("Mobile number is required (consumer not in DC list)."); return }
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/meters/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serialNo, purpose, consumerId: consumerId.trim(), nscReceiveNo: nscReceiveNo.trim(), consumerName, address: consumerAddress, mobile: consumerMobile, oldDevice: consumerDevice, agency, remarks }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      onSave(data.issueId)
    } catch (e: any) {
      alert(e.message || "Failed")
    } finally { setSubmitting(false) }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-xl font-bold">Issue Meter</h1>
      </div>

      {/* Purpose */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Label>Purpose</Label>
          <Select value={purpose} onValueChange={v => setPurpose(v as IssuePurpose)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PURPOSE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Consumer / NSC reference */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Reference</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {purpose === "nsc" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>NSC Receive No *</Label>
                <Input value={nscReceiveNo} onChange={e => setNscReceiveNo(e.target.value)} placeholder="NSC/26-27/0001" />
              </div>
              <div className="space-y-2">
                <Label>Search Consumer / Applicant</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={nscQuery}
                    onChange={e => setNscQuery(e.target.value)}
                    placeholder="Search by name, ID, address..."
                    className="pl-9 pr-8"
                  />
                  {nscQuery && (
                    <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => { setNscQuery(""); setNscSuggestions([]) }}>
                      <XIcon className="h-4 w-4 text-gray-400" />
                    </button>
                  )}
                </div>
                {nscSuggestions.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-48 overflow-y-auto bg-white shadow-md">
                    {nscSuggestions.map(c => (
                      <button key={c.consumerId} className="w-full text-left px-3 py-2 hover:bg-blue-50 transition text-sm"
                        onClick={() => selectNscConsumer(c)}>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-gray-500">{c.consumerId} {c.address ? `· ${c.address}` : ""}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Consumer ID *</Label>
              <div className="flex gap-2">
                <Input value={consumerId} onChange={e => { setConsumerId(e.target.value.replace(/\D/g, "").slice(0, 9)); setConsumerFoundInDC(false) }}
                  placeholder="9-digit Consumer ID" className="font-mono" />
                <Button variant="outline" onClick={lookupConsumer} disabled={looking}>
                  {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {consumerFoundInDC && consumerName && (
                <div className="text-sm text-green-700 space-y-0.5">
                  <p className="font-medium">✓ {consumerName}</p>
                  {consumerAddress && <p className="text-xs text-gray-500">{consumerAddress}</p>}
                  {consumerMobile  && <p className="text-xs text-gray-500 font-mono">{consumerMobile}</p>}
                  {consumerDevice  && <p className="text-xs text-orange-600">Old device: {consumerDevice}</p>}
                </div>
              )}
              {consumerId.length === 9 && !consumerFoundInDC && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  Not in DC list — please fill address, mobile & old device below.
                </p>
              )}
            </div>
          )}
          {/* Consumer detail fields — always shown; required when not in DC list */}
          {(() => {
            const notInDC = purpose !== "nsc" && !consumerFoundInDC
            return (
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label>Consumer Name {notInDC && "*"}</Label>
                  <Input value={consumerName} onChange={e => setConsumerName(e.target.value)} placeholder="Full name" />
                </div>
                {notInDC && (
                  <>
                    <div className="space-y-1">
                      <Label>Address *</Label>
                      <Input value={consumerAddress} onChange={e => setConsumerAddress(e.target.value)} placeholder="Pole / street address" />
                    </div>
                    <div className="space-y-1">
                      <Label>Mobile No *</Label>
                      <Input value={consumerMobile} onChange={e => setConsumerMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" className="font-mono" inputMode="numeric" />
                    </div>
                    <div className="space-y-1">
                      <Label>Old Device / Meter No</Label>
                      <Input value={consumerDevice} onChange={e => setConsumerDevice(e.target.value)} placeholder="Existing meter number (if any)" />
                    </div>
                  </>
                )}
              </div>
            )
          })()}
          <div className="space-y-2">
            <Label>Agency *</Label>
            <Select value={agency} onValueChange={setAgency}>
              <SelectTrigger><SelectValue placeholder="Select agency..." /></SelectTrigger>
              <SelectContent>
                {agencyList.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Meter selection */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Select Meter from Stock</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {METER_TYPES.map(t => <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={serialSearch}
              onChange={e => setSerialSearch(e.target.value)}
              placeholder="Search serial number..."
              className="pl-9 font-mono"
            />
            {serialSearch && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setSerialSearch("")}>
                <XIcon className="h-4 w-4 text-gray-400" />
              </button>
            )}
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1 border rounded-lg p-2">
            {filteredStock.length === 0 ? (
              <p className="text-sm text-center text-gray-400 py-4">No available meters of this type</p>
            ) : filteredStock.map(m => (
              <label key={m.serialNo} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition ${serialNo === m.serialNo ? "bg-blue-50 border border-blue-300" : "hover:bg-gray-50"}`}>
                <input type="radio" name="serial" value={m.serialNo} checked={serialNo === m.serialNo}
                  onChange={() => setSerialNo(m.serialNo)} className="shrink-0" />
                <div>
                  <p className="font-mono text-sm font-semibold">{m.serialNo}</p>
                  <p className="text-xs text-gray-500">{m.typeLabel}</p>
                </div>
              </label>
            ))}
          </div>
          {serialNo && <p className="text-sm text-blue-700 font-medium">Selected: <span className="font-mono">{serialNo}</span></p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <Label>Remarks (optional)</Label>
          <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any notes..." rows={2} />
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t z-50 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>Cancel</Button>
        <Button className="flex-[2] h-12 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {submitting ? "Issuing..." : "Issue Meter"}
        </Button>
      </div>
    </div>
  )
}
