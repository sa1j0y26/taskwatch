import type { NextRequest } from "next/server"

import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import { prisma } from "@/lib/prisma"
import { publicUserSelect, serializePublicUser } from "@/lib/user"
const REQUEST_STATUSES = {
  pending: "PENDING",
  accepted: "ACCEPTED",
  rejected: "REJECTED",
  cancelled: "CANCELLED",
} as const

export async function GET(request: NextRequest) {
  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id
  const { searchParams } = new URL(request.url)
  const includeHistory = searchParams.get("includeHistory") === "true"
  const direction = searchParams.get("direction")
  const statuses = includeHistory
    ? [
        REQUEST_STATUSES.pending,
        REQUEST_STATUSES.accepted,
        REQUEST_STATUSES.rejected,
        REQUEST_STATUSES.cancelled,
      ]
    : [REQUEST_STATUSES.pending]

  try {
    const baseWhere = {
      status: { in: statuses },
    }

    const receivedRecords = await prisma.friendRequest.findMany({
      where: {
        ...baseWhere,
        receiver_id: viewerId,
      },
      include: {
        requester: {
          select: publicUserSelect,
        },
      },
      orderBy: { created_at: "desc" },
    })

    const sentRecords = await prisma.friendRequest.findMany({
      where: {
        ...baseWhere,
        requester_id: viewerId,
      },
      include: {
        receiver: {
          select: publicUserSelect,
        },
      },
      orderBy: { created_at: "desc" },
    })

    const received = receivedRecords.map((requestRecord) => ({
      id: requestRecord.id,
      status: requestRecord.status,
      createdAt: requestRecord.created_at.toISOString(),
      respondedAt: requestRecord.responded_at?.toISOString() ?? null,
      requester: serializePublicUser(requestRecord.requester)!,
    }))

    const sent = sentRecords.map((requestRecord) => ({
      id: requestRecord.id,
      status: requestRecord.status,
      createdAt: requestRecord.created_at.toISOString(),
      respondedAt: requestRecord.responded_at?.toISOString() ?? null,
      receiver: serializePublicUser(requestRecord.receiver)!,
    }))

    if (direction === "received") {
      return jsonSuccess({ requests: { received } })
    }

    if (direction === "sent") {
      return jsonSuccess({ requests: { sent } })
    }

    return jsonSuccess({ requests: { received, sent } })
  } catch (error) {
    console.error("[friendships.requests.GET]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to load friend requests.", { status: 500 })
  }
}
