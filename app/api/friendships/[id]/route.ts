import type { NextRequest } from "next/server"

import { auth } from "@/auth"
import { jsonErrorWithStatus } from "@/lib/api-response"
import { prisma } from "@/lib/prisma"

export async function DELETE(_request: NextRequest, context: unknown) {
  const { id } = (context as { params: { id: string } }).params

  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id

  try {
    const result = await prisma.friendship.deleteMany({
      where: {
        id,
        OR: [{ user_a_id: viewerId }, { user_b_id: viewerId }],
      },
    })

    if (result.count === 0) {
      return jsonErrorWithStatus("FRIENDSHIP_NOT_FOUND", "Friendship not found.", { status: 404 })
    }

    return new Response(null, { status: 204 })
  } catch (error) {
    console.error("[friendships/:id.DELETE]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to delete friendship.", { status: 500 })
  }
}
