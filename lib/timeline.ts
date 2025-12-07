import { Prisma } from "@prisma/client"
import type { ReactionType } from "@prisma/client"

export const MANUAL_POST_MAX_LENGTH = 280
export const MANUAL_POST_MIN_LENGTH = 1
export const MEMO_MAX_LENGTH = 500
export const TIMELINE_DEFAULT_LIMIT = 20
export const TIMELINE_MAX_LIMIT = 50

export const TIMELINE_POST_KIND = {
  AUTO_DONE: "AUTO_DONE",
  AUTO_MISSED: "AUTO_MISSED",
  MANUAL_NOTE: "MANUAL_NOTE",
} as const

export type TimelinePostKindValue = (typeof TIMELINE_POST_KIND)[keyof typeof TIMELINE_POST_KIND]

export const timelinePostInclude = Prisma.validator<Prisma.TimelinePostInclude>()({
  user: {
    select: {
      id: true,
      name: true,
      avatar: true,
      avatar_color: true,
    },
  },
  occurrence: {
    select: {
      id: true,
      status: true,
      start_at: true,
      end_at: true,
      is_all_day: true,
      event: {
        select: {
          id: true,
          title: true,
          is_all_day: true,
          tag: true,
        },
      },
    },
  },
  reactions: {
    select: {
      user_id: true,
      type: true,
    },
  },
})

export type TimelinePostWithRelations = Prisma.TimelinePostGetPayload<{
  include: typeof timelinePostInclude
}>

export function createAutoTimelineMessage(kind: TimelinePostKindValue, eventTitle: string | null) {
  const title = eventTitle?.trim() || "タスク"
  if (kind === TIMELINE_POST_KIND.AUTO_DONE) {
    return `「${title}」を完了しました。`
  }
  if (kind === TIMELINE_POST_KIND.AUTO_MISSED) {
    return `「${title}」をサボってしまいました。`
  }
  return "取り組みの記録を追加しました。"
}

export function sanitizeMemo(memo: unknown) {
  if (memo == null) {
    return null
  }

  if (typeof memo !== "string") {
    return { error: "メモは文字列で指定してください。" }
  }

  const trimmed = memo.trim()
  if (trimmed.length === 0) {
    return null
  }

  if (trimmed.length > MEMO_MAX_LENGTH) {
    return { error: `メモは最大 ${MEMO_MAX_LENGTH} 文字までです。` }
  }

  return trimmed
}

export function sanitizeManualMessage(message: unknown) {
  if (typeof message !== "string") {
    return { error: "投稿内容は文字列で指定してください。" }
  }
  const trimmed = message.trim()
  if (trimmed.length < MANUAL_POST_MIN_LENGTH) {
    return { error: "投稿内容を入力してください。" }
  }
  if (trimmed.length > MANUAL_POST_MAX_LENGTH) {
    return { error: `投稿内容は最大 ${MANUAL_POST_MAX_LENGTH} 文字までです。` }
  }
  return trimmed
}

export function serializeTimelinePost(post: TimelinePostWithRelations, viewerId?: string) {
  let likes = 0
  let bads = 0
  let viewerReaction: ReactionType | null = null

  post.reactions.forEach((reaction) => {
    if (reaction.type === "LIKE") {
      likes += 1
    } else if (reaction.type === "BAD") {
      bads += 1
    }
    if (viewerId && reaction.user_id === viewerId) {
      viewerReaction = reaction.type
    }
  })

  const isOwner = post.user.id === viewerId
  const canEditManual = isOwner && post.kind === TIMELINE_POST_KIND.MANUAL_NOTE
  const canEditMemo =
    isOwner &&
    (post.kind === TIMELINE_POST_KIND.AUTO_DONE || post.kind === TIMELINE_POST_KIND.AUTO_MISSED)

  return {
    id: post.id,
    message: post.message,
    kind: post.kind,
    memo: post.memo ?? null,
    memoUpdatedAt: post.memo_updated_at ? post.memo_updated_at.toISOString() : null,
    createdAt: post.created_at.toISOString(),
    updatedAt: post.updated_at.toISOString(),
    author: {
      id: post.user.id,
      name: post.user.name,
      avatar: post.user.avatar,
      color: post.user.avatar_color,
    },
    occurrence: post.occurrence
      ? {
          id: post.occurrence.id,
          status: post.occurrence.status,
          startAt: post.occurrence.start_at.toISOString(),
          endAt: post.occurrence.end_at.toISOString(),
          isAllDay: post.occurrence.is_all_day,
          event: post.occurrence.event
            ? {
                id: post.occurrence.event.id,
                title: post.occurrence.event.title,
                isAllDay: post.occurrence.event.is_all_day,
                tag: post.occurrence.event.tag,
              }
            : null,
        }
      : null,
    reactions: {
      likes,
      bads,
      viewerReaction,
    },
    permissions: {
      canEditManual,
      canEditMemo,
    },
  }
}
