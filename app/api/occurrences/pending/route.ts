import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import { serializeOccurrence } from "@/lib/events/helpers"
import { prisma } from "@/lib/prisma"
import { OccurrenceStatus } from "@prisma/client"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function GET(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id
  const { searchParams } = new URL(request.url)

  const beforeParam = searchParams.get("before")
  const limitParam = searchParams.get("limit")
  const cursorId = searchParams.get("cursorId")

  let cutoff = new Date()
  if (beforeParam) {
    const parsed = new Date(beforeParam)
    if (Number.isNaN(parsed.getTime())) {
      return jsonErrorWithStatus("INVALID_BEFORE", "before must be a valid ISO date string.", {
        status: 422,
      })
    }
    cutoff = parsed
  }

  let limit = DEFAULT_LIMIT
  if (limitParam) {
    const parsedLimit = parseInt(limitParam, 10)
    if (Number.isNaN(parsedLimit) || parsedLimit <= 0) {
      return jsonErrorWithStatus("INVALID_LIMIT", "limit must be a positive integer.", {
        status: 422,
      })
    }
    limit = Math.min(parsedLimit, MAX_LIMIT)
  }

  const baseWhere = {
    user_id: viewerId,
    status: OccurrenceStatus.SCHEDULED,
    end_at: {
      lt: cutoff,
    },
  }

  try {
    let cursor: { id: string } | undefined
    if (cursorId) {
      const cursorRecord = await prisma.occurrence.findFirst({
        where: {
          id: cursorId,
          user_id: viewerId,
          status: OccurrenceStatus.SCHEDULED,
          end_at: {
            lt: cutoff,
          },
        },
        select: { id: true },
      })

      if (!cursorRecord) {
        return jsonErrorWithStatus("INVALID_CURSOR", "cursorId does not reference a pending occurrence.", {
          status: 404,
        })
      }

      cursor = { id: cursorRecord.id }
    }

    const [occurrences, total] = await prisma.$transaction([
      prisma.occurrence.findMany({
        where: baseWhere,
        orderBy: [
          { end_at: "asc" },
          { id: "asc" },
        ],
        ...(cursor ? { cursor, skip: 1 } : {}),
        take: limit,
        include: {
          event: {
            select: {
              id: true,
              title: true,
              tag: true,
              visibility: true,
            },
          },
        },
      }),
      prisma.occurrence.count({ where: baseWhere }),
    ])

    const payload = occurrences.map((occurrence) => ({
      ...serializeOccurrence(occurrence),
      event: occurrence.event
        ? {
            id: occurrence.event.id,
            title: occurrence.event.title,
            tag: occurrence.event.tag,
            visibility: occurrence.event.visibility,
          }
        : null,
      overdueMinutes: Math.max(
        0,
        Math.floor((cutoff.getTime() - occurrence.end_at.getTime()) / (1000 * 60)),
      ),
    }))

    return jsonSuccess({
      occurrences: payload,
      total,
      hasMore: total > payload.length,
      cutoff: cutoff.toISOString(),
    })
  } catch (error) {
    console.error("[occurrences.pending.GET]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to load pending occurrences.", {
      status: 500,
    })
  }
}
