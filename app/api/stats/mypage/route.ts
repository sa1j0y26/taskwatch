import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import { prisma } from "@/lib/prisma"
import {
  XP_PENALTY_MISSED,
  XP_PER_MINUTE,
  addDaysUTC,
  computeLevel,
  computeStreak,
  computeXp,
  formatDateKeyUTC,
  minutesBetweenUtc,
  startOfWeekUTC,
} from "@/lib/stats"
import { OccurrenceStatus } from "@prisma/client"

function parseWeekStart(param: string | null) {
  if (!param) {
    return startOfWeekUTC(new Date())
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(param)) {
    return null
  }

  const parsed = new Date(`${param}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return startOfWeekUTC(parsed)
}

export async function GET(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id
  const { searchParams } = new URL(request.url)

  const weekStart = parseWeekStart(searchParams.get("weekStart"))

  if (!weekStart) {
    return jsonErrorWithStatus("INVALID_WEEK_START", "weekStart must be formatted as YYYY-MM-DD.", {
      status: 422,
    })
  }

  const periodStart = weekStart
  const periodEnd = addDaysUTC(periodStart, 7)
  const previousPeriodStart = addDaysUTC(periodStart, -7)
  const previousPeriodEnd = periodStart
  const currentWeekStart = startOfWeekUTC(new Date())

  try {
    const occurrences = await prisma.occurrence.findMany({
      where: {
        user_id: viewerId,
      },
      select: {
        id: true,
        status: true,
        start_at: true,
        end_at: true,
      },
    })

    const weeklyTotalsMap = new Map<
      string,
      {
        plannedMinutes: number
        completedMinutes: number
        doneCount: number
        missedCount: number
      }
    >()

    const doneDateKeys = new Set<string>()

    let weeklyDone = 0
    let weeklyMissed = 0
    let weeklyCompletedMinutes = 0
    let previousWeekCompletedMinutes = 0

    occurrences.forEach((occurrence) => {
      if (!occurrence.start_at || !occurrence.end_at) {
        return
      }

      const dateKey = formatDateKeyUTC(occurrence.start_at)

      if (occurrence.start_at >= periodStart && occurrence.start_at < periodEnd) {
        if (!weeklyTotalsMap.has(dateKey)) {
          weeklyTotalsMap.set(dateKey, {
            plannedMinutes: 0,
            completedMinutes: 0,
            doneCount: 0,
            missedCount: 0,
          })
        }

        const bucket = weeklyTotalsMap.get(dateKey)!
        const durationMinutes = minutesBetweenUtc(occurrence.start_at, occurrence.end_at)
        bucket.plannedMinutes += durationMinutes

        if (occurrence.status === OccurrenceStatus.DONE) {
          bucket.completedMinutes += durationMinutes
          bucket.doneCount += 1
          weeklyDone += 1
          weeklyCompletedMinutes += durationMinutes
        } else if (occurrence.status === OccurrenceStatus.MISSED) {
          bucket.missedCount += 1
          weeklyMissed += 1
        }
      }

      if (
        occurrence.status === OccurrenceStatus.DONE &&
        occurrence.start_at >= previousPeriodStart &&
        occurrence.start_at < previousPeriodEnd
      ) {
        previousWeekCompletedMinutes += minutesBetweenUtc(occurrence.start_at, occurrence.end_at)
      }

      if (occurrence.status === OccurrenceStatus.DONE) {
        doneDateKeys.add(dateKey)
      }
    })

    const aggregatedXp = computeXp(occurrences)
    const levelSnapshot = computeLevel(aggregatedXp)
    const streakCount = computeStreak(doneDateKeys, new Date())

    const weeklyTotals = []
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const day = addDaysUTC(periodStart, dayIndex)
      const key = formatDateKeyUTC(day)
      const totals = weeklyTotalsMap.get(key) ?? {
        plannedMinutes: 0,
        completedMinutes: 0,
        doneCount: 0,
        missedCount: 0,
      }
      weeklyTotals.push({
        date: key,
        plannedMinutes: totals.plannedMinutes,
        completedMinutes: totals.completedMinutes,
        doneCount: totals.doneCount,
        missedCount: totals.missedCount,
      })
    }

    const denominator = weeklyDone + weeklyMissed
    const completionRate = denominator > 0 ? weeklyDone / denominator : null

    const nextWeekCandidate = addDaysUTC(periodStart, 7)
    const nextWeekStart = formatDateKeyUTC(nextWeekCandidate)
    const navigationNextWeek =
      nextWeekCandidate > currentWeekStart ? null : nextWeekStart

    return jsonSuccess({
      period: {
        start: formatDateKeyUTC(periodStart),
        end: formatDateKeyUTC(addDaysUTC(periodStart, 6)),
      },
      weeklyTotals,
      summary: {
        level: levelSnapshot.level,
        totalXp: levelSnapshot.totalXp,
        xpForCurrentLevel: levelSnapshot.xpForCurrentLevel,
        xpForNextLevel: levelSnapshot.xpForNextLevel,
        xpToNextLevel: levelSnapshot.xpToNextLevel,
        levelProgress: levelSnapshot.progress,
        streakCount,
        completionRate,
        weeklyDone,
        weeklyMissed,
        completedMinutesWeek: weeklyCompletedMinutes,
        completedMinutesPreviousWeek: previousWeekCompletedMinutes,
        xpPerMinute: XP_PER_MINUTE,
        xpPenaltyMissed: XP_PENALTY_MISSED,
      },
      navigation: {
        prevWeekStart: formatDateKeyUTC(addDaysUTC(periodStart, -7)),
        nextWeekStart: navigationNextWeek,
        isCurrentWeek: formatDateKeyUTC(periodStart) === formatDateKeyUTC(currentWeekStart),
      },
    })
  } catch (error) {
    console.error("[stats/mypage.GET]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to load stats.", { status: 500 })
  }
}
