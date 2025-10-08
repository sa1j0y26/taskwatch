import Link from "next/link"

import SignIn from "./auth/.components/signin"
import SignOut from "./auth/.components/signout"

const FEATURE_CARDS = [
  {
    title: "時間をブロック",
    body: "習慣タスクをカレンダーに割り当て、日々の集中時間を確保できます。",
    href: "/calendar",
  },
  {
    title: "モチベーション維持",
    body: "週間ランキングで友人と競い合い、完遂率を可視化します。",
    href: "/ranking",
  },
  {
    title: "ふりかえりを共有",
    body: "タイムラインで完了報告や気づきを投稿し、リアクションをもらいましょう。",
    href: "/timeline",
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-16 px-6 py-12 lg:py-20">
        <header className="flex flex-col gap-6 rounded-3xl border border-strap/40 bg-gradient-to-br from-white via-emerald-50 to-strap/50 p-10 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted">
              共勉強を習慣に
            </p>
            <h1 className="text-4xl font-semibold text-forest md:text-5xl">
              Taskwatch で計画・実行・共有をシームレスに
            </h1>
            <p className="text-sm text-forest/80 md:text-base">
              学習や自己研鑽のタスクをカレンダーで管理し、完遂状況を友人と見える化。
              モチベーションを保つためのランキングやタイムラインも備えています。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <SignIn />
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 text-right text-xs text-muted">
            <p>ログイン済みですか？</p>
            <SignOut />
          </div>
        </header>

        <main className="grid gap-8 md:grid-cols-3">
          {FEATURE_CARDS.map((feature) => (
            <Link
              key={feature.title}
              href={feature.href}
              className="rounded-2xl border border-strap/40 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <h2 className="text-lg font-semibold text-forest">
                {feature.title}
              </h2>
              <p className="mt-3 text-sm text-muted">{feature.body}</p>
            </Link>
          ))}
        </main>
      </div>
    </div>
  )
}
