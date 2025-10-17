"use client"

import type { FormEvent } from "react"
import { useEffect, useState } from "react"

import { DashboardShell } from "../_components/dashboard-shell"

type ProfileResponse = {
  data?: {
    user: {
      id: string
      name: string
      email: string
      avatar: string | null
      avatar_color: string | null
    }
  }
  error?: {
    message?: string
  }
}

type UpdatePayload = {
  name?: string
  avatarColor?: string | null
}

export default function SettingsPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [avatarColor, setAvatarColor] = useState("#14532D")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadProfile = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await fetch("/api/me/profile", { method: "GET", credentials: "include" })
        const body = (await safeParseJSON(response)) as ProfileResponse | null

        if (!response.ok || !body?.data?.user) {
          throw new Error(body?.error?.message ?? "プロフィール情報の取得に失敗しました。")
        }

        if (!cancelled) {
          const user = body.data.user
          setName(user.name ?? "")
          setEmail(user.email ?? "")
          setAvatarColor(user.avatar_color ?? "#14532D")
        }
      } catch (err) {
        console.error("[settings.load]", err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "プロフィール情報の取得に失敗しました。")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSaving(true)
    setSuccess(null)
    setError(null)

    const payload: UpdatePayload = {}
    const trimmedName = name.trim()
    if (trimmedName) {
      payload.name = trimmedName
    }

    payload.avatarColor = avatarColor ?? null

    try {
      const response = await fetch("/api/me/profile", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      const body = (await safeParseJSON(response)) as ProfileResponse | null

      if (!response.ok || !body?.data?.user) {
        throw new Error(body?.error?.message ?? "プロフィールの更新に失敗しました。")
      }

      setName(body.data.user.name)
      setAvatarColor(body.data.user.avatar_color ?? "#14532D")
      setSuccess("プロフィールを更新しました。")
    } catch (err) {
      console.error("[settings.update]", err)
      setError(err instanceof Error ? err.message : "プロフィールの更新に失敗しました。")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <DashboardShell title="アカウント設定" description="表示名やアイコンを編集できます。">
      <section className="rounded-2xl border border-strap/40 bg-white p-6 shadow-sm">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-forest" htmlFor="name">
              表示名
            </label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-strap/40 px-4 py-2 text-sm text-forest focus:border-accent focus:outline-none"
              maxLength={50}
              disabled={isLoading || isSaving}
              placeholder="例: 山田 太郎"
            />
            <p className="text-xs text-muted">ダッシュボードやタイムラインに表示される名前です。</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-forest" htmlFor="email">
              メールアドレス
            </label>
            <input
              id="email"
              value={email}
              readOnly
              className="w-full rounded-xl border border-strap/40 bg-surface px-4 py-2 text-sm text-muted"
            />
            <p className="text-xs text-muted">Google アカウントと連携しているため変更できません。</p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-forest" htmlFor="avatarColor">
              アイコンカラー
            </label>
            <div className="flex items-center gap-3">
              <input
                id="avatarColor"
                type="color"
                value={avatarColor}
                onChange={(event) => setAvatarColor(event.target.value)}
                disabled={isLoading || isSaving}
                className="h-12 w-16 rounded border border-strap/40"
              />
              <input
                value={avatarColor}
                onChange={(event) => setAvatarColor(event.target.value)}
                className="flex-1 rounded-xl border border-strap/40 px-4 py-2 text-sm text-forest focus:border-accent focus:outline-none"
                disabled={isLoading || isSaving}
                maxLength={7}
                placeholder="#14532D"
              />
            </div>
            <p className="text-xs text-muted">カラーコードは #RRGGBB 形式で指定してください。</p>
          </div>

          {error ? (
            <div className="rounded-xl border border-accent bg-accent-soft p-4 text-xs text-accent">{error}</div>
          ) : null}
          {success ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700">
              {success}
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isLoading || isSaving}
              className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            >
              {isSaving ? "保存中..." : "保存する"}
            </button>
          </div>
        </form>
      </section>
    </DashboardShell>
  )
}

async function safeParseJSON(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}
