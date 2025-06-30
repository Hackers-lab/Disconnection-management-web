import { type NextRequest, NextResponse } from "next/server"
import { updateConsumerViaAppsScript } from "@/lib/google-apps-script"
import type { ConsumerData } from "@/lib/google-sheets"

export async function POST(request: NextRequest) {
  try {
    console.log("🔄 API /consumers/update called")

    const consumer: ConsumerData = await request.json()
    console.log("📥 Received consumer data:", {
      consumerId: consumer.consumerId,
      name: consumer.name,
      disconStatus: consumer.disconStatus,
      agency: consumer.agency,
    })

    const result = await updateConsumerViaAppsScript(consumer)
    console.log("📤 Update result:", result)

    if (result.success) {
      return NextResponse.json(result, { status: 200 })
    } else {
      return NextResponse.json(result, { status: 500 })
    }
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
