"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { signOutAction } from "../_actions/sign-out"

type DashboardNavProps = {
  onNavigate?: () => void
}

const NAV_ITEMS = [
  { href: "/mypage", label: "マイページ", hint: "週間の振り返り" },
  { href: "/calendar", label: "カレンダー", hint: "予定とブロック調整" },
  { href: "/ranking", label: "ランキング", hint: "友人と競い合う" },
  { href: "/timeline", label: "タイムライン", hint: "報告を共有" },
]

export function DashboardNav({ onNavigate }: DashboardNavProps) {
  const pathname = usePathname()

  return (
    <nav>
      <ul className="flex flex-col gap-4">
        <li>
          <div className="space-y-2 rounded-2xl border border-strap/30 bg-white/80 p-5 shadow-sm backdrop-blur">
            <h2 className="text-xl font-semibold text-forest">ダッシュボード</h2>
            <p className="text-xs text-muted">
              習慣・学習タスクの進捗を一箇所で把握しましょう。
            </p>
          </div>
        </li>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={`flex flex-col rounded-xl border px-4 py-3 transition ${
                  isActive
                    ? "border-accent/40 bg-forest text-white shadow"
                    : "border-strap/40 bg-white text-forest/80 hover:bg-accent-soft"
                }`}
              >
                <span className="text-sm font-medium">{item.label}</span>
                <span className={`text-xs ${isActive ? "text-white/80" : "text-muted"}`}>
                  {item.hint}
                </span>
              </Link>
            </li>
          )
        })}
        <li>
          <div className="flex flex-col gap-2 text-xs text-muted">
            <Link
              href="mailto:support@taskwatch.app"
              onClick={onNavigate}
              className="rounded-xl border border-strap/40 bg-white px-4 py-3 text-sm font-medium text-forest/80 transition hover:bg-forest/10"
            >
              お問い合わせ
            </Link>
            <SignOutButton onNavigate={onNavigate} />
          </div>
        </li>
      </ul>
    </nav>
  )
}

function SignOutButton({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <form
      action={signOutAction}
      onSubmit={() => {
        onNavigate?.()
      }}
    >
      <button
        type="submit"
        className="w-full rounded-xl border border-strap/40 bg-white px-4 py-3 text-left text-sm font-medium text-forest/80 transition hover:bg-accent-soft"
      >
        サインアウト
      </button>
    </form>
  )
}
