import { NextResponse } from "next/server"

type ErrorPayload = {
  code: string
  message: string
  details?: Record<string, unknown>
}

type ErrorOptions = {
  status?: number
  details?: Record<string, unknown>
}

export function jsonSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init)
}

export function jsonError({ code, message, details }: ErrorPayload, init?: ResponseInit) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, init)
}

export function jsonErrorWithStatus(code: string, message: string, options?: ErrorOptions) {
  const { status = 400, details } = options ?? {}
  return jsonError({ code, message, details }, { status })
}
