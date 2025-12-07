import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import {
  DEFAULT_OCCURRENCE_RANGE_DAYS,
  ONE_DAY_MS,
  isRecord,
  parseDate,
  serializeEvent,
  startOfDay,
} from "@/lib/events/helpers"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { Visibility } from "@prisma/client"
import type { NextRequest } from "next/server"

export const runtime = "nodejs"

export async function GET(request: NextRequest, context: unknown) {
  const { id } = (context as { params: { id: string } }).params

  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id
  const eventId = id

  const { searchParams } = new URL(request.url)
  const withOccurrences = searchParams.get("withOccurrences") === "true"
  const rangeStartParam = searchParams.get("rangeStart")
  const rangeEndParam = searchParams.get("rangeEnd")

  const range = withOccurrences
    ? resolveOccurrenceRange(rangeStartParam, rangeEndParam)
    : { rangeStart: null, rangeEnd: null }

  if (range instanceof Response) {
    return range
  }

  try {
    if (withOccurrences) {
      const event = await prisma.event.findFirst({
        where: {
          id: eventId,
          user_id: viewerId,
        },
        include: {
          occurrences: {
            where: {
              ...(range.rangeStart || range.rangeEnd
                ? {
                    start_at: {
                      ...(range.rangeStart ? { gte: range.rangeStart } : {}),
                      ...(range.rangeEnd ? { lt: range.rangeEnd } : {}),
                    },
                  }
                : {}),
            },
            orderBy: { start_at: "asc" },
          },
        },
      })

      if (!event) {
        return jsonErrorWithStatus("EVENT_NOT_FOUND", "Event not found.", { status: 404 })
      }

      return jsonSuccess({
        event: serializeEvent(event, event.occurrences ?? []),
      })
    }

    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
        user_id: viewerId,
      },
    })

    if (!event) {
      return jsonErrorWithStatus("EVENT_NOT_FOUND", "Event not found.", { status: 404 })
    }

    return jsonSuccess({
      event: serializeEvent(event),
    })
  } catch (error) {
    console.error("[events/:id.GET]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to fetch event.", { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: unknown) {
  const { id } = (context as { params: { id: string } }).params

  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id
  const eventId = id

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonErrorWithStatus("INVALID_JSON", "Request body must be valid JSON.", { status: 400 })
  }

  if (!isRecord(payload)) {
    return jsonErrorWithStatus("INVALID_BODY", "Request body must be an object.", { status: 400 })
  }

  const { title, description, tag, visibility, durationMinutes, rrule, exdates, isAllDay } = payload

  const allowedKeys = new Set([
    "title",
    "description",
    "tag",
    "visibility",
    "durationMinutes",
    "rrule",
    "exdates",
    "isAllDay",
  ])

  const unknownKeys = Object.keys(payload).filter((key) => !allowedKeys.has(key))
  const updateData: Prisma.EventUpdateInput = {}
  const issues: Record<string, string> = {}

  if (unknownKeys.length > 0) {
    issues.unknown = `Unsupported fields: ${unknownKeys.join(", ")}`
  }

  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) {
      issues.title = "title must be a non-empty string."
    } else if (title.trim().length > 120) {
      issues.title = "title must be 120 characters or less."
    } else {
      updateData.title = title.trim()
    }
  }

  if (description !== undefined) {
    if (description !== null && typeof description !== "string") {
      issues.description = "description must be a string or null."
    } else {
      updateData.description = description === null ? null : description.trim()
    }
  }

  if (tag !== undefined) {
    if (tag !== null && typeof tag !== "string") {
      issues.tag = "tag must be a string or null."
    } else if (typeof tag === "string" && tag.trim().length > 32) {
      issues.tag = "tag must be 32 characters or less."
    } else {
      updateData.tag = tag === null ? null : tag.trim().length > 0 ? tag.trim() : null
    }
  }

  if (visibility !== undefined) {
    if (typeof visibility !== "string") {
      issues.visibility = "visibility must be a string."
    } else {
      const upper = visibility.toUpperCase()
      if (upper === Visibility.PRIVATE || upper === Visibility.PUBLIC) {
        updateData.visibility = upper
      } else {
        issues.visibility = "visibility must be PRIVATE or PUBLIC."
      }
    }
  }

  if (durationMinutes !== undefined) {
    if (typeof durationMinutes !== "number" || !Number.isInteger(durationMinutes)) {
      issues.durationMinutes = "durationMinutes must be an integer."
    } else if (durationMinutes < 5 || durationMinutes > 1440) {
      issues.durationMinutes = "durationMinutes must be between 5 and 1440."
    } else {
      updateData.duration_minutes = durationMinutes
    }
  }

  if (isAllDay !== undefined) {
    if (typeof isAllDay !== "boolean") {
      issues.isAllDay = "isAllDay must be a boolean."
    } else {
      updateData.is_all_day = isAllDay
      if (isAllDay && durationMinutes === undefined) {
        updateData.duration_minutes = 1440
      }
    }
  }

  if (rrule !== undefined) {
    if (rrule !== null && typeof rrule !== "string") {
      issues.rrule = "rrule must be a string or null."
    } else if (typeof rrule === "string" && rrule.length > 2000) {
      issues.rrule = "rrule must be 2000 characters or less."
    } else {
      updateData.rrule = rrule ?? null
    }
  }

  if (exdates !== undefined) {
    if (exdates !== null && !Array.isArray(exdates)) {
      issues.exdates = "exdates must be an array of ISO date strings or null."
    } else if (Array.isArray(exdates)) {
      const parsed = exdates.map((value) => (typeof value === "string" ? parseDate(value) : null))
      if (parsed.some((date) => !date)) {
        issues.exdates = "exdates must contain valid ISO date strings."
      } else {
        updateData.exdates = parsed.map((date) => date!)
      }
    } else if (exdates === null) {
      updateData.exdates = []
    }
  }

  if (Object.keys(payload).length === 0) {
    return jsonErrorWithStatus("EMPTY_UPDATE", "Provide at least one field to update.", {
      status: 400,
    })
  }

  if (Object.keys(issues).length > 0) {
    return jsonErrorWithStatus("VALIDATION_ERROR", "Request validation failed.", {
      status: 422,
      details: issues,
    })
  }

  if (Object.keys(updateData).length === 0) {
    return jsonErrorWithStatus("NO_CHANGES", "No valid fields provided for update.", {
      status: 400,
    })
  }

  try {
    const existing = await prisma.event.findFirst({
      where: {
        id: eventId,
        user_id: viewerId,
      },
    })

    if (!existing) {
      return jsonErrorWithStatus("EVENT_NOT_FOUND", "Event not found.", { status: 404 })
    }

    const event = await prisma.event.update({
      where: {
        id: eventId,
      },
      data: updateData,
    })

    return jsonSuccess({ event: serializeEvent(event) })
  } catch (error) {
    console.error("[events/:id.PATCH]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to update event.", { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: unknown) {
  const { id } = (context as { params: { id: string } }).params

  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id
  const eventId = id

  try {
    const result = await prisma.event.deleteMany({
      where: {
        id: eventId,
        user_id: viewerId,
      },
    })

    if (result.count === 0) {
      return jsonErrorWithStatus("EVENT_NOT_FOUND", "Event not found.", { status: 404 })
    }

    return new Response(null, { status: 204 })
  } catch (error) {
    console.error("[events/:id.DELETE]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to delete event.", { status: 500 })
  }
}

type OccurrenceRange = {
  rangeStart: Date | null
  rangeEnd: Date | null
}

function resolveOccurrenceRange(rangeStartParam: string | null, rangeEndParam: string | null):
  | OccurrenceRange
  | Response {
  let rangeStart: Date | null = null
  let rangeEnd: Date | null = null

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

  return { rangeStart, rangeEnd }
}
