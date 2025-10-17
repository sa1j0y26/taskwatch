import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import { getFriendIdsForUser } from "@/lib/friendship"
import { prisma } from "@/lib/prisma"
import {
  TIMELINE_DEFAULT_LIMIT,
  TIMELINE_MAX_LIMIT,
  TIMELINE_POST_KIND,
  sanitizeManualMessage,
  serializeTimelinePost,
  timelinePostInclude,
} from "@/lib/timeline"
import { publishRealtime } from "@/lib/realtime"

export async function GET(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id
  const { searchParams } = new URL(request.url)

  const limitParam = searchParams.get("limit")
  const cursorParam = searchParams.get("cursor")

  let limit = TIMELINE_DEFAULT_LIMIT
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return jsonErrorWithStatus("INVALID_LIMIT", "limit must be a positive integer.", {
        status: 422,
      })
    }
    limit = Math.min(parsed, TIMELINE_MAX_LIMIT)
  }

  const visibleUserIds = await getFriendIdsForUser(viewerId)

  let cursor: { id: string } | undefined
  if (cursorParam) {
    const cursorPost = await prisma.timelinePost.findFirst({
      where: {
        id: cursorParam,
        user_id: { in: visibleUserIds },
      },
      select: { id: true },
    })

    if (!cursorPost) {
      return jsonErrorWithStatus("INVALID_CURSOR", "Cursor does not reference an accessible post.", {
        status: 404,
      })
    }

    cursor = { id: cursorPost.id }
  }

  try {
    const posts = await prisma.timelinePost.findMany({
      where: {
        user_id: {
          in: visibleUserIds,
        },
      },
      orderBy: {
        id: "desc",
      },
      take: limit + 1,
      ...(cursor ? { cursor, skip: 1 } : {}),
      include: timelinePostInclude,
    })

    const hasMore = posts.length > limit
    const items = posts.slice(0, limit).map((post) => serializeTimelinePost(post, viewerId))
    const nextCursor = hasMore ? posts[limit].id : null

    return jsonSuccess({
      items,
      nextCursor,
      hasMore,
    })
  } catch (error) {
    console.error("[timeline.GET]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to load timeline.", { status: 500 })
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

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonErrorWithStatus("INVALID_BODY", "Request body must be an object.", { status: 400 })
  }

  const { message, occurrenceId, memo, visibility } = payload as Record<string, unknown>

  const issues: Record<string, string> = {}

  if (occurrenceId != null) {
    issues.occurrenceId = "Manual timeline posts cannot be linked to tasks."
  }

  if (memo != null) {
    issues.memo = "Manual timeline posts do not support memo updates at creation."
  }

  if (visibility != null) {
    issues.visibility = "Visibility cannot be changed for timeline posts."
  }

  const sanitizedMessageResult = sanitizeManualMessage(message)
  if (typeof sanitizedMessageResult !== "string") {
    issues.message = sanitizedMessageResult.error
  }

  if (Object.keys(issues).length > 0) {
    return jsonErrorWithStatus("VALIDATION_ERROR", "Request validation failed.", {
      status: 422,
      details: issues,
    })
  }

  const normalizedMessage = sanitizedMessageResult as string

  try {
    const created = await prisma.timelinePost.create({
      data: {
        user_id: viewerId,
        message: normalizedMessage,
        kind: TIMELINE_POST_KIND.MANUAL_NOTE,
        visibility: "PRIVATE",
      },
      include: timelinePostInclude,
    })

    publishRealtime({
      type: "timeline.posted",
      payload: { post: serializeTimelinePost(created) },
    })

    return jsonSuccess(
      {
        post: serializeTimelinePost(created, viewerId),
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("[timeline.POST]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to create timeline post.", { status: 500 })
  }
}
