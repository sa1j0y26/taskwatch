import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import { isRecord, parseDate, serializeOccurrence } from "@/lib/events/helpers"
import { prisma } from "@/lib/prisma"

const MAX_NOTES_LENGTH = 1000

type RouteParams = {
  params: {
    id: string
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id
  const occurrenceId = params.id

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonErrorWithStatus("INVALID_JSON", "Request body must be valid JSON.", { status: 400 })
  }

  if (!isRecord(payload)) {
    return jsonErrorWithStatus("INVALID_BODY", "Request body must be an object.", { status: 400 })
  }

  const { startAt, endAt, notes } = payload
  const allowedKeys = new Set(["startAt", "endAt", "notes"])
  const unknownKeys = Object.keys(payload).filter((key) => !allowedKeys.has(key))

  const issues: Record<string, string> = {}
  if (unknownKeys.length > 0) {
    issues.unknown = `Unsupported fields: ${unknownKeys.join(", ")}`
  }

  if (startAt != null && typeof startAt !== "string") {
    issues.startAt = "startAt must be an ISO date string if provided."
  }

  if (endAt != null && typeof endAt !== "string") {
    issues.endAt = "endAt must be an ISO date string if provided."
  }

  if (notes !== undefined) {
    if (notes !== null && typeof notes !== "string") {
      issues.notes = "notes must be a string or null."
    } else if (typeof notes === "string" && notes.length > MAX_NOTES_LENGTH) {
      issues.notes = `notes must be ${MAX_NOTES_LENGTH} characters or less.`
    }
  }

  if (Object.keys(issues).length > 0) {
    return jsonErrorWithStatus("VALIDATION_ERROR", "Request validation failed.", {
      status: 422,
      details: issues,
    })
  }

  if (startAt == null && endAt == null && notes === undefined) {
    return jsonErrorWithStatus("EMPTY_UPDATE", "Provide startAt/endAt and/or notes to update.", {
      status: 400,
    })
  }

  try {
    const current = await prisma.occurrence.findFirst({
      where: {
        id: occurrenceId,
        user_id: viewerId,
      },
      include: {
        event: {
          select: { id: true, duration_minutes: true },
        },
      },
    })

    if (!current) {
      return jsonErrorWithStatus("OCCURRENCE_NOT_FOUND", "Occurrence not found.", { status: 404 })
    }

    const nextStart = startAt ? parseDate(startAt) : current.start_at
    const nextEnd = endAt ? parseDate(endAt) : current.end_at

    if (!nextStart || !nextEnd) {
      return jsonErrorWithStatus("INVALID_RANGE", "startAt/endAt must be valid ISO dates.", {
        status: 422,
      })
    }

    if (nextEnd <= nextStart) {
      return jsonErrorWithStatus("INVALID_RANGE", "endAt must be later than startAt.", {
        status: 422,
      })
    }

    const updates: Record<string, unknown> = {}
    if (startAt) {
      updates.start_at = nextStart
    }
    if (endAt) {
      updates.end_at = nextEnd
    }
    if (notes !== undefined) {
      updates.notes = typeof notes === "string" && notes.trim() ? notes.trim() : null
    }

    if (Object.keys(updates).length === 0) {
      return jsonErrorWithStatus("NO_CHANGES", "No valid fields provided for update.", {
        status: 400,
      })
    }

    const updated = await prisma.occurrence.update({
      where: { id: occurrenceId },
      data: updates,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            tag: true,
            visibility: true,
          },
        },
      },
    })

    return jsonSuccess({
      occurrence: {
        ...serializeOccurrence(updated),
        event: updated.event
          ? {
              id: updated.event.id,
              title: updated.event.title,
              tag: updated.event.tag,
              visibility: updated.event.visibility,
            }
          : null,
      },
    })
  } catch (error) {
    console.error("[occurrences/:id.PATCH]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to update occurrence.", { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id
  const occurrenceId = params.id

  try {
    const result = await prisma.occurrence.deleteMany({
      where: {
        id: occurrenceId,
        user_id: viewerId,
      },
    })

    if (result.count === 0) {
      return jsonErrorWithStatus("OCCURRENCE_NOT_FOUND", "Occurrence not found.", { status: 404 })
    }

    return new Response(null, { status: 204 })
  } catch (error) {
    console.error("[occurrences/:id.DELETE]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to delete occurrence.", { status: 500 })
  }
}
