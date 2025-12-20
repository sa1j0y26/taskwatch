"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"

import { DashboardShell } from "../_components/dashboard-shell"
import { getAvatarInitial, getAvatarTextColor, normalizeHexColor } from "@/lib/avatar"

type Author = {
  id: string
  name: string
  avatar: string | null
  color: string | null
}

type TimelineOccurrence = {
  id: string
  status: "SCHEDULED" | "DONE" | "MISSED"
  startAt: string
  endAt: string
  event: {
    id: string
    title: string
    tag: string | null
  } | null
} | null

type TimelinePost = {
  id: string
  kind: "AUTO_DONE" | "AUTO_MISSED" | "MANUAL_NOTE"
  message: string
  memo: string | null
  memoUpdatedAt: string | null
  createdAt: string
  updatedAt: string
  author: Author
  occurrence: TimelineOccurrence
  reactions: {
    likes: number
    bads: number
    viewerReaction: "LIKE" | "BAD" | null
  }
  permissions: {
    canEditManual: boolean
    canEditMemo: boolean
  }
}

type TimelineResponse = {
  items: TimelinePost[]
  nextCursor: string | null
  hasMore: boolean
}

type RealtimeEvent =
  | { type: "timeline.posted" | "timeline.updated"; payload: { post: TimelinePost } }
  | { type: "timeline.deleted"; payload: { postId: string } }
  | { type: "timeline.reacted"; payload: { postId: string; reactions: { likes: number; bads: number } } }
  | { type: "ready"; payload: null }
  | { type: "occurrence.status_changed"; payload: unknown }

const STATUS_STYLES: Record<string, string> = {
  AUTO_DONE: "bg-accent/15 text-accent",
  AUTO_MISSED: "bg-strap/60 text-forest",
  MANUAL_NOTE: "bg-forest/10 text-forest/80",
}

const STATUS_LABELS: Record<string, string> = {
  AUTO_DONE: "完了",
  AUTO_MISSED: "未達成",
  MANUAL_NOTE: "メモ",
}

export default function TimelinePage() {
  const [posts, setPosts] = useState<TimelinePost[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newMessage, setNewMessage] = useState("")
  const [newMessageError, setNewMessageError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [manualEditingId, setManualEditingId] = useState<string | null>(null)
  const [manualEditingMessage, setManualEditingMessage] = useState("")
  const [manualEditError, setManualEditError] = useState<string | null>(null)
  const [isManualSaving, setIsManualSaving] = useState(false)

  const [memoEditingId, setMemoEditingId] = useState<string | null>(null)
  const [memoEditingValue, setMemoEditingValue] = useState("")
  const [memoEditError, setMemoEditError] = useState<string | null>(null)
  const [isMemoSaving, startMemoTransition] = useTransition()

  const isMemoSubmitting = isMemoSaving && memoEditingId !== null

  const fetchTimeline = useCallback(
    async (cursor?: string) => {
      const params = new URLSearchParams()
      if (cursor) {
        params.set("cursor", cursor)
      }

      const url = `/api/timeline${params.size > 0 ? `?${params.toString()}` : ""}`

      const response = await fetch(url, {
        method: "GET",
        credentials: "include",
      })

      const body = (await safeParseJSON(response)) as { data?: TimelineResponse; error?: { message?: string } } | null

      if (!response.ok) {
        const message = body?.error?.message ?? "タイムラインの取得に失敗しました。"
        throw new Error(message)
      }

      return body?.data ?? { items: [], nextCursor: null, hasMore: false }
    },
    [],
  )

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setError(null)
    fetchTimeline()
      .then((data) => {
        if (!isMounted) return
        setPosts(data.items)
        setNextCursor(data.nextCursor)
        setHasMore(data.hasMore)
      })
      .catch((err) => {
        if (!isMounted) return
        console.error("[timeline.fetch]", err)
        setError(err instanceof Error ? err.message : "タイムラインの取得に失敗しました。")
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [fetchTimeline])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const eventSource = new EventSource("/api/realtime")

    eventSource.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data) as RealtimeEvent

        if (parsed.type === "timeline.posted" && parsed.payload?.post) {
          setPosts((prev) => {
            const incoming = parsed.payload.post
            return [incoming, ...prev.filter((post) => post.id !== incoming.id)]
          })
        } else if (parsed.type === "timeline.updated" && parsed.payload?.post) {
          setPosts((prev) => {
            const incoming = parsed.payload.post
            let found = false
            const next = prev.map((post) => {
              if (post.id === incoming.id) {
                found = true
                return {
                  ...incoming,
                  reactions: {
                    ...incoming.reactions,
                    viewerReaction: post.reactions.viewerReaction,
                  },
                }
              }
              return post
            })
            return found ? next : prev
          })
        } else if (parsed.type === "timeline.deleted" && parsed.payload?.postId) {
          setPosts((prev) => prev.filter((post) => post.id !== parsed.payload.postId))
        } else if (parsed.type === "timeline.reacted" && parsed.payload) {
          setPosts((prev) =>
            prev.map((post) =>
              post.id === parsed.payload.postId
                ? {
                    ...post,
                    reactions: {
                      ...post.reactions,
                      likes: parsed.payload.reactions.likes,
                      bads: parsed.payload.reactions.bads,
                    },
                  }
                : post,
            ),
          )
        }
      } catch (error) {
        console.error("[timeline.realtime]", error)
      }
    }

    eventSource.onerror = (error) => {
      console.error("[timeline.realtime.error]", error)
    }

    return () => {
      eventSource.close()
    }
  }, [])

  const handleLoadMore = async () => {
    if (!nextCursor || isLoading) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await fetchTimeline(nextCursor)
      setPosts((prev) => {
        const existingIds = new Set(prev.map((post) => post.id))
        const merged = [...prev]
        data.items.forEach((item) => {
          if (!existingIds.has(item.id)) {
            merged.push(item)
          }
        })
        return merged
      })
      setNextCursor(data.nextCursor)
      setHasMore(data.hasMore)
    } catch (err) {
      console.error("[timeline.more]", err)
      setError(err instanceof Error ? err.message : "追加のタイムライン取得に失敗しました。")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreatePost = async () => {
    const message = newMessage.trim()
    if (message.length === 0) {
      setNewMessageError("投稿内容を入力してください。")
      return
    }
    if (message.length > 280) {
      setNewMessageError("投稿内容は280文字以内で入力してください。")
      return
    }

    setIsCreating(true)
    setNewMessageError(null)
    try {
      const response = await fetch("/api/timeline", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      })

      const body = (await safeParseJSON(response)) as {
        data?: { post: TimelinePost }
        error?: { message?: string }
      } | null

      if (!response.ok) {
        const messageText = body?.error?.message ?? "投稿の作成に失敗しました。"
        throw new Error(messageText)
      }

      if (body?.data?.post) {
        const nextPost = body.data.post
        setPosts((prev) => [nextPost, ...prev.filter((post) => post.id !== nextPost.id)])
      }
      setNewMessage("")
    } catch (err) {
      console.error("[timeline.create]", err)
      setNewMessageError(err instanceof Error ? err.message : "投稿の作成に失敗しました。")
    } finally {
      setIsCreating(false)
    }
  }

  const handleBeginManualEdit = (post: TimelinePost) => {
    if (!post.permissions.canEditManual) {
      return
    }
    setManualEditingId(post.id)
    setManualEditingMessage(post.message)
    setManualEditError(null)
  }

  const handleCancelManualEdit = () => {
    setManualEditingId(null)
    setManualEditingMessage("")
    setManualEditError(null)
  }

  const handleSaveManualEdit = async () => {
    if (!manualEditingId) return
    const targetPost = posts.find((item) => item.id === manualEditingId)
    if (!targetPost?.permissions.canEditManual) {
      handleCancelManualEdit()
      return
    }
    const message = manualEditingMessage.trim()
    if (message.length === 0) {
      setManualEditError("投稿内容を入力してください。")
      return
    }
    if (message.length > 280) {
      setManualEditError("投稿内容は280文字以内で入力してください。")
      return
    }

    setIsManualSaving(true)
    setManualEditError(null)
    try {
      const response = await fetch(`/api/timeline/${manualEditingId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      })

      const body = (await safeParseJSON(response)) as {
        data?: { post: TimelinePost }
        error?: { message?: string }
      } | null

      if (!response.ok) {
        const messageText = body?.error?.message ?? "投稿の更新に失敗しました。"
        throw new Error(messageText)
      }

      if (body?.data?.post) {
        const nextPost = body.data.post
        setPosts((prev) => prev.map((post) => (post.id === manualEditingId ? nextPost : post)))
      }
      handleCancelManualEdit()
    } catch (err) {
      console.error("[timeline.edit]", err)
      setManualEditError(err instanceof Error ? err.message : "投稿の更新に失敗しました。")
    } finally {
      setIsManualSaving(false)
    }
  }

  const handleDeleteManualPost = async (postId: string) => {
    if (!window.confirm("この投稿を削除しますか？")) {
      return
    }

    const targetPost = posts.find((item) => item.id === postId)
    if (!targetPost?.permissions.canEditManual) {
      return
    }

    setError(null)
    try {
      const response = await fetch(`/api/timeline/${postId}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!response.ok) {
        const body = (await safeParseJSON(response)) as { error?: { message?: string } } | null
        const message = body?.error?.message ?? "投稿の削除に失敗しました。"
        throw new Error(message)
      }

      setPosts((prev) => prev.filter((post) => post.id !== postId))
      if (manualEditingId === postId) {
        handleCancelManualEdit()
      }
    } catch (err) {
      console.error("[timeline.delete]", err)
      setError(err instanceof Error ? err.message : "投稿の削除に失敗しました。")
    }
  }

  const handleBeginMemoEdit = (post: TimelinePost) => {
    if (!post.permissions.canEditMemo) {
      return
    }
    setMemoEditingId(post.id)
    setMemoEditingValue(post.memo ?? "")
    setMemoEditError(null)
  }

  const handleCancelMemoEdit = () => {
    setMemoEditingId(null)
    setMemoEditingValue("")
    setMemoEditError(null)
  }

  const handleSaveMemo = () => {
    if (!memoEditingId) return
    const targetPost = posts.find((item) => item.id === memoEditingId)
    if (!targetPost?.permissions.canEditMemo) {
      handleCancelMemoEdit()
      return
    }
    startMemoTransition(async () => {
      const memo = memoEditingValue.trim()
      if (memo.length > 500) {
        setMemoEditError("メモは500文字以内で入力してください。")
        return
      }

      try {
        const response = await fetch(`/api/timeline/${memoEditingId}/memo`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ memo }),
        })

        const body = (await safeParseJSON(response)) as {
          data?: { post: TimelinePost }
          error?: { message?: string }
        } | null

        if (!response.ok) {
          const message = body?.error?.message ?? "メモの保存に失敗しました。"
          throw new Error(message)
        }

        if (body?.data?.post) {
          const nextPost = body.data.post
          setPosts((prev) => prev.map((post) => (post.id === memoEditingId ? nextPost : post)))
        }
        handleCancelMemoEdit()
      } catch (err) {
        console.error("[timeline.memo]", err)
        setMemoEditError(err instanceof Error ? err.message : "メモの保存に失敗しました。")
      }
    })
  }

  const handleReaction = async (postId: string, type: "LIKE" | "BAD") => {
    setError(null)
    try {
      const response = await fetch(`/api/timeline/${postId}/reactions`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type }),
      })

      const body = (await safeParseJSON(response)) as {
        data?: { reactions: { likes: number; bads: number; viewerReaction: "LIKE" | "BAD" | null } }
        error?: { message?: string }
      } | null

      if (!response.ok) {
        const message = body?.error?.message ?? "リアクションの更新に失敗しました。"
        throw new Error(message)
      }

      if (body?.data?.reactions) {
        const { likes, bads, viewerReaction } = body.data.reactions
        setPosts((prev) =>
          prev.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  reactions: {
                    likes,
                    bads,
                    viewerReaction,
                  },
                }
              : post,
          ),
        )
      }
    } catch (err) {
      console.error("[timeline.reaction]", err)
      setError(err instanceof Error ? err.message : "リアクションの更新に失敗しました。")
    }
  }

  const reactionTotals = useMemo(() => posts.reduce((acc, post) => acc + post.reactions.likes + post.reactions.bads, 0), [posts])

  return (
    <DashboardShell
      title="タイムライン"
      description="友人たちの完了・未達成報告を確認して、リアクションを送り合いましょう。"
    >
      <section className="space-y-4">
        <div className="rounded-2xl border border-strap/40 bg-surface p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-forest">みんなの状況をシェアする</h2>
          <p className="mt-2 text-xs text-muted">
            最近の気づきや振り返りを簡単に残しましょう。投稿はフレンド全員に共有されます。
          </p>
          <div className="mt-4 space-y-3">
            <textarea
              value={newMessage}
              onChange={(event) => {
                setNewMessage(event.target.value)
                setNewMessageError(null)
              }}
              placeholder="今日の取り組みや感想を入力..."
              className="min-h-[96px] w-full resize-none rounded-xl border border-strap/40 bg-surface px-4 py-3 text-sm text-forest focus:border-accent focus:outline-none"
              maxLength={280}
            />
            {newMessageError ? <p className="text-xs text-accent">{newMessageError}</p> : null}
            <div className="flex items-center justify-between text-xs text-muted">
              <span>{newMessage.length}/280</span>
              <button
                type="button"
                onClick={handleCreatePost}
                disabled={isCreating}
                className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
              >
                {isCreating ? "送信中..." : "投稿する"}
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-accent bg-accent-soft p-4 text-xs text-accent">
            {error}
          </div>
        ) : null}

        {isLoading && posts.length === 0 ? (
          <div className="rounded-xl border border-strap/40 bg-surface p-8 text-center text-sm text-muted">
            読み込み中...
          </div>
        ) : null}

        {!isLoading && posts.length === 0 ? (
          <div className="rounded-xl border border-strap/40 bg-surface p-8 text-center text-sm text-muted">
            まだ投稿がありません。完了したタスクや気づきをシェアしてみましょう。
          </div>
        ) : null}

        {posts.map((post) => {
          const isManual = post.kind === "MANUAL_NOTE"
          const statusClass = STATUS_STYLES[post.kind] ?? STATUS_STYLES.MANUAL_NOTE
          const statusLabel = STATUS_LABELS[post.kind] ?? STATUS_LABELS.MANUAL_NOTE
          const isEditingManual = manualEditingId === post.id
          const isEditingMemo = memoEditingId === post.id

          return (
            <article key={post.id} className="rounded-2xl border border-strap/40 bg-surface p-5 shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
                    style={{
                      backgroundColor: normalizeHexColor(post.author.color, "#DCFCE7"),
                      color: getAvatarTextColor(post.author.color, "#DCFCE7"),
                    }}
                  >
                    {getAvatarInitial(post.author.name)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-forest">{post.author.name}</p>
                    <p className="text-xs text-muted">{formatRelativeTime(post.createdAt)}</p>
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${statusClass}`}>
                  {statusLabel}
                </span>
              </header>

              <div className="mt-4 space-y-3 text-sm text-forest/90">
                {isEditingManual ? (
                  <>
                    <textarea
                      value={manualEditingMessage}
                      onChange={(event) => {
                        setManualEditingMessage(event.target.value)
                        setManualEditError(null)
                      }}
                      className="w-full resize-none rounded-xl border border-strap/40 bg-surface px-4 py-3 text-sm focus:border-accent focus:outline-none"
                      maxLength={280}
                    />
                    {manualEditError ? <p className="text-xs text-accent">{manualEditError}</p> : null}
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={handleSaveManualEdit}
                        disabled={isManualSaving}
                        className="rounded-full bg-accent px-4 py-1.5 font-semibold text-white disabled:opacity-60"
                      >
                        {isManualSaving ? "保存中..." : "更新する"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelManualEdit}
                        className="rounded-full border border-strap/40 px-4 py-1.5 text-muted"
                      >
                        キャンセル
                      </button>
                    </div>
                  </>
                ) : (
                  <p>{post.message}</p>
                )}

                {post.occurrence ? (
                  <div className="rounded-xl border border-strap/30 bg-surface px-4 py-3 text-xs text-muted">
                    <p className="font-medium text-forest">{post.occurrence.event?.title ?? "タスク"}</p>
                    <p>
                      {formatTimeRange(post.occurrence.startAt, post.occurrence.endAt)} ・ {post.occurrence.status === "DONE" ? "達成" : post.occurrence.status === "MISSED" ? "未達成" : "予定"}
                    </p>
                  </div>
                ) : null}

                {post.memo ? (
                  <div className="rounded-xl border border-strap/30 bg-accent-soft px-4 py-3 text-xs text-forest">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-forest/90">{post.memo}</p>
                    {post.memoUpdatedAt ? (
                      <p className="mt-2 text-[11px] text-muted">最終更新: {formatDateTime(post.memoUpdatedAt)}</p>
                    ) : null}
                  </div>
                ) : null}

                {isEditingMemo ? (
                  <div className="space-y-2">
                    <textarea
                      value={memoEditingValue}
                      onChange={(event) => {
                        setMemoEditingValue(event.target.value)
                        setMemoEditError(null)
                      }}
                      className="w-full resize-none rounded-xl border border-strap/40 bg-surface px-4 py-3 text-sm focus:border-accent focus:outline-none"
                      maxLength={500}
                    />
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={handleSaveMemo}
                        className="rounded-full bg-accent px-4 py-1.5 font-semibold text-white disabled:opacity-60"
                        disabled={isMemoSubmitting}
                      >
                        {isMemoSubmitting ? "保存中..." : "メモを保存"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelMemoEdit}
                        className="rounded-full border border-strap/40 px-4 py-1.5 text-muted"
                        disabled={isMemoSubmitting}
                      >
                        キャンセル
                      </button>
                    </div>
                    {memoEditError ? <p className="text-xs text-accent">{memoEditError}</p> : null}
                  </div>
                ) : null}
              </div>

              <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => handleReaction(post.id, "LIKE")}
                    className={`flex items-center gap-1 rounded-full px-3 py-1 transition ${
                      post.reactions.viewerReaction === "LIKE"
                        ? "bg-accent/15 text-accent"
                        : "hover:bg-surface"
                    }`}
                  >
                    <span>👍</span>
                    <span>{post.reactions.likes}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReaction(post.id, "BAD")}
                    className={`flex items-center gap-1 rounded-full px-3 py-1 transition ${
                      post.reactions.viewerReaction === "BAD"
                        ? "bg-strap/60 text-forest"
                        : "hover:bg-surface"
                    }`}
                  >
                    <span>👎</span>
                    <span>{post.reactions.bads}</span>
                  </button>
                </div>

                <div className="flex gap-3">
                  {isManual && post.permissions.canEditManual ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleBeginManualEdit(post)}
                        className="text-muted hover:text-forest"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteManualPost(post.id)}
                        className="text-muted hover:text-accent"
                      >
                        削除
                      </button>
                    </>
                  ) : null}
                  {!isManual && post.permissions.canEditMemo ? (
                    <button
                      type="button"
                      onClick={() => handleBeginMemoEdit(post)}
                      className="text-muted hover:text-forest"
                    >
                      {post.memo ? "メモを編集" : "メモを追加"}
                    </button>
                  ) : null}
                </div>
              </footer>
            </article>
          )
        })}

        {hasMore ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isLoading}
              className="rounded-full border border-strap/40 bg-surface px-5 py-2 text-sm text-muted shadow-sm disabled:opacity-60"
            >
              {isLoading ? "読み込み中..." : "さらに読み込む"}
            </button>
          </div>
        ) : null}

        {reactionTotals > 0 ? (
          <p className="text-center text-[11px] text-muted">
            これまでに {reactionTotals} 件のリアクションが送られています。
          </p>
        ) : null}
      </section>
    </DashboardShell>
  )
}

function formatRelativeTime(isoString: string) {
  const target = new Date(isoString)
  const now = new Date()
  const diffMs = target.getTime() - now.getTime()
  const diffMinutes = Math.round(diffMs / (1000 * 60))

  if (Math.abs(diffMinutes) < 1) {
    return "たった今"
  }

  const formatter = new Intl.RelativeTimeFormat("ja", { numeric: "auto" })
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute")
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, "hour")
  }

  const diffDays = Math.round(diffHours / 24)
  return formatter.format(diffDays, "day")
}

function formatTimeRange(startIso: string, endIso: string) {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const dateFormatter = new Intl.DateTimeFormat("ja", {
    month: "2-digit",
    day: "2-digit",
  })
  const timeFormatter = new Intl.DateTimeFormat("ja", {
    hour: "2-digit",
    minute: "2-digit",
  })

  return `${dateFormatter.format(start)} ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`
}

function formatDateTime(isoString: string) {
  const date = new Date(isoString)
  const formatter = new Intl.DateTimeFormat("ja", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
  return formatter.format(date)
}

async function safeParseJSON(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}
