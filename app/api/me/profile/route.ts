import { auth } from "@/auth"
import { jsonErrorWithStatus, jsonSuccess } from "@/lib/api-response"
import { prisma } from "@/lib/prisma"

const MAX_NAME_LENGTH = 50

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      avatar_color: true,
    },
  })

  if (!user) {
    return jsonErrorWithStatus("USER_NOT_FOUND", "User not found.", { status: 404 })
  }

  return jsonSuccess({ user })
}

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return jsonErrorWithStatus("UNAUTHORIZED", "Authentication required.", { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonErrorWithStatus("INVALID_JSON", "Request body must be valid JSON.", { status: 400 })
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonErrorWithStatus("INVALID_BODY", "Request body must be an object.", { status: 400 })
  }

  const { name, avatarColor } = payload as Record<string, unknown>
  const issues: Record<string, string> = {}

  let normalizedName: string | undefined
  if (name !== undefined) {
    if (typeof name !== "string") {
      issues.name = "名前は文字列で入力してください。"
    } else {
      const trimmed = name.trim()
      if (trimmed.length === 0) {
        issues.name = "名前を入力してください。"
      } else if (trimmed.length > MAX_NAME_LENGTH) {
        issues.name = `名前は最大 ${MAX_NAME_LENGTH} 文字までです。`
      } else {
        normalizedName = trimmed
      }
    }
  }

  let normalizedColor: string | null | undefined
  if (avatarColor !== undefined) {
    if (avatarColor === null) {
      normalizedColor = null
    } else if (typeof avatarColor !== "string") {
      issues.avatarColor = "アイコンカラーは文字列で入力してください。"
    } else {
      const trimmed = avatarColor.trim()
      if (!trimmed) {
        normalizedColor = null
      } else if (!/^#([0-9a-fA-F]{6})$/.test(trimmed)) {
        issues.avatarColor = "カラーコードは #RRGGBB 形式で指定してください。"
      } else {
        normalizedColor = trimmed.toUpperCase()
      }
    }
  }

  if (Object.keys(issues).length > 0) {
    return jsonErrorWithStatus("VALIDATION_ERROR", "プロフィールの更新に失敗しました。", {
      status: 422,
      details: issues,
    })
  }

  if (normalizedName === undefined && normalizedColor === undefined) {
    return jsonErrorWithStatus("NO_CHANGES", "更新対象の項目がありません。", { status: 400 })
  }

  try {
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(normalizedName !== undefined ? { name: normalizedName } : {}),
        ...(normalizedColor !== undefined ? { avatar_color: normalizedColor } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        avatar_color: true,
      },
    })

    return jsonSuccess({ user: updated })
  } catch (error) {
    console.error("[profile.PATCH]", error)
    return jsonErrorWithStatus("INTERNAL_ERROR", "プロフィールの更新に失敗しました。", { status: 500 })
  }
}
