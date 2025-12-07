import { OccurrenceStatus } from "@prisma/client"

const MINUTES_IN_MS = 1000 * 60
export const XP_PER_MINUTE = 2
export const XP_PENALTY_MISSED = 20
export const LEVEL_STEP = 500
export const ALL_DAY_EFFECTIVE_MINUTES = 60

export function startOfWeekUTC(date: Date) {
  const result = new Date(date)
  result.setUTCHours(0, 0, 0, 0)
  const day = result.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  result.setUTCDate(result.getUTCDate() + diff)
  return result
}

export function addDaysUTC(date: Date, days: number) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

export function formatDateKeyUTC(date: Date) {
  const copy = new Date(date)
  copy.setUTCHours(0, 0, 0, 0)
  return copy.toISOString().slice(0, 10)
}

export function minutesBetweenUtc(start: Date, end: Date) {
  const diff = Math.max(0, end.getTime() - start.getTime())
  return Math.max(0, Math.round(diff / MINUTES_IN_MS))
}

export function computeXp(
  occurrences: Array<{ status: OccurrenceStatus; start_at: Date; end_at: Date; is_all_day?: boolean }>,
) {
  let totalXp = 0

  occurrences.forEach((occurrence) => {
    const rawMinutes = minutesBetweenUtc(occurrence.start_at, occurrence.end_at)
    const durationMinutes = occurrence.is_all_day ? ALL_DAY_EFFECTIVE_MINUTES : rawMinutes

    if (occurrence.status === OccurrenceStatus.DONE) {
      totalXp += durationMinutes * XP_PER_MINUTE
    } else if (occurrence.status === OccurrenceStatus.MISSED) {
      totalXp = Math.max(0, totalXp - XP_PENALTY_MISSED)
    }
  })

  return totalXp
}

export function computeLevel(totalXp: number) {
  const normalizedXp = Math.max(0, totalXp)
  const level = Math.floor(normalizedXp / LEVEL_STEP) + 1
  const xpForCurrentLevel = (level - 1) * LEVEL_STEP
  const xpForNextLevel = level * LEVEL_STEP
  const xpIntoLevel = normalizedXp - xpForCurrentLevel
  const xpToNextLevel = xpForNextLevel - normalizedXp
  const progress = Math.min(1, Math.max(0, xpIntoLevel / LEVEL_STEP))

  return {
    level,
    totalXp: normalizedXp,
    xpForCurrentLevel,
    xpForNextLevel,
    xpToNextLevel,
    progress: Number.isFinite(progress) ? progress : 0,
  }
}

export function computeStreak(doneDateKeys: Set<string>, referenceDate: Date) {
  const today = new Date(referenceDate)
  today.setUTCHours(0, 0, 0, 0)
  let streak = 0
  const cursor = new Date(today)

  while (true) {
    const key = formatDateKeyUTC(cursor)
    if (doneDateKeys.has(key)) {
      streak += 1
      cursor.setUTCDate(cursor.getUTCDate() - 1)
      continue
    }
    break
  }

  return streak
}
