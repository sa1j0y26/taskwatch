import { describe, expect, it, beforeEach, vi } from "vitest"

import { GET, PATCH } from "@/app/api/me/profile/route"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

describe("Profile API", () => {
  const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>
  const mockedPrisma = prisma as unknown as {
    user: {
      findUnique: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    mockedAuth.mockResolvedValueOnce(null)

    const response = await GET()

    expect(response.status).toBe(401)
  })

  it("returns current profile when authenticated", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "user-1" } })
    mockedPrisma.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      name: "Yuki",
      email: "yuki@example.com",
      avatar: null,
      avatar_color: "#14532D",
    })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.user).toEqual(
      expect.objectContaining({
        id: "user-1",
        name: "Yuki",
      }),
    )
  })

  it("updates profile name and color", async () => {
    mockedAuth.mockResolvedValueOnce({ user: { id: "user-1" } })
    mockedPrisma.user.update.mockResolvedValueOnce({
      id: "user-1",
      name: "新しい名前",
      email: "yuki@example.com",
      avatar: null,
      avatar_color: "#3366FF",
    })

    const response = await PATCH(
      new Request("http://localhost/api/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: " 新しい名前 ", avatarColor: "#3366ff" }),
      }),
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockedPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        name: "新しい名前",
        avatar_color: "#3366FF",
      },
      select: expect.any(Object),
    })
    expect(body.data.user.name).toBe("新しい名前")
    expect(body.data.user.avatar_color).toBe("#3366FF")
  })
})
