import { fetchConsumerData } from "@/lib/google-sheets"

// Server-Sent Events for real-time sync
export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send initial data
      const sendUpdate = async () => {
        try {
          const data = await fetchConsumerData()
          const message = `data: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(message))
        } catch (error) {
          console.error("SSE error:", error)
        }
      }

      // Send updates every 30 seconds
      const interval = setInterval(sendUpdate, 30000)

      // Send initial data
      sendUpdate()

      // Cleanup on close
      return () => {
        clearInterval(interval)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
