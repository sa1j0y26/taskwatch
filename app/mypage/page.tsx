"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { DashboardShell } from "../_components/dashboard-shell"

const WEEKLY_PROGRESS = [
  { day: "Mon", planned: 180, completed: 150 },
  { day: "Tue", planned: 200, completed: 180 },
  { day: "Wed", planned: 160, completed: 160 },
  { day: "Thu", planned: 210, completed: 120 },
  { day: "Fri", planned: 120, completed: 90 },
  { day: "Sat", planned: 240, completed: 210 },
  { day: "Sun", planned: 150, completed: 130 },
]

type PendingOccurrence = {
  id: string
  eventId: string
  startAt: string
  endAt: string
  notes: string | null
  status: string
  overdueMinutes: number
  event: {
    id: string
    title: string
    tag: string | null
    visibility: string | null
  } | null
}

type PendingResponse = {
  data?: {
    occurrences: PendingOccurrence[]
    total: number
    hasMore: boolean
    cutoff: string
  }
  error?: {
    message: string
  }
}

type PendingAction = "DONE" | "MISSED"

export default function MyPage() {
  const [pendingOccurrences, setPendingOccurrences] = useState<PendingOccurrence[]>([])
  const [pendingTotal, setPendingTotal] = useState(0)
  const [pendingCutoff, setPendingCutoff] = useState<string | null>(null)
  const [hasMorePending, setHasMorePending] = useState(false)
  const [pendingError, setPendingError] = useState<string | null>(null)
  const [isLoadingPending, setIsLoadingPending] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const loadPending = useCallback(
    async ({
      cursorId,
      append,
      resetCutoff,
    }: { cursorId?: string; append?: boolean; resetCutoff?: boolean } = {}) => {
      const reuseCutoff = !resetCutoff && pendingCutoff

      if (resetCutoff) {
        setPendingCutoff(null)
      }

      try {
        if (append) {
          setIsLoadingMore(true)
        } else {
          setIsLoadingPending(true)
          setPendingError(null)
        }

        const params = new URLSearchParams()
        if (cursorId) {
          params.set("cursorId", cursorId)
        }
        if (reuseCutoff) {
          params.set("before", reuseCutoff)
        }

        const response = await fetch(
          `/api/occurrences/pending${params.size > 0 ? `?${params.toString()}` : ""}`,
          {
            method: "GET",
            credentials: "include",
          },
        )

        const body = (await safeParseJSON(response)) as PendingResponse | null

        if (!response.ok || !body?.data) {
          throw new Error(body?.error?.message ?? "未評価タスクの読み込みに失敗しました。")
        }

        const nextCutoff = body.data.cutoff
        setPendingCutoff((prev) => (reuseCutoff ? prev ?? nextCutoff : nextCutoff))
        setPendingTotal(body.data.total)
        setHasMorePending(body.data.hasMore)

        setPendingOccurrences((prev) => {
          const next = append ? [...prev, ...body.data!.occurrences] : body.data!.occurrences
          const deduped = new Map<string, PendingOccurrence>()
          next.forEach((item) => {
            deduped.set(item.id, item)
          })
          return Array.from(deduped.values())
        })
      } catch (error) {
        console.error("[mypage.pending]", error)
        setPendingError(error instanceof Error ? error.message : "未評価タスクの読み込みに失敗しました。")
      } finally {
        setIsLoadingPending(false)
        setIsLoadingMore(false)
      }
    },
    [pendingCutoff],
  )

  useEffect(() => {
    void loadPending()
  }, [loadPending])

  const handleEvaluate = useCallback(
    async (occurrence: PendingOccurrence, action: PendingAction) => {
      setUpdatingId(occurrence.id)
      setFeedbackMessage(null)
      setPendingError(null)
      try {
        const payload: Record<string, unknown> = {
          status: action,
        }

        if (action === "DONE") {
          payload.completedAt = new Date().toISOString()
        }

        const response = await fetch(`/api/occurrences/${occurrence.id}/status`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })

        const body = await safeParseJSON(response)
        if (!response.ok) {
          throw new Error(body?.error?.message ?? "更新に失敗しました。")
        }

        setPendingOccurrences((prev) => prev.filter((item) => item.id !== occurrence.id))
        setPendingTotal((prev) => Math.max(prev - 1, 0))
        setFeedbackMessage(
          action === "DONE" ? "完了として記録しました。" : "未達成として記録しました。",
        )
        void loadPending({ resetCutoff: true })
      } catch (error) {
        console.error("[mypage.evaluate]", error)
        setPendingError(error instanceof Error ? error.message : "更新に失敗しました。")
      } finally {
        setUpdatingId(null)
      }
    },
    [loadPending],
  )

  const nextCursorId = useMemo(() => {
    if (pendingOccurrences.length === 0) {
      return null
    }
    return pendingOccurrences[pendingOccurrences.length - 1]?.id ?? null
  }, [pendingOccurrences])

  const hasPending = pendingOccurrences.length > 0

  return (
    <DashboardShell
      title="マイページ"
      description="今週の学習状況やレベル進捗を振り返り、次の行動を決めましょう。"
    >
      <section className="grid gap-6 md:grid-cols-3">
        <StatCard title="現在のレベル" value="5" helper="累積 XP 1,250" accent />
        <StatCard title="ストリーク" value="18 日" helper="先週から +3" />
        <StatCard title="週間完遂率" value="82%" helper="目標: 90%" />
      </section>

      <section className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="rounded-2xl border border-strap/50 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-forest">週間タスク時間</h2>
            <span className="text-xs text-muted">単位: 分</span>
          </div>
          <div className="mt-6 grid grid-cols-7 gap-4">
            {WEEKLY_PROGRESS.map((item) => {
              const plannedHeight = Math.max(item.planned / 3, 8)
              const completedHeight = Math.max(item.completed / 3, 6)
              return (
                <div key={item.day} className="flex flex-col items-center gap-2">
                  <div className="flex h-40 w-6 flex-col justify-end gap-1">
                    <span
                      className="inline-block rounded-full bg-strap/70"
                      style={{ height: `${plannedHeight}px` }}
                    />
                    <span
                      className="inline-block rounded-full bg-forest/80"
                      style={{ height: `${completedHeight}px` }}
                    />
                  </div>
                  <p className="text-xs text-muted">{item.day}</p>
                </div>
              )
            })}
          </div>
          <div className="mt-8 flex flex-wrap gap-4 text-xs text-muted">
            <p className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-strap/70" />
              計画時間
            </p>
            <p className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-forest/80" />
              実績時間
            </p>
          </div>
        </div>

        <PendingEvaluationsPanel
          occurrences={pendingOccurrences}
          total={pendingTotal}
          hasMore={hasMorePending}
          isLoading={isLoadingPending}
          isLoadingMore={isLoadingMore}
          error={pendingError}
          feedback={feedbackMessage}
          updatingId={updatingId}
          onReload={() => loadPending({ resetCutoff: true })}
          onLoadMore={() => {
            if (nextCursorId) {
              void loadPending({ cursorId: nextCursorId, append: true })
            }
          }}
          onEvaluate={handleEvaluate}
          canLoadMore={Boolean(hasMorePending && nextCursorId)}
          hasPending={hasPending}
        />
      </section>
    </DashboardShell>
  )
}

type StatCardProps = {
  title: string
  value: string
  helper?: string
  accent?: boolean
}

function StatCard({ title, value, helper, accent = false }: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm transition ${
        accent
          ? "border-accent/40 bg-accent-soft"
          : "border-strap/40 bg-white hover:border-accent/40"
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-wide ${accent ? "text-accent" : "text-muted"}`}>
        {title}
      </p>
      <p className={`mt-3 text-3xl font-semibold ${accent ? "text-forest" : "text-forest"}`}>
        {value}
      </p>
      {helper ? (
        <p className={`mt-2 text-xs ${accent ? "text-forest/80" : "text-muted"}`}>
          {helper}
        </p>
      ) : null}
    </div>
  )
}

type PendingEvaluationsPanelProps = {
  occurrences: PendingOccurrence[]
  total: number
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
  feedback: string | null
  updatingId: string | null
  onReload: () => void
  onLoadMore: () => void
  onEvaluate: (occurrence: PendingOccurrence, action: PendingAction) => void
  canLoadMore: boolean
  hasPending: boolean
}

function PendingEvaluationsPanel({
  occurrences,
  total,
  hasMore,
  isLoading,
  isLoadingMore,
  error,
  feedback,
  updatingId,
  onReload,
  onLoadMore,
  onEvaluate,
  canLoadMore,
  hasPending,
}: PendingEvaluationsPanelProps) {
  const headerText = useMemo(() => {
    if (isLoading) return "読込中..."
    if (total === 0) return "未評価はありません"
    return `未評価: ${occurrences.length} / ${total} 件`
  }, [isLoading, total, occurrences.length])

  return (
    <div className="flex h-full flex-col rounded-2xl border border-strap/50 bg-white p-6 shadow-sm">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-forest">未評価タスク</h2>
          <p className="text-xs text-muted">終了済みでステータス未入力の予定一覧です。</p>
        </div>
        <button
          type="button"
          onClick={onReload}
          className="rounded-full border border-strap/40 px-4 py-1.5 text-xs text-forest/80 hover:bg-accent-soft"
          disabled={isLoading}
        >
          再読み込み
        </button>
      </header>

      <p className="mt-4 text-xs text-muted">{headerText}</p>
      {feedback ? <p className="mt-1 text-xs text-forest">{feedback}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      <div className="mt-4 flex-1 overflow-auto">
        {isLoading ? (
          <ul className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <li key={index} className="animate-pulse rounded-xl border border-strap/40 p-4">
                <div className="h-4 w-2/3 rounded bg-strap/20" />
                <div className="mt-2 h-3 w-1/2 rounded bg-strap/20" />
              </li>
            ))}
          </ul>
        ) : !hasPending ? (
          <div className="rounded-xl border border-dashed border-strap/40 bg-surface p-6 text-xs text-muted">
            {hasMore ? "残りの予定を読み込んで確認しましょう。" : "期限を過ぎた予定はありません。お疲れさまでした！"}
          </div>
        ) : (
          <ul className="space-y-3">
            {occurrences.map((occurrence) => (
              <li
                key={occurrence.id}
                className="rounded-xl border border-strap/40 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-forest">
                    {occurrence.event?.title ?? "予定"}
                  </h3>
                  <span className="text-[11px] font-medium text-red-600">
                    {formatOverdue(occurrence.overdueMinutes)} 遅れ
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {formatDateRange(occurrence.startAt, occurrence.endAt)}
                  {occurrence.event?.tag ? ` / ${occurrence.event.tag}` : ""}
                </p>
                {occurrence.notes ? (
                  <p className="mt-2 text-xs text-forest/80">メモ: {occurrence.notes}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => onEvaluate(occurrence, "DONE")}
                    disabled={updatingId === occurrence.id}
                    className="rounded-full bg-accent px-4 py-1.5 font-medium text-white shadow disabled:opacity-60"
                  >
                    完了として記録
                  </button>
                  <button
                    type="button"
                    onClick={() => onEvaluate(occurrence, "MISSED")}
                    disabled={updatingId === occurrence.id}
                    className="rounded-full border border-red-200 bg-white px-4 py-1.5 font-medium text-red-600 shadow-sm disabled:opacity-60"
                  >
                    未達成として記録
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasMore ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={!canLoadMore || isLoadingMore}
            className="w-full rounded-full border border-strap/40 px-4 py-2 text-xs font-medium text-forest/80 hover:bg-accent-soft disabled:opacity-60"
          >
            {isLoadingMore ? "読み込み中..." : "さらに表示"}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function formatOverdue(minutes: number) {
  if (minutes <= 0) return "遅延なし"
  if (minutes < 60) {
    return `${minutes} 分`
  }
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  if (hours < 24) {
    return remaining === 0 ? `${hours} 時間` : `${hours} 時間 ${remaining} 分`
  }
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  if (remHours === 0 && remaining === 0) {
    return `${days} 日`
  }
  if (remaining === 0) {
    return `${days} 日 ${remHours} 時間`
  }
  return `${days} 日 ${remHours} 時間 ${remaining} 分`
}

function formatDateRange(startISO: string, endISO: string) {
  const start = new Date(startISO)
  const end = new Date(endISO)
  return `${formatDateTime(start)} 〜 ${formatTime(end)}`
}

function formatDateTime(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${year}/${month}/${day} ${hours}:${minutes}`
}

function formatTime(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

async function safeParseJSON(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}
