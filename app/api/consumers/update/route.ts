// app/api/consumers/update/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { updateConsumerInGoogleSheet } from "@/lib/google-sheets-api" // Changed import
import type { ConsumerData } from "@/lib/google-sheets"

export async function POST(request: NextRequest) {
  try {
    const consumer: ConsumerData = await request.json()

    console.log(`🔄 Updating consumer ${consumer.consumerId}...`)

    // Use the direct Sheets API function
    const result = await updateConsumerInGoogleSheet(consumer)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error("💥 API /consumers/update error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update consumer",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}