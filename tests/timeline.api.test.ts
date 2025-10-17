import { describe, expect, it, beforeEach, vi } from "vitest"

import { GET as getTimeline, POST as postTimeline } from "@/app/api/timeline/route"
import { POST as reactToTimeline } from "@/app/api/timeline/[id]/reactions/route"
import { auth } from "@/auth"
import { getFriendIdsForUser, areUsersFriends } from "@/lib/friendship"
import { prisma } from "@/lib/prisma"
import { publishRealtime } from "@/lib/realtime"

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}))

vi.mock("@/lib/realtime", () => ({
  publishRealtime: vi.fn(),
}))

vi.mock("@/lib/prisma", () => {
  const reactionApi = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    groupBy: vi.fn(),
  }

  const timelineApi = {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  }

  return {
    prisma: {
      timelinePost: timelineApi,
      reaction: reactionApi,
      $transaction: vi.fn(),
    },
  }
})

vi.mock("@/lib/friendship", () => ({
  getFriendIdsForUser: vi.fn(),
  areUsersFriends: vi.fn(),
}))

describe("Timeline API", () => {
  const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
  const mockedFriends = getFriendIdsForUser as unknown as ReturnType<typeof vi.fn>
  const mockedPrisma = prisma as unknown as {
    timelinePost: {
      findMany: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
      findUnique: ReturnType<typeof vi.fn>
    }
    reaction: {
      findUnique: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
      deleteMany: ReturnType<typeof vi.fn>
      groupBy: ReturnType<typeof vi.fn>
    }
    $transaction: ReturnType<typeof vi.fn>
  }
  const mockedAreFriends = areUsersFriends as unknown as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const response = await getTimeline(new Request("http://localhost/api/timeline"))

    expect(response.status).toBe(401)
  })

  it("returns serialized timeline posts for viewer and friends", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "viewer-1" } })
    mockedFriends.mockResolvedValueOnce(["viewer-1", "friend-1"])

    const now = new Date("2024-04-01T10:00:00Z")

    mockedPrisma.timelinePost.findMany.mockResolvedValueOnce([
      {
        id: "post-1",
        user_id: "friend-1",
        occurrence_id: null,
        message: "メッセージ",
        kind: "MANUAL_NOTE",
        memo: null,
        memo_updated_at: null,
        visibility: "PRIVATE",
        created_at: now,
        updated_at: now,
        user: { id: "friend-1", name: "Aoi", avatar: null, avatar_color: "#14532D" },
        occurrence: null,
        reactions: [{ user_id: "viewer-1", type: "LIKE" }],
      },
    ])

    const response = await getTimeline(new Request("http://localhost/api/timeline"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockedPrisma.timelinePost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: {
            in: ["viewer-1", "friend-1"],
          },
        },
        take: 21,
      }),
    )
    expect(body.data.items[0]).toEqual(
      expect.objectContaining({
        id: "post-1",
        message: "メッセージ",
        reactions: { likes: 1, bads: 0, viewerReaction: "LIKE" },
      }),
    )
    expect(body.data.items[0].author).toEqual(
      expect.objectContaining({
        color: "#14532D",
      }),
    )
  })

  it("validates manual post payload", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "viewer-1" } })

    const response = await postTimeline(
      new Request("http://localhost/api/timeline", {
        method: "POST",
        body: JSON.stringify({ message: "" }),
      }),
    )

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error.code).toBe("VALIDATION_ERROR")
  })

  it("creates manual timeline posts", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "viewer-1" } })

    const createdAt = new Date("2024-04-01T12:00:00Z")

    mockedPrisma.timelinePost.create.mockResolvedValueOnce({
      id: "post-2",
      user_id: "viewer-1",
      occurrence_id: null,
      message: "がんばった",
      kind: "MANUAL_NOTE",
      memo: null,
      memo_updated_at: null,
      visibility: "PRIVATE",
      created_at: createdAt,
      updated_at: createdAt,
      user: { id: "viewer-1", name: "Yuki", avatar: null, avatar_color: "#14532D" },
      occurrence: null,
      reactions: [],
    })

    const response = await postTimeline(
      new Request("http://localhost/api/timeline", {
        method: "POST",
        body: JSON.stringify({ message: "がんばった" }),
      }),
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(mockedPrisma.timelinePost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: "viewer-1",
          message: "がんばった",
          kind: "MANUAL_NOTE",
        }),
      }),
    )
    expect(body.data.post).toEqual(
      expect.objectContaining({
        id: "post-2",
        message: "がんばった",
        reactions: { likes: 0, bads: 0, viewerReaction: null },
      }),
    )
    expect(body.data.post.author).toEqual(expect.objectContaining({ color: "#14532D" }))
    expect(publishRealtime).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "timeline.posted",
        payload: expect.any(Object),
      }),
    )
  })

  it("adds reactions and returns updated counts", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "viewer-1" } })
    mockedAreFriends.mockResolvedValue(true)

    mockedPrisma.timelinePost.findUnique.mockResolvedValue({ id: "post-3", user_id: "friend-1" })

    mockedPrisma.$transaction
      .mockImplementationOnce(async (callback) => {
        const typedCallback = callback as (tx: {
          reaction: {
            findUnique: ReturnType<typeof vi.fn>
            create: ReturnType<typeof vi.fn>
            update: ReturnType<typeof vi.fn>
            delete: ReturnType<typeof vi.fn>
          }
        }) => Promise<unknown>

        const tx = {
          reaction: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: "r-1" }),
            update: vi.fn(),
            delete: vi.fn(),
          },
        }

                return typedCallback(tx)
      })
      .mockImplementationOnce(async (callback) => {
        const typedCallback = callback as (tx: {
          reaction: {
            findUnique: ReturnType<typeof vi.fn>
            create: ReturnType<typeof vi.fn>
            update: ReturnType<typeof vi.fn>
            delete: ReturnType<typeof vi.fn>
          }
        }) => Promise<unknown>

        const tx = {
          reaction: {
            groupBy: vi.fn().mockResolvedValue([{ type: "LIKE", _count: { _all: 1 } }]),
            findUnique: vi.fn().mockResolvedValue({ type: "LIKE" }),
          },
        }

        return typedCallback(tx)
      })

    const response = await reactToTimeline(
      new Request("http://localhost/api/timeline/post-3/reactions", {
        method: "POST",
        body: JSON.stringify({ type: "LIKE" }),
      }),
      { params: Promise.resolve({ id: "post-3" }) },
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.reactions).toEqual({ likes: 1, bads: 0, viewerReaction: "LIKE" })
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(2)
    expect(publishRealtime).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "timeline.reacted",
        payload: expect.objectContaining({ postId: "post-3" }),
      }),
    )
  })
})
