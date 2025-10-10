import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import {
  DEFAULT_OCCURRENCE_RANGE_DAYS,
  ONE_DAY_MS,
  isRecord,
  minutesBetween,
  parseDate,
  serializeEvent,
  startOfDay,
} from "@/lib/events/helpers"
import { generateRecurringStartDates, RecurrenceError } from "@/lib/events/recurrence"
import { prisma } from "@/lib/prisma"
import type { Occurrence as OccurrenceModel } from "@prisma/client"
import { OccurrenceStatus, Visibility } from "@prisma/client"

export async function GET(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id
  const { searchParams } = new URL(request.url)

  const targetUserId = searchParams.get("userId") ?? viewerId
  if (targetUserId !== viewerId) {
    return jsonErrorWithStatus(
      "FORBIDDEN",
      "You do not have access to this user's events.",
      { status: 403 },
    )
  }

  const withOccurrences = searchParams.get("withOccurrences") === "true"
  const rangeStartParam = searchParams.get("rangeStart")
  const rangeEndParam = searchParams.get("rangeEnd")

  let rangeStart: Date | null = null
  let rangeEnd: Date | null = null

  if (withOccurrences) {
    if (rangeStartParam) {
      rangeStart = parseDate(rangeStartParam)
      if (!rangeStart) {
        return jsonErrorWithStatus("INVALID_RANGE", "rangeStart must be a valid ISO date.", {
          status: 422,
        })
      }
    }

    if (rangeEndParam) {
      rangeEnd = parseDate(rangeEndParam)
      if (!rangeEnd) {
        return jsonErrorWithStatus("INVALID_RANGE", "rangeEnd must be a valid ISO date.", {
          status: 422,
        })
      }
    }

    if (rangeStart && rangeEnd && rangeEnd <= rangeStart) {
      return jsonErrorWithStatus("INVALID_RANGE", "rangeEnd must be later than rangeStart.", {
        status: 422,
      })
    }

    if (rangeStart && !rangeEnd) {
      rangeEnd = new Date(rangeStart.getTime() + DEFAULT_OCCURRENCE_RANGE_DAYS * ONE_DAY_MS)
    }

    if (rangeEnd && !rangeStart) {
      rangeStart = new Date(rangeEnd.getTime() - DEFAULT_OCCURRENCE_RANGE_DAYS * ONE_DAY_MS)
    }

    if (!rangeStart && !rangeEnd) {
      const now = startOfDay(new Date())
      rangeStart = now
      rangeEnd = new Date(now.getTime() + DEFAULT_OCCURRENCE_RANGE_DAYS * ONE_DAY_MS)
    }
  }

  try {
    const events = await prisma.event.findMany({
      where: { user_id: targetUserId },
      orderBy: { created_at: "desc" },
      ...(withOccurrences
        ? {
            include: {
              occurrences: {
                where: {
                  ...(rangeStart || rangeEnd
                    ? {
                        start_at: {
                          ...(rangeStart ? { gte: rangeStart } : {}),
                          ...(rangeEnd ? { lt: rangeEnd } : {}),
                        },
                      }
                    : {}),
                },
                orderBy: { start_at: "asc" },
              },
            },
          }
        : {}),
    })

    return jsonSuccess({
      events: events.map((event) =>
        serializeEvent(event, withOccurrences ? event.occurrences ?? [] : undefined),
      ),
    })
  } catch (error) {
    console.error("[events.GET]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to fetch events.", { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonErrorWithStatus("INVALID_JSON", "Request body must be valid JSON.", { status: 400 })
  }

  if (!isRecord(payload)) {
    return jsonErrorWithStatus("INVALID_BODY", "Request body must be an object.", { status: 400 })
  }

  const {
    title,
    description,
    tag,
    visibility,
    durationMinutes,
    rrule,
    exdates,
    firstOccurrence,
  } = payload

  const issues: Record<string, string> = {}

  const normalizedTitle = typeof title === "string" ? title.trim() : ""
  if (!normalizedTitle) {
    issues.title = "Title is required."
  } else if (normalizedTitle.length > 120) {
    issues.title = "Title must be 120 characters or less."
  }

  const duration = typeof durationMinutes === "number" ? Math.floor(durationMinutes) : NaN
  if (!Number.isInteger(duration) || duration < 5 || duration > 1440) {
    issues.durationMinutes = "durationMinutes must be an integer between 5 and 1440."
  }

  let normalizedVisibility: Visibility = Visibility.PRIVATE
  if (visibility != null) {
    if (typeof visibility !== "string") {
      issues.visibility = "visibility must be a string."
    } else {
      const upper = visibility.toUpperCase()
      if (upper === Visibility.PRIVATE || upper === Visibility.PUBLIC) {
        normalizedVisibility = upper
      } else {
        issues.visibility = "visibility must be PRIVATE or PUBLIC."
      }
    }
  }

  let normalizedTag: string | null = null
  if (tag != null) {
    if (typeof tag !== "string") {
      issues.tag = "tag must be a string if provided."
    } else if (tag.trim().length > 32) {
      issues.tag = "tag must be 32 characters or less."
    } else {
      normalizedTag = tag.trim().length > 0 ? tag.trim() : null
    }
  }

  let normalizedRrule: string | null = null
  if (rrule != null) {
    if (typeof rrule !== "string") {
      issues.rrule = "rrule must be a string if provided."
    } else if (rrule.length > 2000) {
      issues.rrule = "rrule must be 2000 characters or less."
    } else {
      normalizedRrule = rrule.trim()
      if (!normalizedRrule) {
        issues.rrule = "rrule must not be empty."
        normalizedRrule = null
      }
    }
  }

  let normalizedExdates: Date[] | undefined
  if (exdates != null) {
    if (!Array.isArray(exdates)) {
      issues.exdates = "exdates must be an array of ISO date strings."
    } else {
      const parsed = exdates.map((value) => (typeof value === "string" ? parseDate(value) : null))
      if (parsed.some((date) => !date)) {
        issues.exdates = "exdates must contain valid ISO date strings."
      } else {
        normalizedExdates = parsed.map((date) => date!)
      }
    }
  }

  let normalizedFirstOccurrence: {
    startAt: Date
    endAt: Date
    notes: string | null
  } | null = null

  if (firstOccurrence != null) {
    if (!isRecord(firstOccurrence)) {
      issues.firstOccurrence = "firstOccurrence must be an object."
    } else {
      const { startAt, endAt, notes } = firstOccurrence
      const parsedStart = typeof startAt === "string" ? parseDate(startAt) : null
      const parsedEnd = typeof endAt === "string" ? parseDate(endAt) : null

      if (!parsedStart || !parsedEnd) {
        issues.firstOccurrence = "firstOccurrence startAt and endAt must be ISO date strings."
      } else if (parsedEnd <= parsedStart) {
        issues.firstOccurrence = "endAt must be later than startAt."
      } else if (!Number.isNaN(duration) && minutesBetween(parsedStart, parsedEnd) !== duration) {
        issues.firstOccurrence = "Occurrence duration must match durationMinutes."
      } else if (notes != null && typeof notes !== "string") {
        issues.firstOccurrence = "notes must be a string if provided."
      } else {
        normalizedFirstOccurrence = {
          startAt: parsedStart,
          endAt: parsedEnd,
          notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
        }
      }
    }
  }

  if (normalizedRrule && !normalizedFirstOccurrence) {
    issues.firstOccurrence = "firstOccurrence is required when rrule is provided."
  }

  if (Object.keys(issues).length > 0) {
    return jsonErrorWithStatus("VALIDATION_ERROR", "Request validation failed.", {
      status: 422,
      details: issues,
    })
  }

  let recurrenceStartDates: Date[] = []
  if (normalizedRrule && normalizedFirstOccurrence) {
    try {
      recurrenceStartDates = generateRecurringStartDates({
        rrule: normalizedRrule,
        firstStart: normalizedFirstOccurrence.startAt,
      })
    } catch (error) {
      if (error instanceof RecurrenceError) {
        return jsonErrorWithStatus("INVALID_RRULE", error.message, { status: 422 })
      }
      console.error("[events.POST]", error)
      return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to process recurrence.", {
        status: 500,
      })
    }
  }

  try {
    const event = await prisma.event.create({
      data: {
        user_id: viewerId,
        title: normalizedTitle,
        tag: normalizedTag,
        description: typeof description === "string" && description.trim() ? description.trim() : null,
        visibility: normalizedVisibility,
        duration_minutes: duration,
        rrule: normalizedRrule,
        exdates: normalizedExdates,
      },
    })

    const createdOccurrences: OccurrenceModel[] = []

    if (normalizedFirstOccurrence) {
      const first = await prisma.occurrence.create({
        data: {
          event_id: event.id,
          user_id: viewerId,
          start_at: normalizedFirstOccurrence.startAt,
          end_at: normalizedFirstOccurrence.endAt,
          status: OccurrenceStatus.SCHEDULED,
          notes: normalizedFirstOccurrence.notes,
        },
      })
      createdOccurrences.push(first)
    }

    if (recurrenceStartDates.length > 0) {
      const additional = await prisma.$transaction(
        recurrenceStartDates.map((startDate) =>
          prisma.occurrence.create({
            data: {
              event_id: event.id,
              user_id: viewerId,
              start_at: startDate,
              end_at: new Date(startDate.getTime() + duration * 60 * 1000),
              status: OccurrenceStatus.SCHEDULED,
              notes: normalizedFirstOccurrence?.notes ?? null,
            },
          }),
        ),
      )
      createdOccurrences.push(...additional)
    }

    return jsonSuccess(
      {
        event: serializeEvent(event, createdOccurrences),
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("[events.POST]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to create event.", { status: 500 })
  }
}
