import { beforeEach, describe, expect, it, vi, afterEach } from "vitest"

import { PATCH as patchOccurrenceStatus } from "@/app/api/occurrences/[id]/status/route"
import { DELETE as deleteOccurrence } from "@/app/api/occurrences/[id]/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

vi.mock("@/lib/realtime", () => ({
  publishRealtime: vi.fn(),
}))

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}))

vi.mock("@/lib/prisma", () => {
  const occurrenceApi = {
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }

  const timelineApi = {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  }

  return {
    prisma: {
      occurrence: occurrenceApi,
      timelinePost: timelineApi,
      $transaction: vi.fn(),
    },
  }
})

describe("Occurrence status updates", () => {
  const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
  const mockedPrisma = prisma as unknown as {
    occurrence: {
      findFirst: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
    }
    timelinePost: {
      findFirst: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }
    $transaction: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("creates an automatic timeline post when marking DONE", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "viewer-1" } })

    const existingOccurrence = {
      id: "occ-1",
      user_id: "viewer-1",
      status: "SCHEDULED",
      start_at: new Date("2024-04-01T09:00:00Z"),
      end_at: new Date("2024-04-01T10:00:00Z"),
      completed_at: null,
      notes: null,
      created_at: new Date("2024-03-31T00:00:00Z"),
      updated_at: new Date("2024-03-31T00:00:00Z"),
      event: {
        id: "event-1",
        title: "英語",
        tag: null,
        visibility: "PRIVATE",
      },
    }

    mockedPrisma.occurrence.findFirst.mockResolvedValueOnce(existingOccurrence)

    const updatedOccurrence = {
      ...existingOccurrence,
      status: "DONE",
      completed_at: new Date("2024-04-01T10:05:00Z"),
      updated_at: new Date("2024-04-01T10:05:00Z"),
    }

    const timelineRecord = {
      id: "timeline-1",
      user_id: "viewer-1",
      occurrence_id: "occ-1",
      message: "「英語」を完了しました。",
      kind: "AUTO_DONE",
      memo: null,
      memo_updated_at: null,
      visibility: "PRIVATE",
      created_at: new Date("2024-04-01T10:05:00Z"),
      updated_at: new Date("2024-04-01T10:05:00Z"),
      user: { id: "viewer-1", name: "Yuki", avatar: null, avatar_color: "#14532D" },
      occurrence: {
        id: "occ-1",
        status: "DONE",
        start_at: new Date("2024-04-01T09:00:00Z"),
        end_at: new Date("2024-04-01T10:00:00Z"),
        event: {
          id: "event-1",
          title: "英語",
          tag: null,
        },
      },
      reactions: [],
    }

    mockedPrisma.$transaction.mockImplementationOnce(async (callback) => {
      const typedCallback = callback as (tx: {
        occurrence: { update: ReturnType<typeof vi.fn> }
        timelinePost: {
          findFirst: ReturnType<typeof vi.fn>
          create: ReturnType<typeof vi.fn>
          update: ReturnType<typeof vi.fn>
        }
      }) => Promise<unknown>

      const tx = {
        occurrence: {
          update: vi.fn().mockResolvedValue(updatedOccurrence),
        },
        timelinePost: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(timelineRecord),
          update: vi.fn(),
        },
      }

      const result = await typedCallback(tx)
      return result
    })

    const response = await patchOccurrenceStatus(
      new Request("http://localhost/api/occurrences/occ-1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "DONE", completedAt: "2024-04-01T10:05:00Z" }),
      }),
      { params: Promise.resolve({ id: "occ-1" }) },
    )

    expect(response.status).toBe(200)
    expect(mockedPrisma.$transaction).toHaveBeenCalled()
  })

  it("rejects updating to the same status", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "viewer-1" } })

    mockedPrisma.occurrence.findFirst.mockResolvedValueOnce({
      id: "occ-4",
      user_id: "viewer-1",
      status: "DONE",
      start_at: new Date(),
      end_at: new Date(),
      completed_at: new Date(),
      notes: null,
      created_at: new Date(),
      updated_at: new Date(),
      event: {
        id: "event-1",
        title: "英語",
        tag: null,
        visibility: "PRIVATE",
      },
    })

    const response = await patchOccurrenceStatus(
      new Request("http://localhost/api/occurrences/occ-4/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "DONE", completedAt: "2024-04-01T10:05:00Z" }),
      }),
      { params: Promise.resolve({ id: "occ-4" }) },
    )

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error.code).toBe("STATUS_UNCHANGED")
  })

  it("blocks deleting occurrences after scheduled time", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "viewer-1" } })

    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-04-02T00:00:00Z"))

    mockedPrisma.occurrence.findFirst.mockResolvedValueOnce({
      id: "occ-2",
      user_id: "viewer-1",
      end_at: new Date("2024-04-01T23:00:00Z"),
      status: "SCHEDULED",
    })

    const response = await deleteOccurrence(new Request("http://localhost/api/occurrences/occ-2", { method: "DELETE" }), {
      params: Promise.resolve({ id: "occ-2" }),
    })

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error.code).toBe("DELETE_NOT_ALLOWED")

  })

  it("allows deleting future scheduled occurrences", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "viewer-1" } })

    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-04-01T09:00:00Z"))

    mockedPrisma.occurrence.findFirst.mockResolvedValueOnce({
      id: "occ-3",
      user_id: "viewer-1",
      end_at: new Date("2024-04-01T12:00:00Z"),
      status: "SCHEDULED",
    })

    mockedPrisma.occurrence.delete.mockResolvedValueOnce({ id: "occ-3" })

    const response = await deleteOccurrence(new Request("http://localhost/api/occurrences/occ-3", { method: "DELETE" }), {
      params: Promise.resolve({ id: "occ-3" }),
    })

    expect(response.status).toBe(204)
    expect(mockedPrisma.occurrence.delete).toHaveBeenCalledWith({ where: { id: "occ-3" } })

  })
})
