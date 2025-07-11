"use server"

import type { ConsumerData } from "./google-sheets"

// Replace with your Google Apps Script Web App URL
const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbwxhNyJUEzDzzrHxHz-uL0ZipR6S4URE_QIRvbTWUZyDPTWOiIVNWcysrIiJA9rEU_m/exec"

export async function updateConsumerViaAppsScript(consumer: ConsumerData) {
  try {
    // console.log("🔄 Updating consumer via Apps Script:", consumer.consumerId)
    // console.log("📡 Apps Script URL:", APPS_SCRIPT_URL ? "Configured" : "Not configured")

    if (!APPS_SCRIPT_URL) {
      console.log("⚠️ Apps Script URL not configured, using mock update")
      // Simulate successful update for testing
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return { success: true, message: "Consumer updated successfully (mock - Apps Script URL not configured)" }
    }

    const payload = {
      consumerId: consumer.consumerId,
      disconStatus: consumer.disconStatus,
      disconDate: consumer.disconDate,
      mobileNumber: consumer.mobileNumber,
      d2NetOS: consumer.d2NetOS,
      notes: consumer.notes || "",
      agency: consumer.agency,
    }

    // console.log("📤 Sending payload:", payload)

    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    // console.log("📡 Apps Script response status:", response.status)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    // console.log("📡 Apps Script response new:", result)

    if (result.success) {
      return { success: true, message: "Consumer updated successfully in Google Sheets" }
    } else {
      throw new Error(result.error || "Update failed")
    }
  } catch (error) {
    console.error("💥 Error updating via Apps Script:", error)

    // Return more detailed error information
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return {
      success: false,
      error: `Failed to update consumer data: ${errorMessage}. Check if Google Apps Script URL is configured correctly.`,
    }
  }
}
