import type { Event as EventModel, Occurrence as OccurrenceModel } from "@prisma/client"

export const DEFAULT_OCCURRENCE_RANGE_DAYS = 7
export const ONE_DAY_MS = 1000 * 60 * 60 * 24

export type EventWithOccurrences = EventModel & {
  occurrences?: OccurrenceModel[]
}

type AnyRecord = Record<string, unknown>

export function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseDate(value: string): Date | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function startOfDay(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

export function minutesBetween(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60))
}

export function serializeEvent(event: EventWithOccurrences, occurrences?: OccurrenceModel[]) {
  return {
    id: event.id,
    userId: event.user_id,
    title: event.title,
    tag: event.tag,
    description: event.description,
    visibility: event.visibility,
    durationMinutes: event.duration_minutes,
    isAllDay: event.is_all_day,
    rrule: event.rrule,
    exdates: event.exdates.map((date) => date.toISOString()),
    createdAt: event.created_at.toISOString(),
    updatedAt: event.updated_at.toISOString(),
    ...(occurrences
      ? {
          occurrences: occurrences.map((occurrence) => serializeOccurrence(occurrence)),
        }
      : {}),
  }
}

export function serializeOccurrence(occurrence: OccurrenceModel) {
  return {
    id: occurrence.id,
    eventId: occurrence.event_id,
    userId: occurrence.user_id,
    startAt: occurrence.start_at.toISOString(),
    endAt: occurrence.end_at.toISOString(),
    status: occurrence.status,
    isAllDay: occurrence.is_all_day,
    completedAt: occurrence.completed_at ? occurrence.completed_at.toISOString() : null,
    notes: occurrence.notes,
    createdAt: occurrence.created_at.toISOString(),
    updatedAt: occurrence.updated_at.toISOString(),
  }
}
