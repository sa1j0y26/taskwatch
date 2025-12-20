import { publishRealtime, subscribeRealtime } from "@/lib/realtime"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const encoder = new TextEncoder()
  let cleanup: (() => void) | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let keepAlive: ReturnType<typeof setInterval> | null = null
      let unsubscribe: (() => void) | null = null

      const doCleanup = () => {
        if (closed) return
        closed = true
        if (keepAlive) {
          clearInterval(keepAlive)
          keepAlive = null
        }
        if (unsubscribe) {
          unsubscribe()
          unsubscribe = null
        }
      }
      cleanup = doCleanup

      const send = (data: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(data))
        } catch {
          doCleanup()
        }
      }

      send(`event: message\n`)
      send(`data: ${JSON.stringify({ type: "ready", payload: null })}\n\n`)

      unsubscribe = subscribeRealtime((event) => {
        send(`event: message\n`)
        send(`data: ${JSON.stringify(event)}\n\n`)
      })

      keepAlive = setInterval(() => {
        send(`: keep-alive ${Date.now()}\n\n`)
      }, 15000)

      send(`: stream-start\n\n`)

      const signal = (controller as unknown as { signal?: AbortSignal }).signal
      if (signal) {
        signal.addEventListener("abort", doCleanup, { once: true })
      }
    },
    cancel() {
      cleanup?.()
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
