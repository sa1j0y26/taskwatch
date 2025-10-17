import { publishRealtime, subscribeRealtime } from "@/lib/realtime"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: string) => {
        controller.enqueue(encoder.encode(data))
      }

      send(`event: message\n`)
      send(`data: ${JSON.stringify({ type: "ready", payload: null })}\n\n`)

      const unsubscribe = subscribeRealtime((event) => {
        send(`event: message\n`)
        send(`data: ${JSON.stringify(event)}\n\n`)
      })

      const keepAlive = setInterval(() => {
        send(`: keep-alive ${Date.now()}\n\n`)
      }, 15000)

      controller.enqueue(encoder.encode(": stream-start\n\n"))

      const signal = (controller as unknown as { signal?: AbortSignal }).signal
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            clearInterval(keepAlive)
            unsubscribe()
          },
          { once: true },
        )
      }
    },
    cancel() {
      // handled via abort signal; noop
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Transfer-Encoding": "chunked",
    },
  })
}

export function POST() {
  publishRealtime({ type: "ready", payload: null })
  return new Response(null, { status: 204 })
}
