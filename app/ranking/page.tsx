"use client"

import { useEffect, useMemo, useState } from "react"

import { DashboardShell } from "../_components/dashboard-shell"

const METRICS = [
  { id: "totalMinutes", label: "合計学習時間", suffix: "分" },
  { id: "completionRate", label: "達成率", suffix: "%" },
  { id: "streak", label: "ストリーク", suffix: "日" },
] as const

const PERIODS = [
  { id: "weekly", label: "週間" },
  { id: "monthly", label: "月間" },
] as const

type Metric = (typeof METRICS)[number]["id"]
type Period = (typeof PERIODS)[number]["id"]

type RankingEntry = {
  rank: number
  user: {
    id: string
    name: string
    avatar: string | null
  }
  value: number | null
  displayValue: string
  extra?: Record<string, unknown>
}

type RankingRange = {
  start: string
  end: string
}

type RankingResponse = {
  data?: {
    metric: Metric
    period: Period
    range: RankingRange
    rankings: RankingEntry[]
  }
  error?: {
    message: string
  }
}

type MetricState = {
  entries: RankingEntry[]
  isLoading: boolean
  error: string | null
}

const createInitialMetricState = (initialLoading = false): Record<Metric, MetricState> =>
  METRICS.reduce((acc, metric) => {
    acc[metric.id] = { entries: [], isLoading: initialLoading, error: null }
    return acc
  }, {} as Record<Metric, MetricState>)

export default function RankingPage() {
  const [period, setPeriod] = useState<Period>("weekly")
  const [metricsState, setMetricsState] = useState<Record<Metric, MetricState>>(() =>
    createInitialMetricState(),
  )
  const [rangeText, setRangeText] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setRangeText("")
      setError(null)
      setMetricsState(createInitialMetricState(true))

      const fetchMetric = async (
        metric: (typeof METRICS)[number],
      ): Promise<RankingRange | null> => {
        try {
          const response = await fetch(
            `/api/rankings?metric=${metric.id}&period=${period}`,
            {
              method: "GET",
              credentials: "include",
            },
          )
          const body = (await safeParseJSON(response)) as RankingResponse | null

          if (!response.ok || !body?.data) {
            const message = body?.error?.message ?? "ランキングの取得に失敗しました。"
            throw new Error(message)
          }

          if (!cancelled) {
            setMetricsState((prev) => ({
              ...prev,
              [metric.id]: {
                entries: body.data!.rankings,
                isLoading: false,
                error: null,
              },
            }))
          }

          return body.data.range
        } catch (err) {
          console.error(`[ranking.load.${metric.id}]`, err)
          if (!cancelled) {
            const message =
              err instanceof Error ? err.message : "ランキングの取得に失敗しました。"
            setMetricsState((prev) => ({
              ...prev,
              [metric.id]: {
                entries: [],
                isLoading: false,
                error: message,
              },
            }))
          }
          return null
        }
      }

      const ranges = await Promise.all(METRICS.map((metric) => fetchMetric(metric)))

      if (!cancelled) {
        const successfulRange = ranges.find(
          (range): range is RankingRange => range !== null,
        )
        if (successfulRange) {
          setRangeText(formatRange(successfulRange.start, successfulRange.end))
        } else {
          setError("ランキングを取得できませんでした。")
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [period])

  const periodLabel = useMemo(
    () => PERIODS.find((item) => item.id === period)?.label ?? "週間",
    [period],
  )

  const isAnyLoading = useMemo(
    () => METRICS.some((metric) => metricsState[metric.id]?.isLoading),
    [metricsState],
  )

  return (
    <DashboardShell
      title="ランキング"
      description="フレンドと学習状況を比較してモチベーションを高めましょう。"
      actionSlot={
        <div className="flex items-center gap-2">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriod(item.id)}
              className={`rounded-full border px-4 py-2 text-xs font-medium transition ${
                period === item.id
                  ? "border-accent/40 bg-accent text-white"
                  : "border-strap/40 bg-white text-forest/80 hover:bg-accent-soft"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      }
    >
      <section className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-forest">{periodLabel}ランキング</h2>
            {rangeText ? (
              <p className="text-xs text-muted">対象期間: {rangeText}</p>
            ) : null}
          </div>
          {isAnyLoading ? <p className="text-xs text-muted">更新中...</p> : null}
        </header>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-600">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-3">
          {METRICS.map((metric) => {
            const state = metricsState[metric.id] ?? {
              entries: [],
              isLoading: false,
              error: null,
            }

            return (
              <RankingTableCard
                key={metric.id}
                title={metric.label}
                entries={state.entries}
                isLoading={state.isLoading}
                error={state.error}
              />
            )
          })}
        </div>
      </section>
    </DashboardShell>
  )
}

type RankingTableCardProps = {
  title: string
  entries: RankingEntry[]
  isLoading: boolean
  error: string | null
}

function RankingTableCard({ title, entries, isLoading, error }: RankingTableCardProps) {
  return (
    <article className="rounded-2xl border border-strap/40 bg-white p-6 shadow-sm">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-forest">{title}</h3>
        <span className="text-[10px] text-muted">フレンドのみ</span>
      </header>

      {isLoading ? (
        <ul className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <li key={index} className="flex items-center gap-3">
              <span className="h-8 w-8 rounded-full bg-strap/20" />
              <div className="flex-1 space-y-2">
                <div className="h-3 rounded bg-strap/15" />
                <div className="h-3 w-1/2 rounded bg-strap/10" />
              </div>
            </li>
          ))}
        </ul>
      ) : error ? (
        <p className="mt-6 text-xs text-red-600">{error}</p>
      ) : entries.length === 0 ? (
        <p className="mt-6 text-xs text-muted">表示できるデータがありません。</p>
      ) : (
        <table className="mt-4 w-full table-fixed border-collapse text-sm">
          <thead className="bg-surface text-left text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="w-[48px] px-3 py-2">順位</th>
              <th className="px-3 py-2">メンバー</th>
              <th className="px-3 py-2 text-right">値</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((item) => (
              <tr
                key={item.user?.id ?? item.rank}
                className="border-t border-strap/30"
              >
                <td className="px-3 py-2 text-center text-sm font-semibold text-forest">
                  #{item.rank}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest/10 text-xs font-semibold text-forest">
                      {item.user?.name?.[0] ?? "-"}
                    </span>
                    <span className="text-sm font-medium text-forest">
                      {item.user?.name ?? "Unknown"}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right text-sm text-forest">
                  {item.displayValue}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  )
}

function formatRange(startISO: string, endISO: string) {
  const start = new Date(startISO)
  const end = new Date(new Date(endISO).getTime() - 1)

  return `${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()} 〜 ${
    end.getFullYear()
  }/${end.getMonth() + 1}/${end.getDate()}`
}

async function safeParseJSON(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}
