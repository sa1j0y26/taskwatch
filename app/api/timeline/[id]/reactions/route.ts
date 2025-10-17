import type { NextRequest } from "next/server"

import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import { areUsersFriends } from "@/lib/friendship"
import { prisma } from "@/lib/prisma"
import { publishRealtime } from "@/lib/realtime"
import type { ReactionType } from "@prisma/client"
import { ReactionType as ReactionTypeEnum } from "@prisma/client"

function parseReactionType(value: unknown): ReactionType | null {
  if (typeof value !== "string") {
    return null
  }
  const upper = value.toUpperCase()
  if (upper === ReactionTypeEnum.LIKE) {
    return ReactionTypeEnum.LIKE
  }
  if (upper === ReactionTypeEnum.BAD) {
    return ReactionTypeEnum.BAD
  }
  return null
}

async function ensurePostAccess(postId: string, viewerId: string) {
  const post = await prisma.timelinePost.findUnique({
    where: { id: postId },
    select: { id: true, user_id: true },
  })

  if (!post) {
    return { error: jsonErrorWithStatus("POST_NOT_FOUND", "Timeline post not found.", { status: 404 }) }
  }

  if (post.user_id === viewerId) {
    return { post }
  }

  const canView = await areUsersFriends(viewerId, post.user_id)
  if (!canView) {
    return { error: jsonErrorWithStatus("FORBIDDEN", "You do not have access to this post.", { status: 403 }) }
  }

  return { post }
}

function buildReactionSummary(postId: string, viewerId: string) {
  return prisma.$transaction(async (tx) => {
    const aggregates = await tx.reaction.groupBy({
      by: ["type"],
      where: { post_id: postId },
      _count: { _all: true },
    })

    const viewerReaction = await tx.reaction.findUnique({
      where: {
        post_id_user_id: {
          post_id: postId,
          user_id: viewerId,
        },
      },
      select: { type: true },
    })

    let likes = 0
    let bads = 0
    aggregates.forEach((aggregate) => {
      if (aggregate.type === ReactionTypeEnum.LIKE) {
        likes = aggregate._count._all
      } else if (aggregate.type === ReactionTypeEnum.BAD) {
        bads = aggregate._count._all
      }
    })

    return {
      likes,
      bads,
      viewerReaction: viewerReaction?.type ?? null,
    }
  })
}

export async function POST(request: NextRequest, context: unknown) {
  const { id } = (context as { params: { id: string } }).params

  const session = await auth()
  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id

  const access = await ensurePostAccess(id, viewerId)
  if ("error" in access) {
    return access.error
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonErrorWithStatus("INVALID_JSON", "Request body must be valid JSON.", { status: 400 })
  }

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonErrorWithStatus("INVALID_BODY", "Request body must be an object.", { status: 400 })
  }

  const reactionType = parseReactionType((payload as Record<string, unknown>).type)
  if (!reactionType) {
    return jsonErrorWithStatus("INVALID_REACTION", "type must be LIKE or BAD.", { status: 422 })
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.reaction.findUnique({
        where: {
          post_id_user_id: {
            post_id: id,
            user_id: viewerId,
          },
        },
      })

      if (existing && existing.type === reactionType) {
        await tx.reaction.delete({ where: { id: existing.id } })
        return
      }

      if (existing) {
        await tx.reaction.update({ where: { id: existing.id }, data: { type: reactionType } })
        return
      }

      await tx.reaction.create({
        data: {
          post_id: id,
          user_id: viewerId,
          type: reactionType,
        },
      })
    })

    const summary = await buildReactionSummary(id, viewerId)

    publishRealtime({
      type: "timeline.reacted",
      payload: {
        postId: id,
        reactions: {
          likes: summary.likes,
          bads: summary.bads,
        },
      },
    })

    return jsonSuccess({ reactions: summary })
  } catch (error) {
    console.error("[timeline/:id/reactions.POST]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to update reaction.", { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: unknown) {
  const { id } = (context as { params: { id: string } }).params

  const session = await auth()
  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id

  const access = await ensurePostAccess(id, viewerId)
  if ("error" in access) {
    return access.error
  }

  try {
    await prisma.reaction.deleteMany({
      where: {
        post_id: id,
        user_id: viewerId,
      },
    })

    const summary = await buildReactionSummary(id, viewerId)

    publishRealtime({
      type: "timeline.reacted",
      payload: {
        postId: id,
        reactions: {
          likes: summary.likes,
          bads: summary.bads,
        },
      },
    })

    return jsonSuccess({ reactions: summary })
  } catch (error) {
    console.error("[timeline/:id/reactions.DELETE]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to delete reaction.", { status: 500 })
  }
}
