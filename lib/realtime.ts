import type { TimelinePostKindValue } from "@/lib/timeline"

export type RealtimeEvent =
  | { type: "timeline.posted"; payload: { post: unknown } }
  | { type: "timeline.updated"; payload: { post: unknown } }
  | { type: "timeline.deleted"; payload: { postId: string } }
  | { type: "timeline.reacted"; payload: { postId: string; reactions: { likes: number; bads: number } } }
  | { type: "occurrence.status_changed"; payload: { occurrenceId: string; status: string; timelineKind: TimelinePostKindValue | null } }
  | { type: "ready"; payload: null }

export type RealtimeListener = (event: RealtimeEvent) => void

const HUB_KEY = Symbol.for("taskwatch.realtime")

type RealtimeHub = {
  listeners: Set<RealtimeListener>
}

const globalThisAny = globalThis as unknown as { [HUB_KEY]?: RealtimeHub }

if (!globalThisAny[HUB_KEY]) {
  globalThisAny[HUB_KEY] = {
    listeners: new Set(),
  }
}

const hub = globalThisAny[HUB_KEY] as RealtimeHub

export function publishRealtime(event: RealtimeEvent) {
  hub.listeners.forEach((listener) => {
    try {
      listener(event)
    } catch (error) {
      console.error("[realtime.publish] listener failed", error)
    }
  })
}

export function subscribeRealtime(listener: RealtimeListener) {
  hub.listeners.add(listener)
  return () => {
    hub.listeners.delete(listener)
  }
}

export function getRealtimeListenerCount() {
  return hub.listeners.size
}
