"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { RotateCcw, Gauge, ClipboardCheck, Sparkles, Wrench } from "lucide-react"

const STORAGE_KEY = "modules_live_june2026_seen"

export function NewYearPopup({ userId }: { userId?: string }) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setIsOpen(true)
  }, [])

  const handleOk = () => {
    localStorage.setItem(STORAGE_KEY, "true")
    setIsOpen(false)
  }

  const modules = [
    {
      icon: RotateCcw,
      label: "Reconnection",
      desc: "Track and manage consumer reconnections end-to-end.",
      color: "bg-blue-50 text-blue-600 border-blue-200",
    },
    {
      icon: ClipboardCheck,
      label: "NSC Inspection",
      desc: "New Service Connection applications, site inspection & processing.",
      color: "bg-green-50 text-green-600 border-green-200",
    },
    {
      icon: Gauge,
      label: "Meter Management",
      desc: "Stock tracking, meter issuance, installation & finalization.",
      color: "bg-purple-50 text-purple-600 border-purple-200",
    },
    {
      icon: Wrench,
      label: "Meter Replacement",
      desc: "Faulty, burnt & slow-fast meter replacements with image evidence.",
      color: "bg-orange-50 text-orange-600 border-orange-200",
    },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm w-full p-0 overflow-hidden rounded-2xl [&>button]:hidden">
        <DialogTitle className="sr-only">New Modules Live</DialogTitle>

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-blue-500 px-6 pt-7 pb-6 text-white text-center">
          <div className="flex justify-center mb-3">
            <div className="bg-white/20 rounded-full p-3">
              <Sparkles className="h-7 w-7 text-yellow-300" />
            </div>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight">Now Live!</h2>
          <p className="text-sm text-white/80 mt-1">Three new modules are ready for you</p>
        </div>

        {/* Module list */}
        <div className="px-5 py-4 space-y-3 bg-white">
          {modules.map(({ icon: Icon, label, desc, color }) => (
            <div key={label} className={`flex items-start gap-3 border rounded-xl p-3 ${color}`}>
              <div className="shrink-0 mt-0.5">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold">{label}</p>
                <p className="text-xs opacity-75 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 bg-white">
          <Button
            className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-base font-semibold"
            onClick={handleOk}
          >
            Got it, Let's Go!
          </Button>
          <p className="text-center text-[10px] text-gray-400 mt-2">
            This message won't appear again on this device.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
