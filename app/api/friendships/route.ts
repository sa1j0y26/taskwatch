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

export async function GET(request: NextRequest) {
  const session = await auth()

  void request

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id

  try {
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ user_a_id: viewerId }, { user_b_id: viewerId }],
      },
      include: {
        user_a: {
          select: { id: true, name: true, avatar: true, email: true },
        },
        user_b: {
          select: { id: true, name: true, avatar: true, email: true },
        },
      },
      orderBy: { created_at: "desc" },
    })

    return jsonSuccess({
      friendships: friendships.map((friendship) => {
        const friendUser =
          friendship.user_a_id === viewerId ? friendship.user_b : friendship.user_a
        return {
          id: friendship.id,
          friendUser,
          createdAt: friendship.created_at.toISOString(),
        }
      }),
    })
  } catch (error) {
    console.error("[friendships.GET]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to load friendships.", { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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

  const friendUserId = typeof (payload as { friendUserId?: unknown }).friendUserId === "string"
    ? (payload as { friendUserId: string }).friendUserId
    : ""

  if (!friendUserId) {
    return jsonErrorWithStatus("VALIDATION_ERROR", "friendUserId is required.", { status: 422 })
  }

  if (friendUserId === viewerId) {
    return jsonErrorWithStatus("INVALID_TARGET", "You cannot add yourself as a friend.", {
      status: 422,
    })
  }

  const [firstUser, secondUser] = [viewerId, friendUserId].sort()

  try {
    const friend = await prisma.user.findUnique({
      where: { id: friendUserId },
      select: { id: true, name: true, avatar: true, email: true },
    })

    if (!friend) {
      return jsonErrorWithStatus("USER_NOT_FOUND", "Friend user was not found.", { status: 404 })
    }

    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { user_a_id: viewerId, user_b_id: friendUserId },
          { user_a_id: friendUserId, user_b_id: viewerId },
        ],
      },
    })

    if (existingFriendship) {
      return jsonErrorWithStatus("ALREADY_FRIENDS", "Friendship already exists.", { status: 409 })
    }

    const incomingRequest = await prisma.friendRequest.findFirst({
      where: {
        requester_id: friendUserId,
        receiver_id: viewerId,
        status: REQUEST_STATUSES.pending,
      },
    })

    if (incomingRequest) {
      const updatedRequest = await prisma.friendRequest.update({
        where: { id: incomingRequest.id },
        data: {
          status: REQUEST_STATUSES.accepted,
          responded_at: new Date(),
        },
      })

      const friendship = await prisma.friendship.create({
        data: {
          user_a_id: firstUser,
          user_b_id: secondUser,
        },
      })

      return jsonSuccess(
        {
          friendship: {
            id: friendship.id,
            friendUser: friend,
            createdAt: friendship.created_at.toISOString(),
          },
          request: {
            id: updatedRequest.id,
            status: updatedRequest.status,
          },
        },
        { status: 201 },
      )
    }

    const existingOutgoing = await prisma.friendRequest.findFirst({
      where: {
        requester_id: viewerId,
        receiver_id: friendUserId,
        status: REQUEST_STATUSES.pending,
      },
    })

    if (existingOutgoing) {
      return jsonErrorWithStatus(
        "REQUEST_ALREADY_EXISTS",
        "Friend request already sent.",
        { status: 409 },
      )
    }

    const requestRecord = await prisma.friendRequest.create({
      data: {
        requester_id: viewerId,
        receiver_id: friendUserId,
      },
      include: {
        receiver: {
          select: { id: true, name: true, avatar: true, email: true },
        },
      },
    })

    return jsonSuccess(
      {
        friendRequest: {
          id: requestRecord.id,
          status: requestRecord.status,
          createdAt: requestRecord.created_at.toISOString(),
          receiver: requestRecord.receiver,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("[friendships.POST]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to create friendship.", { status: 500 })
  }
}
