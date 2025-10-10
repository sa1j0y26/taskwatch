import type { NextRequest } from "next/server"

import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import { prisma } from "@/lib/prisma"
const REQUEST_STATUSES = {
  pending: "PENDING",
  accepted: "ACCEPTED",
  rejected: "REJECTED",
  cancelled: "CANCELLED",
} as const

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

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await resolveParams(context)

  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonErrorWithStatus("INVALID_JSON", "Request body must be valid JSON.", { status: 400 })
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonErrorWithStatus("INVALID_BODY", "Request body must be an object.", { status: 400 })
  }

  const action = (payload as { action?: unknown }).action
  if (action !== "accept" && action !== "reject" && action !== "cancel") {
    return jsonErrorWithStatus(
      "INVALID_ACTION",
      "action must be one of accept, reject, cancel.",
      { status: 422 },
    )
  }

  try {
    const requestRecord = await prisma.friendRequest.findUnique({
      where: { id },
      include: {
        requester: {
          select: { id: true, name: true, avatar: true, email: true },
        },
        receiver: {
          select: { id: true, name: true, avatar: true, email: true },
        },
      },
    })

    if (!requestRecord) {
      return jsonErrorWithStatus("REQUEST_NOT_FOUND", "Friend request not found.", { status: 404 })
    }

    if (requestRecord.status !== REQUEST_STATUSES.pending) {
      return jsonErrorWithStatus("REQUEST_NOT_PENDING", "Friend request is no longer pending.", {
        status: 409,
      })
    }

    if (action === "accept" || action === "reject") {
      if (requestRecord.receiver_id !== viewerId) {
        return jsonErrorWithStatus("FORBIDDEN", "Only the receiver can respond to this request.", {
          status: 403,
        })
      }
    }

    if (action === "cancel" && requestRecord.requester_id !== viewerId) {
      return jsonErrorWithStatus("FORBIDDEN", "Only the requester can cancel this request.", {
        status: 403,
      })
    }

    if (action === "accept") {
      const updatedRequest = await prisma.friendRequest.update({
        where: { id },
        data: {
          status: REQUEST_STATUSES.accepted,
          responded_at: new Date(),
        },
      })

      const [firstUser, secondUser] = [requestRecord.requester_id, requestRecord.receiver_id].sort()

      const friendship = await prisma.friendship.create({
        data: {
          user_a_id: firstUser,
          user_b_id: secondUser,
        },
      })

      return jsonSuccess({
        request: {
          id: updatedRequest.id,
          status: updatedRequest.status,
          createdAt: updatedRequest.created_at.toISOString(),
          respondedAt: updatedRequest.responded_at?.toISOString() ?? null,
          requester: requestRecord.requester,
          receiver: requestRecord.receiver,
        },
        friendship: {
          id: friendship.id,
          friendUser:
            requestRecord.requester_id === viewerId
              ? requestRecord.receiver
              : requestRecord.requester,
          createdAt: friendship.created_at.toISOString(),
        },
      })
    }

    const newStatus = action === "reject" ? REQUEST_STATUSES.rejected : REQUEST_STATUSES.cancelled

    const updatedRequest = await prisma.friendRequest.update({
      where: { id },
      data: {
        status: newStatus,
        responded_at: new Date(),
      },
      include: {
        requester: {
          select: { id: true, name: true, avatar: true, email: true },
        },
        receiver: {
          select: { id: true, name: true, avatar: true, email: true },
        },
      },
    })

    return jsonSuccess({
      request: {
        id: updatedRequest.id,
        status: updatedRequest.status,
        createdAt: updatedRequest.created_at.toISOString(),
        respondedAt: updatedRequest.responded_at?.toISOString() ?? null,
        requester: updatedRequest.requester,
        receiver: updatedRequest.receiver,
      },
    })
  } catch (error) {
    console.error("[friendships.requests/:id.PATCH]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to update friend request.", { status: 500 })
  }
}
