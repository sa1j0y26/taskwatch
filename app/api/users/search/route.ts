import type { NextRequest } from "next/server"

import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import { prisma } from "@/lib/prisma"

const MAX_RESULTS = 10

export async function GET(request: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id
  const { searchParams } = new URL(request.url)
  const query = (searchParams.get("q") ?? "").trim()

  if (!query) {
    return jsonErrorWithStatus("INVALID_QUERY", "Query parameter q is required.", { status: 422 })
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        id: { not: viewerId },
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { name: "asc" },
      take: MAX_RESULTS,
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
      },
    })

    return jsonSuccess({
      results: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      })),
    })
  } catch (error) {
    console.error("[users.search]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to search users.", { status: 500 })
  }
}
