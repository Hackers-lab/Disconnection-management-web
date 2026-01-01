"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { X, MessageCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export function NewYearPopup({ userId }: { userId?: string }) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const checkPopupStatus = () => {
      const now = new Date()
      const expiryDate = new Date("2026-01-05T00:00:00")
      const hasSeen = localStorage.getItem("new_year_2026_wish_shown")

      // Show only if before Jan 5th, 2026 and not seen yet
      if (now < expiryDate && !hasSeen) {
        setIsOpen(true)
      }
    }
    checkPopupStatus()
  }, [])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Mark as seen when closing
      localStorage.setItem("new_year_2026_wish_shown", "true")
    }
    setIsOpen(open)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {/* [&>button]:hidden hides the default shadcn close button so we can use our custom one */}
      <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-sm sm:max-w-md w-full overflow-hidden [&>button]:hidden">
        <DialogTitle className="sr-only">Happy New Year 2026</DialogTitle>
        <div className="relative h-[500px] w-full flex flex-col rounded-2xl overflow-hidden bg-black">
          {/* Background Image */}
          <Image
            src="/new-year-2026.jpg"
            alt="Happy New Year 2026"
            fill
            className="object-cover opacity-90"
            priority
          />

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

          {/* Custom Close Button */}
          <div className="absolute top-3 right-3 z-50">
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full bg-black/20 text-white hover:bg-black/40 backdrop-blur-sm"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          </div>

          {/* Content */}
          <div className="relative z-10 flex h-full flex-col justify-between p-6">
            <div className="flex-1 flex flex-col items-center justify-center space-y-6">
              <h2 className="text-center text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 via-yellow-100 to-yellow-500 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">
                Happy New Year
                <br />
                2026
              </h2>
              <p className="text-center text-lg font-medium text-white/90 italic drop-shadow-md max-w-[85%] leading-relaxed">
                &quot;May the coming year bring you success, joy, and prosperity in all your endeavors.&quot;
              </p>
              <Button
                onClick={() => {
                  const message = `Happy New Year 2026! 🎊\n\nWishing you a prosperous year ahead filled with success, good health, and new achievements. May this year bring you closer to your professional and personal goals.\n\nSent through: Disconnection Management App :)`
                  const text = encodeURIComponent(message)
                  window.open(`https://wa.me/918092273459?text=${text}`, "_blank")
                }}
                className="bg-green-600 hover:bg-green-700 text-white border-none rounded-full px-6 shadow-lg hover:shadow-green-900/50 transition-all duration-300"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Wish Me Back
              </Button>
            </div>

            <div className="flex flex-col items-end space-y-1 text-right">
              <span className="text-xs uppercase tracking-widest text-gray-400">Regards</span>
              <span className="text-lg font-bold text-white">Pramod Verma</span>
              <span className="font-mono text-sm font-medium text-yellow-400">JE-E GR-II</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}