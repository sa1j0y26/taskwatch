import type { NextRequest } from "next/server"

import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import { prisma } from "@/lib/prisma"
import {
  TIMELINE_POST_KIND,
  sanitizeManualMessage,
  serializeTimelinePost,
  timelinePostInclude,
} from "@/lib/timeline"
import { publishRealtime } from "@/lib/realtime"

export async function PATCH(request: NextRequest, context: unknown) {
  const { id } = (context as { params: { id: string } }).params

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

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonErrorWithStatus("INVALID_BODY", "Request body must be an object.", { status: 400 })
  }

  const { message } = payload as Record<string, unknown>

  const sanitizedMessage = sanitizeManualMessage(message)
  if (typeof sanitizedMessage !== "string") {
    return jsonErrorWithStatus("VALIDATION_ERROR", sanitizedMessage.error, {
      status: 422,
      details: { message: sanitizedMessage.error },
    })
  }

  try {
    const existing = await prisma.timelinePost.findUnique({
      where: { id },
      include: timelinePostInclude,
    })

    if (!existing || existing.user_id !== viewerId) {
      return jsonErrorWithStatus("POST_NOT_FOUND", "Timeline post not found.", { status: 404 })
    }

    if (existing.kind !== TIMELINE_POST_KIND.MANUAL_NOTE) {
      return jsonErrorWithStatus(
        "EDIT_NOT_ALLOWED",
        "Only manual notes can be edited.",
        { status: 403 },
      )
    }

    const updated = await prisma.timelinePost.update({
      where: { id },
      data: {
        message: sanitizedMessage,
      },
      include: timelinePostInclude,
    })

    publishRealtime({
      type: "timeline.updated",
      payload: { post: serializeTimelinePost(updated) },
    })

    return jsonSuccess({ post: serializeTimelinePost(updated, viewerId) })
  } catch (error) {
    console.error("[timeline/:id.PATCH]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to update timeline post.", { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: unknown) {
  const { id } = (context as { params: { id: string } }).params

  const session = await auth()
  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id

  try {
    const existing = await prisma.timelinePost.findUnique({
      where: { id },
      select: {
        id: true,
        user_id: true,
        kind: true,
      },
    })

    if (!existing || existing.user_id !== viewerId) {
      return jsonErrorWithStatus("POST_NOT_FOUND", "Timeline post not found.", { status: 404 })
    }

    if (existing.kind !== TIMELINE_POST_KIND.MANUAL_NOTE) {
      return jsonErrorWithStatus(
        "DELETE_NOT_ALLOWED",
        "Only manual notes can be deleted.",
        { status: 403 },
      )
    }

    await prisma.timelinePost.delete({ where: { id } })

    publishRealtime({
      type: "timeline.deleted",
      payload: { postId: id },
    })

    return new Response(null, { status: 204 })
  } catch (error) {
    console.error("[timeline/:id.DELETE]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to delete timeline post.", { status: 500 })
  }
}
