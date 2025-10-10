import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import {
  isRecord,
  parseDate,
  serializeOccurrence,
} from "@/lib/events/helpers"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { OccurrenceStatus } from "@prisma/client"

const MAX_NOTES_LENGTH = 1000

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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

  const { status, completedAt, notes } = payload

  const allowedKeys = new Set(["status", "completedAt", "notes"])
  const unknownKeys = Object.keys(payload).filter((key) => !allowedKeys.has(key))

  const issues: Record<string, string> = {}

  if (unknownKeys.length > 0) {
    issues.unknown = `Unsupported fields: ${unknownKeys.join(", ")}`
  }

  if (typeof status !== "string") {
    issues.status = "status must be provided as a string."
  }

  const normalizedStatus = typeof status === "string" ? status.toUpperCase() : null

  if (
    normalizedStatus !== OccurrenceStatus.DONE &&
    normalizedStatus !== OccurrenceStatus.MISSED
  ) {
    issues.status = "status must be DONE or MISSED."
  }

  let normalizedCompletedAt: Date | null = null
  if (normalizedStatus === OccurrenceStatus.DONE) {
    if (typeof completedAt !== "string") {
      issues.completedAt = "completedAt must be provided as an ISO date string when status is DONE."
    } else {
      normalizedCompletedAt = parseDate(completedAt)
      if (!normalizedCompletedAt) {
        issues.completedAt = "completedAt must be a valid ISO date string."
      }
    }
  } else if (completedAt !== undefined && completedAt !== null) {
    issues.completedAt = "completedAt is only supported when status is DONE."
  }

  let normalizedNotes: string | null = null
  if (notes !== undefined) {
    if (notes !== null && typeof notes !== "string") {
      issues.notes = "notes must be a string or null."
    } else if (typeof notes === "string") {
      const trimmed = notes.trim()
      if (trimmed.length > MAX_NOTES_LENGTH) {
        issues.notes = `notes must be ${MAX_NOTES_LENGTH} characters or less.`
      } else {
        normalizedNotes = trimmed.length > 0 ? trimmed : null
      }
    }
  }

  if (Object.keys(issues).length > 0) {
    return jsonErrorWithStatus("VALIDATION_ERROR", "Request validation failed.", {
      status: 422,
      details: issues,
    })
  }

  const updateData: Prisma.OccurrenceUpdateInput = {
    status: normalizedStatus!,
    completed_at: normalizedStatus === OccurrenceStatus.DONE ? normalizedCompletedAt : null,
  }

  if (notes !== undefined) {
    updateData.notes = normalizedNotes
  }

  try {
    const existing = await prisma.occurrence.findFirst({
      where: {
        id: occurrenceId,
        user_id: viewerId,
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            visibility: true,
          },
        },
      },
    })

    if (!existing) {
      return jsonErrorWithStatus("OCCURRENCE_NOT_FOUND", "Occurrence not found.", { status: 404 })
    }

    const updated = await prisma.occurrence.update({
      where: {
        id: occurrenceId,
      },
      data: updateData,
      include: {
        event: {
          select: {
            id: true,
            title: true,
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
              visibility: updated.event.visibility,
            }
          : null,
      },
    })
  } catch (error) {
    console.error("[occurrences/:id/status.PATCH]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to update occurrence.", { status: 500 })
  }
}
