"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Loader2 } from "lucide-react"
import { getFromCache } from "@/lib/indexed-db"
import { NSC_CLASSES, NSC_PHASES } from "@/lib/nsc-types"

interface Props {
  agencies: string[]
  onSave: (receiveNo: string) => void
  onCancel: () => void
}

export function NscApplicationForm({ agencies, onSave, onCancel }: Props) {
  const [applicantName, setApplicantName] = useState("")
  const [careOf, setCareOf]               = useState("")
  const [address, setAddress]             = useState("")
  const [mobile, setMobile]               = useState("")
  const [appliedClass, setAppliedClass]   = useState("")
  const [phase, setPhase]                 = useState("")
  const [agency, setAgency]               = useState("")
  const [agencyList, setAgencyList]       = useState<string[]>(agencies)
  const [submitting, setSubmitting]       = useState(false)

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

  const handleSubmit = async () => {
    if (!applicantName.trim()) { alert("Applicant name is required."); return }
    if (!address.trim())       { alert("Address is required."); return }
    if (!mobile.trim())        { alert("Mobile number is required."); return }
    if (!appliedClass)         { alert("Applied class is required."); return }
    if (!phase)                { alert("Phase is required."); return }
    if (!agency)               { alert("Please assign an agency."); return }

    setSubmitting(true)
    try {
      const res = await fetch("/api/nsc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicantName: applicantName.trim(), careOf: careOf.trim(), address: address.trim(), mobile: mobile.trim(), appliedClass, phase, agency }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      onSave(data.receiveNo)
    } catch (e: any) {
      alert(e.message || "Failed to create application")
    } finally { setSubmitting(false) }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-28">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onCancel}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-xl font-bold">New NSC Application</h1>
          <p className="text-xs text-gray-500">Receive number will be auto-assigned</p>
        </div>
      </div>

      {/* Applicant details */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Applicant Details</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="space-y-1">
            <Label>Applicant Name *</Label>
            <Input value={applicantName} onChange={e => setApplicantName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="space-y-1">
            <Label>C/O (Father / Husband Name)</Label>
            <Input value={careOf} onChange={e => setCareOf(e.target.value)} placeholder="C/O name" />
          </div>
          <div className="space-y-1">
            <Label>Address *</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Full address with locality" />
          </div>
          <div className="space-y-1">
            <Label>Mobile Number *</Label>
            <Input
              value={mobile}
              onChange={e => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit mobile"
              className="font-mono"
              inputMode="numeric"
            />
          </div>
        </CardContent>
      </Card>

      {/* Connection details */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Connection Details</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="space-y-1">
            <Label>Applied Class *</Label>
            <Select value={appliedClass} onValueChange={setAppliedClass}>
              <SelectTrigger><SelectValue placeholder="Select class..." /></SelectTrigger>
              <SelectContent>
                {NSC_CLASSES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Phase *</Label>
            <div className="grid grid-cols-2 gap-2">
              {NSC_PHASES.map(p => (
                <button key={p.value} type="button"
                  onClick={() => setPhase(p.value)}
                  className={`py-2.5 rounded-lg text-sm font-medium border transition ${phase === p.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agency assignment */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4"><CardTitle className="text-sm">Assign Agency</CardTitle></CardHeader>
        <CardContent className="px-4 pb-4">
          <Select value={agency} onValueChange={setAgency}>
            <SelectTrigger><SelectValue placeholder="Select agency for inspection..." /></SelectTrigger>
            <SelectContent>
              {agencyList.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t z-50 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <Button variant="outline" className="flex-1 h-12" onClick={onCancel}>Cancel</Button>
        <Button className="flex-[2] h-12 bg-green-600 hover:bg-green-700 text-white" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {submitting ? "Creating..." : "Create Application"}
        </Button>
      </div>
    </div>
  )
}
