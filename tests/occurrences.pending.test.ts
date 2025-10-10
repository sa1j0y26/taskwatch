import { OccurrenceStatus, Visibility } from "@prisma/client"
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"
import type { Mock } from "vitest"

import { GET } from "@/app/api/occurrences/pending/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}))

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      occurrence: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  }
})

describe("GET /api/occurrences/pending", () => {
  const mockedAuth = auth as unknown as Mock
  const mockedPrisma = prisma as unknown as {
    occurrence: {
      findMany: Mock
      count: Mock
      findFirst: Mock
    }
    $transaction: Mock
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const response = await GET(new Request("http://localhost/api/occurrences/pending"))

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe("UNAUTHORIZED")
  })

  it("validates the before parameter", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "user-1" } })

    const response = await GET(
      new Request("http://localhost/api/occurrences/pending?before=invalid-date"),
    )

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error.code).toBe("INVALID_BEFORE")
  })

  it("returns pending occurrences ordered by end time with overdue minutes", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "user-1" } })

    vi.useFakeTimers()
    const now = new Date("2024-04-10T12:00:00Z")
    vi.setSystemTime(now)

    const occurrences = [
      {
        id: "occ-1",
        event_id: "event-1",
        user_id: "user-1",
        start_at: new Date("2024-04-09T10:00:00Z"),
        end_at: new Date("2024-04-09T11:00:00Z"),
        status: OccurrenceStatus.SCHEDULED,
        completed_at: null,
        notes: null,
        created_at: new Date("2024-04-01T00:00:00Z"),
        updated_at: new Date("2024-04-01T00:00:00Z"),
        event: {
          id: "event-1",
          title: "数学",
          tag: "study",
          visibility: Visibility.PRIVATE,
        },
      },
    ]

    mockedPrisma.occurrence.findMany.mockResolvedValueOnce(occurrences)
    mockedPrisma.occurrence.count.mockResolvedValueOnce(5)
    mockedPrisma.$transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    )

    const response = await GET(new Request("http://localhost/api/occurrences/pending"))

    expect(response.status).toBe(200)
    expect(mockedPrisma.occurrence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user_id: "user-1",
          status: OccurrenceStatus.SCHEDULED,
          end_at: expect.objectContaining({ lt: now }),
        }),
        orderBy: [
          { end_at: "asc" },
          { id: "asc" },
        ],
        take: 50,
      }),
    )

    const body = await response.json()
    expect(body.data.total).toBe(5)
    expect(body.data.hasMore).toBe(true)
    expect(body.data.occurrences).toHaveLength(1)
    expect(body.data.occurrences[0]).toEqual(
      expect.objectContaining({
        id: "occ-1",
        overdueMinutes: 1500,
        event: expect.objectContaining({ title: "数学" }),
      }),
    )
  })

  it("returns 404 when cursor does not match a pending occurrence", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "user-1" } })
    mockedPrisma.occurrence.findFirst.mockResolvedValueOnce(null)

    const response = await GET(
      new Request("http://localhost/api/occurrences/pending?cursorId=missing"),
    )

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe("INVALID_CURSOR")
    expect(mockedPrisma.occurrence.findMany).not.toHaveBeenCalled()
  })
})
