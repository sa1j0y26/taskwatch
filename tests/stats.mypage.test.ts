import { OccurrenceStatus } from "@prisma/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GET } from "@/app/api/stats/mypage/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    occurrence: {
      findMany: vi.fn(),
    },
  },
}))

describe("GET /api/stats/mypage", () => {
  const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
  const mockedPrisma = prisma as unknown as {
    occurrence: {
      findMany: ReturnType<typeof vi.fn>
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("requires authentication", async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const response = await GET(new Request("http://localhost/api/stats/mypage"))

    expect(response.status).toBe(401)
  })

  it("validates the weekStart parameter", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "user-1" } })

    const response = await GET(new Request("http://localhost/api/stats/mypage?weekStart=invalid"))

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error.code).toBe("INVALID_WEEK_START")
  })

  it("aggregates weekly stats, xp, and navigation", async () => {
    vi.setSystemTime(new Date("2024-04-17T12:00:00Z"))
    mockedAuth.mockResolvedValueOnce({ user: { id: "user-1" } })

    const occurrences = [
      {
        id: "occ-prev",
        user_id: "user-1",
        status: OccurrenceStatus.DONE,
        start_at: new Date("2024-04-10T09:00:00Z"),
        end_at: new Date("2024-04-10T10:00:00Z"),
      },
      {
        id: "occ-done-1",
        user_id: "user-1",
        status: OccurrenceStatus.DONE,
        start_at: new Date("2024-04-15T09:00:00Z"),
        end_at: new Date("2024-04-15T10:00:00Z"),
      },
      {
        id: "occ-scheduled",
        user_id: "user-1",
        status: OccurrenceStatus.SCHEDULED,
        start_at: new Date("2024-04-15T11:00:00Z"),
        end_at: new Date("2024-04-15T12:30:00Z"),
      },
      {
        id: "occ-missed",
        user_id: "user-1",
        status: OccurrenceStatus.MISSED,
        start_at: new Date("2024-04-16T07:00:00Z"),
        end_at: new Date("2024-04-16T08:00:00Z"),
      },
      {
        id: "occ-done-2",
        user_id: "user-1",
        status: OccurrenceStatus.DONE,
        start_at: new Date("2024-04-17T09:00:00Z"),
        end_at: new Date("2024-04-17T10:30:00Z"),
      },
    ]

    mockedPrisma.occurrence.findMany.mockResolvedValueOnce(occurrences)

    const response = await GET(
      new Request("http://localhost/api/stats/mypage?weekStart=2024-04-15"),
    )

    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.data.summary.level).toBeGreaterThan(0)
    expect(body.data.summary.totalXp).toBe(400)
    expect(body.data.summary.weeklyDone).toBe(2)
    expect(body.data.summary.weeklyMissed).toBe(1)
    expect(body.data.summary.completedMinutesWeek).toBe(150)
    expect(body.data.summary.completedMinutesPreviousWeek).toBe(60)
    expect(body.data.summary.completionRate).toBeCloseTo(2 / 3)
    expect(body.data.summary.streakCount).toBe(1)


    const weeklyTotals = body.data.weeklyTotals as Array<{ date: string; plannedMinutes: number; completedMinutes: number; doneCount: number; missedCount: number }>
    const findByDate = (date: string) => weeklyTotals.find((item) => item.date === date)

    const mondayTotals = findByDate("2024-04-15")
    const tuesdayTotals = findByDate("2024-04-16")
    const wednesdayTotals = findByDate("2024-04-17")

    expect(mondayTotals).toBeDefined()
    expect(mondayTotals).toEqual(
      expect.objectContaining({ plannedMinutes: 150, completedMinutes: 60, doneCount: 1 }),
    )
    expect(tuesdayTotals).toBeDefined()
    expect(tuesdayTotals).toEqual(
      expect.objectContaining({ plannedMinutes: 60, completedMinutes: 0, missedCount: 1 }),
    )
    expect(wednesdayTotals).toBeDefined()
    expect(wednesdayTotals).toEqual(
      expect.objectContaining({ plannedMinutes: 90, completedMinutes: 90, doneCount: 1 }),
    )

    expect(body.data.navigation.prevWeekStart).toBe("2024-04-08")
    expect(body.data.navigation.nextWeekStart).toBeNull()
  })
})
