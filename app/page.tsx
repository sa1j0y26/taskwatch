import Link from "next/link"

import SignIn from "./auth/.components/signin"
import SignOut from "./auth/.components/signout"

const FEATURE_CARDS = [
  {
    title: "カレンダーで予定を固定",
    body: "繰り返しタスクや単発イベントを時間ブロックとして管理。未評価タスクもひと目で分かります。",
    href: "/calendar",
  },
  {
    title: "リアルタイムな報告",
    body: "タスク完了・未達の自動投稿や手動メモがタイムラインに即時配信され、友人と励まし合えます。",
    href: "/timeline",
  },
  {
    title: "週間ランキング",
    body: "完了時間・達成率・ストリークを比較してモチベーションを維持。ダッシュボードのカードとも連動。",
    href: "/ranking",
  },
  {
    title: "プロフィール管理",
    body: "表示名やアイコンをアカウント設定から即変更。リアクションやランキングに反映されます。",
    href: "/settings",
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
              学習や自己研鑽のタスクを時間ブロックで管理し、完了・未達の結果をタイムラインで自動共有。
              友人とランキングで競い合いながら、毎日の積み重ねを可視化します。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <SignIn />
              <Link
                href="/mypage"
                className="rounded-full border border-strap/40 px-4 py-2 text-sm font-semibold text-forest/80 transition hover:bg-accent-soft"
              >
                ダッシュボードを見る
              </Link>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 text-right text-xs text-muted">
            <p>ログイン済みですか？</p>
            <SignOut />
          </div>
        </header>

        <main className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
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
