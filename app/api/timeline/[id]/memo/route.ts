import type { NextRequest } from "next/server"

import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import { prisma } from "@/lib/prisma"
import {
  TIMELINE_POST_KIND,
  sanitizeMemo,
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

  const { memo } = payload as Record<string, unknown>

  const memoResult = sanitizeMemo(memo)
  if (typeof memoResult === "object" && memoResult !== null && "error" in memoResult) {
    return jsonErrorWithStatus("VALIDATION_ERROR", memoResult.error, {
      status: 422,
      details: { memo: memoResult.error },
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

    if (
      existing.kind !== TIMELINE_POST_KIND.AUTO_DONE &&
      existing.kind !== TIMELINE_POST_KIND.AUTO_MISSED
    ) {
      return jsonErrorWithStatus(
        "MEMO_NOT_ALLOWED",
        "Only automatic timeline posts support memos.",
        { status: 403 },
      )
    }

    const normalizedMemo = typeof memoResult === "string" ? memoResult : null
    const updateData = normalizedMemo
      ? { memo: normalizedMemo, memo_updated_at: new Date() }
      : { memo: null, memo_updated_at: null }

    const updated = await prisma.timelinePost.update({
      where: { id },
      data: updateData,
      include: timelinePostInclude,
    })

    publishRealtime({
      type: "timeline.updated",
      payload: { post: serializeTimelinePost(updated) },
    })

    return jsonSuccess({ post: serializeTimelinePost(updated, viewerId) })
  } catch (error) {
    console.error("[timeline/:id/memo.PATCH]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to update memo.", { status: 500 })
  }
}
