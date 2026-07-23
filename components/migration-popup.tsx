"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  AlertTriangle,
  ExternalLink,
  Clock,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
} from "lucide-react"

// Unique session key so popup appears every time the user logs in (per session)
const MIGRATION_SESSION_KEY = "migration_notice_seen_session"

export function MigrationPopup() {
  const [isOpen, setIsOpen] = useState(false)
  const [timeLeft, setTimeLeft] = useState(15)
  const [canClose, setCanClose] = useState(false)

  useEffect(() => {
    // Check session storage so it pops up every login / fresh session
    const hasSeenInSession = sessionStorage.getItem(MIGRATION_SESSION_KEY)
    if (!hasSeenInSession) {
      setIsOpen(true)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return

    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      setCanClose(true)
    }
  }, [isOpen, timeLeft])

  const handleClose = () => {
    if (!canClose) return
    sessionStorage.setItem(MIGRATION_SESSION_KEY, "true")
    setIsOpen(false)
  }

  const handleLinkClick = () => {
    window.open("https://disconnection.vercel.app", "_blank", "noopener,noreferrer")
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden rounded-3xl [&>button]:hidden shadow-2xl border border-amber-200/60 bg-white">
        <DialogTitle className="sr-only">Important Notice: Web Platform Migration</DialogTitle>

        {/* Top Decorative Banner */}
        <div className="relative bg-gradient-to-br from-amber-500 via-orange-600 to-red-600 px-6 pt-7 pb-6 text-white text-center overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-black/10 rounded-full blur-xl pointer-events-none" />

          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase text-amber-100 mb-3 border border-white/20 shadow-inner">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-200" />
            <span>Important Announcement</span>
          </div>

          <h2 className="text-2xl font-black tracking-tight text-white drop-shadow-sm">
            System Migration Notice
          </h2>
          <p className="text-xs text-amber-100/90 mt-1 font-medium">
            Please switch to our upgraded platform before July 25, 2026
          </p>
        </div>

        {/* Content Body */}
        <div className="px-6 py-5 space-y-4 bg-white text-gray-800">
          {/* Main Notice Box */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50/70 border border-amber-200/80 rounded-2xl p-4 space-y-3 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-500/10 text-amber-700 rounded-xl shrink-0 mt-0.5 border border-amber-200">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-amber-950">
                  This Application Will Stop Working From <span className="underline decoration-amber-400 decoration-2 font-extrabold text-red-600">25.07.2026</span>
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  To ensure uninterrupted service and enhanced security, kindly transition to our new official portal immediately.
                </p>
              </div>
            </div>
          </div>

          {/* Direct Link Banner */}
          <div className="group relative bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white rounded-2xl p-4 shadow-md transition-all duration-300 transform hover:-translate-y-0.5">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <span className="text-[10px] uppercase font-bold text-blue-200 tracking-wider">New Official Website</span>
                <a
                  href="https://disconnection.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleLinkClick}
                  className="text-base font-extrabold text-white hover:underline flex items-center gap-1.5 truncate"
                >
                  disconnection.vercel.app
                  <ExternalLink className="h-4 w-4 shrink-0 text-blue-200 group-hover:text-white transition-colors" />
                </a>
              </div>
              <Button
                type="button"
                onClick={handleLinkClick}
                className="shrink-0 bg-white text-blue-700 hover:bg-blue-50 font-bold text-xs px-3.5 py-2 rounded-xl shadow-sm border border-blue-100 flex items-center gap-1"
              >
                <span>Visit Now</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Key Checklist / Verified Mark */}
          <div className="bg-gray-50/80 rounded-2xl p-3.5 border border-gray-100 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>Verified Official Migration Portal</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>Faster performance &amp; all historical data pre-synced</span>
            </div>
          </div>
        </div>

        {/* Footer with Timer & Button */}
        <div className="px-6 pb-6 pt-2 bg-white border-t border-gray-100 space-y-3">
          <Button
            onClick={handleClose}
            disabled={!canClose}
            className={`w-full h-12 rounded-2xl text-sm font-bold shadow-md transition-all duration-300 flex items-center justify-center gap-2 ${
              canClose
                ? "bg-gray-900 hover:bg-gray-800 text-white cursor-pointer hover:shadow-lg"
                : "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
            }`}
          >
            {canClose ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>I Understand &amp; Continue</span>
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 animate-spin text-amber-500" />
                <span>Please view notice ({timeLeft}s)</span>
              </>
            )}
          </Button>

          <p className="text-center text-[11px] text-gray-400">
            {canClose
              ? "Click above to acknowledge and enter dashboard"
              : `This mandatory announcement must be viewed for 15 seconds (${timeLeft}s remaining)`}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
