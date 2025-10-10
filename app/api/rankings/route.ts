import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import { getFriendIdsForUser } from "@/lib/friendship"
import { prisma } from "@/lib/prisma"

const METRICS = ["totalMinutes", "completionRate", "streak"] as const
const PERIODS = ["weekly", "monthly"] as const

type Metric = (typeof METRICS)[number]
type Period = (typeof PERIODS)[number]

type AggregatedStats = {
  totalMinutes: number
  doneCount: number
  missedCount: number
  streakDates: Set<string>
}

type RankingEntry = {
  userId: string
  value: number | null
  displayValue: string
  extra?: Record<string, unknown>
}

export async function GET(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id
  const { searchParams } = new URL(request.url)
  const metricParam = searchParams.get("metric") ?? "totalMinutes"
  const periodParam = searchParams.get("period") ?? "weekly"

  if (!isMetric(metricParam) || !isPeriod(periodParam)) {
    return jsonErrorWithStatus("INVALID_PARAMETERS", "Unsupported metric or period.", {
      status: 422,
    })
  }

  const { rangeStart, rangeEnd } = getPeriodRange(periodParam)

  try {
    const friendIds = await getFriendIdsForUser(viewerId)

    if (friendIds.length === 0) {
      return jsonSuccess({
        metric: metricParam,
        period: periodParam,
        range: serializeRange(rangeStart, rangeEnd),
        rankings: [],
      })
    }

    const occurrences = await prisma.occurrence.findMany({
      where: {
        user_id: { in: friendIds },
        start_at: {
          gte: rangeStart,
          lt: rangeEnd,
        },
      },
      select: {
        user_id: true,
        start_at: true,
        end_at: true,
        status: true,
      },
    })

    const statsMap = new Map<string, AggregatedStats>()

    const ensureStats = (userId: string) => {
      if (!statsMap.has(userId)) {
        statsMap.set(userId, {
          totalMinutes: 0,
          doneCount: 0,
          missedCount: 0,
          streakDates: new Set<string>(),
        })
      }
      return statsMap.get(userId)!
    }

    occurrences.forEach((occurrence) => {
      const stats = ensureStats(occurrence.user_id)
      if (occurrence.status === "DONE") {
        stats.doneCount += 1
        const durationMinutes = Math.max(
          0,
          Math.round(
            (new Date(occurrence.end_at).getTime() - new Date(occurrence.start_at).getTime()) /
              (1000 * 60),
          ),
        )
        stats.totalMinutes += durationMinutes
        stats.streakDates.add(formatDateKey(new Date(occurrence.start_at)))
      } else if (occurrence.status === "MISSED") {
        stats.missedCount += 1
      }
    })

    const userRecords = await prisma.user.findMany({
      where: { id: { in: friendIds } },
      select: { id: true, name: true, avatar: true },
    })

    const userMap = new Map(userRecords.map((user) => [user.id, user]))

    const rankings = friendIds
      .map<RankingEntry | null>((userId) => {
        const stats = statsMap.get(userId) ?? {
          totalMinutes: 0,
          doneCount: 0,
          missedCount: 0,
          streakDates: new Set<string>(),
        }

        if (!userMap.has(userId)) {
          return null
        }

        switch (metricParam) {
          case "totalMinutes": {
            const value = stats.totalMinutes
            return {
              userId,
              value,
              displayValue: `${value} 分`,
            }
          }
          case "completionRate": {
            const denominator = stats.doneCount + stats.missedCount
            const ratio = denominator > 0 ? stats.doneCount / denominator : null
            const display = ratio === null ? "-" : `${Math.round(ratio * 1000) / 10}%`
            return {
              userId,
              value: ratio,
              displayValue: display,
              extra: {
                doneCount: stats.doneCount,
                missedCount: stats.missedCount,
              },
            }
          }
          case "streak": {
            const longest = calculateLongestStreak(stats.streakDates, rangeStart, rangeEnd)
            return {
              userId,
              value: longest,
              displayValue: `${longest} 日`,
            }
          }
          default:
            return null
        }
      })
      .filter((entry): entry is RankingEntry => entry !== null)
      .sort((a, b) => {
        const valueA = metricParam === "completionRate" ? a.value ?? 0 : (a.value as number)
        const valueB = metricParam === "completionRate" ? b.value ?? 0 : (b.value as number)
        return valueB - valueA
      })

    const rankingsWithUser = rankings.map((entry, index) => ({
      rank: index + 1,
      user: userMap.get(entry.userId),
      value: entry.value,
      displayValue: entry.displayValue,
      extra: entry.extra,
    }))

    return jsonSuccess({
      metric: metricParam,
      period: periodParam,
      range: serializeRange(rangeStart, rangeEnd),
      rankings: rankingsWithUser,
    })
  } catch (error) {
    console.error("[rankings.GET]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to load rankings.", { status: 500 })
  }
}

function isMetric(value: string): value is Metric {
  return (METRICS as readonly string[]).includes(value)
}

function isPeriod(value: string): value is Period {
  return (PERIODS as readonly string[]).includes(value)
}

function getPeriodRange(period: Period) {
  const now = new Date()
  if (period === "weekly") {
    const start = startOfWeek(now)
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 7)
    return { rangeStart: start, rangeEnd: end }
  }

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0))
  return { rangeStart: start, rangeEnd: end }
}

function startOfWeek(date: Date) {
  const utc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0,
  )
  const current = new Date(utc)
  const day = current.getUTCDay()
  const diff = (day + 6) % 7
  current.setUTCDate(current.getUTCDate() - diff)
  return current
}

function serializeRange(start: Date, end: Date) {
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

function formatDateKey(date: Date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  return utc.toISOString().slice(0, 10)
}

function calculateLongestStreak(dates: Set<string>, rangeStart: Date, rangeEnd: Date) {
  if (dates.size === 0) {
    return 0
  }

  let longest = 0
  let current = 0
  const cursor = new Date(rangeStart)

  while (cursor < rangeEnd) {
    const key = formatDateKey(cursor)
    if (dates.has(key)) {
      current += 1
      longest = Math.max(longest, current)
    } else {
      current = 0
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return longest
}
