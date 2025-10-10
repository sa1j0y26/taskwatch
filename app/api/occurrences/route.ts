import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import {
  ONE_DAY_MS,
  parseDate,
  serializeOccurrence,
} from "@/lib/events/helpers"
import { prisma } from "@/lib/prisma"
import { OccurrenceStatus } from "@prisma/client"

const MAX_RANGE_DAYS = 31

export async function GET(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const viewerId = session.user.id
  const { searchParams } = new URL(request.url)

  const startParam = searchParams.get("start")
  const endParam = searchParams.get("end")
  const statusParam = searchParams.get("status")

  if (!startParam || !endParam) {
    return jsonErrorWithStatus("MISSING_RANGE", "start and end query parameters are required.", {
      status: 422,
    })
  }

  const rangeStart = parseDate(startParam)
  const rangeEnd = parseDate(endParam)

  if (!rangeStart || !rangeEnd) {
    return jsonErrorWithStatus("INVALID_RANGE", "start and end must be valid ISO dates.", {
      status: 422,
    })
  }

  if (rangeEnd <= rangeStart) {
    return jsonErrorWithStatus("INVALID_RANGE", "end must be later than start.", {
      status: 422,
    })
  }

  const rangeDays = (rangeEnd.getTime() - rangeStart.getTime()) / ONE_DAY_MS
  if (rangeDays > MAX_RANGE_DAYS) {
    return jsonErrorWithStatus(
      "RANGE_TOO_LARGE",
      `Requested range must be ${MAX_RANGE_DAYS} days or less.`,
      { status: 422 },
    )
  }

  let statusFilter: OccurrenceStatus | undefined
  if (statusParam) {
    const normalized = statusParam.toUpperCase()
    if (
      normalized !== OccurrenceStatus.SCHEDULED &&
      normalized !== OccurrenceStatus.DONE &&
      normalized !== OccurrenceStatus.MISSED
    ) {
      return jsonErrorWithStatus(
        "INVALID_STATUS",
        "status must be SCHEDULED, DONE, or MISSED.",
        { status: 422 },
      )
    }

    statusFilter = normalized as OccurrenceStatus
  }

  try {
    const occurrences = await prisma.occurrence.findMany({
      where: {
        user_id: viewerId,
        start_at: {
          gte: rangeStart,
          lt: rangeEnd,
        },
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      orderBy: { start_at: "asc" },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            rrule: true,
            tag: true,
            visibility: true,
          },
        },
      },
    })

    return jsonSuccess({
      occurrences: occurrences.map((occurrence) => ({
        ...serializeOccurrence(occurrence),
        event: occurrence.event
          ? {
              id: occurrence.event.id,
              title: occurrence.event.title,
              rrule: occurrence.event.rrule,
              tag: occurrence.event.tag,
              visibility: occurrence.event.visibility,
            }
          : null,
      })),
    })
  } catch (error) {
    console.error("[occurrences.GET]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "Failed to fetch occurrences.", { status: 500 })
  }
}
