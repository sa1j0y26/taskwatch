import type { NextRequest } from "next/server"

import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import { isRecord, parseDate, serializeOccurrence } from "@/lib/events/helpers"
import { prisma } from "@/lib/prisma"
import {
  TIMELINE_POST_KIND,
  createAutoTimelineMessage,
  serializeTimelinePost,
  timelinePostInclude,
} from "@/lib/timeline"
import { publishRealtime } from "@/lib/realtime"
import type { Prisma } from "@prisma/client"
import { OccurrenceStatus } from "@prisma/client"

const MAX_NOTES_LENGTH = 1000

export async function PATCH(request: NextRequest, context: unknown) {
  const { id } = (context as { params: { id: string } }).params

  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id
  const occurrenceId = id

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

  const nextStatus = normalizedStatus as OccurrenceStatus

  const updateData: Prisma.OccurrenceUpdateInput = {
    status: nextStatus,
    completed_at: nextStatus === OccurrenceStatus.DONE ? normalizedCompletedAt : null,
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
            tag: true,
            is_all_day: true,
            visibility: true,
          },
        },
      },
    })

    if (!existing) {
      return jsonErrorWithStatus("OCCURRENCE_NOT_FOUND", "Occurrence not found.", { status: 404 })
    }

    if (existing.status === normalizedStatus) {
      return jsonErrorWithStatus(
        "STATUS_UNCHANGED",
        "Occurrence status is already set to the requested value.",
        { status: 409 },
      )
    }

    const {
      occurrence: updatedOccurrence,
      timelinePost,
      createdNewTimeline,
    } = await prisma.$transaction(async (tx) => {
      const updatedOccurrence = await tx.occurrence.update({
        where: {
          id: occurrenceId,
        },
        data: updateData,
        include: {
          event: {
            select: {
              id: true,
              title: true,
              tag: true,
              is_all_day: true,
              visibility: true,
            },
          },
        },
      })

      const existingTimeline = await tx.timelinePost.findFirst({
        where: {
          occurrence_id: occurrenceId,
        },
        select: {
          id: true,
          memo: true,
        },
      })

      let timelineRecord: Prisma.TimelinePostGetPayload<{
        include: typeof timelinePostInclude
      }> | null = null

      const createdNewTimeline = !existingTimeline

      if (createdNewTimeline) {
        const kind =
          nextStatus === OccurrenceStatus.DONE
            ? TIMELINE_POST_KIND.AUTO_DONE
            : TIMELINE_POST_KIND.AUTO_MISSED

        const message = createAutoTimelineMessage(kind, updatedOccurrence.event?.title ?? null)

        const created = await tx.timelinePost.create({
          data: {
            user_id: viewerId,
            occurrence_id: occurrenceId,
            message,
            kind,
            visibility: "PRIVATE",
          },
          include: timelinePostInclude,
        })
        timelineRecord = created
      } else {
        const kind =
          nextStatus === OccurrenceStatus.DONE
            ? TIMELINE_POST_KIND.AUTO_DONE
            : TIMELINE_POST_KIND.AUTO_MISSED

        const message = createAutoTimelineMessage(kind, updatedOccurrence.event?.title ?? null)

        const updatedTimeline = await tx.timelinePost.update({
          where: { id: existingTimeline.id },
          data: {
            message,
            kind,
          },
          include: timelinePostInclude,
        })
        timelineRecord = updatedTimeline
      }

      const timelinePost = timelineRecord

      return { occurrence: updatedOccurrence, timelinePost, createdNewTimeline }
    })

    if (timelinePost) {
      publishRealtime({
        type: createdNewTimeline ? "timeline.posted" : "timeline.updated",
        payload: {
          post: serializeTimelinePost(timelinePost),
        },
      })
    }

    publishRealtime({
      type: "occurrence.status_changed",
      payload: {
        occurrenceId,
        status: nextStatus,
        timelineKind: timelinePost ? timelinePost.kind : null,
      },
    })

    return jsonSuccess({
      occurrence: {
        ...serializeOccurrence(updatedOccurrence),
        event: updatedOccurrence.event
          ? {
              id: updatedOccurrence.event.id,
              title: updatedOccurrence.event.title,
              tag: updatedOccurrence.event.tag,
              visibility: updatedOccurrence.event.visibility,
            }
          : null,
      },
    })
  } catch (error) {
    console.error("[occurrences/:id/status.PATCH]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to update occurrence.", { status: 500 })
  }
}
