import type { NextRequest } from "next/server"

import { auth } from "@/auth"
import { jsonErrorWithStatus } from "@/lib/api-response"
import { prisma } from "@/lib/prisma"

type RouteParamsPromise = { params: Promise<{ id: string }> }
type RouteParamsResolved = { params: { id: string } }

type RouteContext = RouteParamsPromise | RouteParamsResolved

async function resolveParams(context: RouteContext) {
  const maybePromise = (context as RouteParamsPromise).params
  if (typeof (maybePromise as Promise<{ id: string }>).then === "function") {
    return await (maybePromise as Promise<{ id: string }>)
  }
  return (context as RouteParamsResolved).params
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await resolveParams(context)

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
