import { DashboardShell } from "../_components/dashboard-shell"

const RANKING_DATA = [
  {
    rank: 1,
    name: "Yuki",
    avatar: "Y",
    totalMinutes: 540,
    completionRate: 0.89,
    streak: 18,
  },
  {
    rank: 2,
    name: "Aoi",
    avatar: "A",
    totalMinutes: 520,
    completionRate: 0.85,
    streak: 12,
  },
  {
    rank: 3,
    name: "Ren",
    avatar: "R",
    totalMinutes: 470,
    completionRate: 0.8,
    streak: 9,
  },
  {
    rank: 4,
    name: "Sara",
    avatar: "S",
    totalMinutes: 430,
    completionRate: 0.78,
    streak: 6,
  },
]

export default function RankingPage() {
  return (
    <DashboardShell
      title="ランキング"
      description="週間の総学習時間と完遂率で競い合い、互いのモチベーションを高めましょう。"
      actionSlot={
        <button className="rounded-full border border-strap/50 px-4 py-2 text-sm font-medium text-forest/80 hover:bg-forest/10">
          期間を変更
        </button>
      }
    >
      <section className="rounded-2xl border border-strap/50 bg-white p-6 shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-forest">
              今週 (6/10 - 6/16)
            </h2>
            <p className="text-xs text-muted">
              完了タスクのポイントと学習時間を元にランキングを集計しています。
            </p>
          </div>
          <div className="flex gap-2 text-xs text-muted">
            <span className="rounded-full bg-accent/15 px-2 py-1 text-accent/90">完遂率</span>
            <span className="rounded-full bg-strap/50 px-2 py-1">ストリーク</span>
          </div>
        </header>
        <div className="mt-6 overflow-hidden rounded-xl border border-strap/40">
          <table className="w-full table-fixed border-collapse text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">順位</th>
                <th className="px-4 py-3">メンバー</th>
                <th className="px-4 py-3">総学習時間</th>
                <th className="px-4 py-3">完遂率</th>
                <th className="px-4 py-3">ストリーク</th>
              </tr>
            </thead>
            <tbody>
              {RANKING_DATA.map((user, index) => (
                <tr
                  key={user.name}
                  className={`border-t border-strap/30 ${
                    index === 0 ? "bg-accent-soft" : "bg-white"
                  }`}
                >
                  <td className="px-4 py-4 text-lg font-semibold text-forest">
                    #{user.rank}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest/10 text-sm font-semibold text-forest">
                        {user.avatar}
                      </span>
                      <span className="text-sm font-medium text-forest">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-forest">
                    {user.totalMinutes} 分
                  </td>
                  <td className="px-4 py-4 text-sm text-forest">
                    {(user.completionRate * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-4 text-sm text-forest">{user.streak} 日</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  )
}
