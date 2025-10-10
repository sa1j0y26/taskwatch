import { RRule } from "rrule"

const MAX_OCCURRENCES = 12
const MAX_RANGE_DAYS = 90
const DAY_MS = 1000 * 60 * 60 * 24

export class RecurrenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RecurrenceError"
  }
}

type GenerateOptions = {
  rrule: string
  firstStart: Date
}

export function generateRecurringStartDates({ rrule, firstStart }: GenerateOptions) {
  try {
    const options = RRule.parseString(rrule)
    const freq = options.freq
    const interval = options.interval ?? 1

    if (!Number.isInteger(interval) || interval <= 0) {
      throw new RecurrenceError("Interval must be greater than 0.")
    }

    const results: Date[] = []
    const maxTimestamp = firstStart.getTime() + MAX_RANGE_DAYS * DAY_MS

    if (freq === RRule.DAILY) {
      let previous = new Date(firstStart)
      for (let i = 0; i < MAX_OCCURRENCES - 1; i += 1) {
        const next = new Date(previous)
        next.setDate(next.getDate() + interval)
        if (next.getTime() > maxTimestamp) {
          break
        }
        results.push(next)
        previous = next
      }
      return results
    }

    if (freq === RRule.WEEKLY) {
      let previous = new Date(firstStart)
      for (let i = 0; i < MAX_OCCURRENCES - 1; i += 1) {
        const next = new Date(previous)
        next.setDate(next.getDate() + interval * 7)
        if (next.getTime() > maxTimestamp) {
          break
        }
        results.push(next)
        previous = next
      }
      return results
    }

    throw new RecurrenceError("Unsupported recurrence frequency.")
  } catch (error) {
    if (error instanceof RecurrenceError) {
      throw error
    }
    throw new RecurrenceError("Invalid rrule format.")
  }
}
