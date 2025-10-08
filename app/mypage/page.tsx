import { DashboardShell } from "../_components/dashboard-shell"

const WEEKLY_PROGRESS = [
  { day: "Mon", planned: 180, completed: 150 },
  { day: "Tue", planned: 200, completed: 180 },
  { day: "Wed", planned: 160, completed: 160 },
  { day: "Thu", planned: 210, completed: 120 },
  { day: "Fri", planned: 120, completed: 90 },
  { day: "Sat", planned: 240, completed: 210 },
  { day: "Sun", planned: 150, completed: 130 },
]

const NEXT_MILESTONES = [
  { label: "Lv. 6", detail: "あと 120 XP で到達" },
  { label: "ストリーク 30 日", detail: "今週 2 タスク達成でクリア" },
  { label: "ランキング 3 位", detail: "残り 45 分の学習が必要" },
]

export default function MyPage() {
  return (
    <DashboardShell
      title="マイページ"
      description="今週の学習状況やレベル進捗を振り返り、次の行動を決めましょう。"
    >
      <section className="grid gap-6 md:grid-cols-3">
        <StatCard title="現在のレベル" value="5" helper="累積 XP 1,250" accent />
        <StatCard title="ストリーク" value="18 日" helper="先週から +3" />
        <StatCard title="週間完遂率" value="82%" helper="目標: 90%" />
      </section>

      <section className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="rounded-2xl border border-strap/50 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-forest">週間タスク時間</h2>
            <span className="text-xs text-muted">単位: 分</span>
          </div>
          <div className="mt-6 grid grid-cols-7 gap-4">
            {WEEKLY_PROGRESS.map((item) => {
              const plannedHeight = Math.max(item.planned / 3, 8)
              const completedHeight = Math.max(item.completed / 3, 6)
              return (
                <div key={item.day} className="flex flex-col items-center gap-2">
                  <div className="flex h-40 w-6 flex-col justify-end gap-1">
                    <span
                      className="inline-block rounded-full bg-strap/70"
                      style={{ height: `${plannedHeight}px` }}
                    />
                    <span
                      className="inline-block rounded-full bg-forest/80"
                      style={{ height: `${completedHeight}px` }}
                    />
                  </div>
                  <p className="text-xs text-muted">{item.day}</p>
                </div>
              )
            })}
          </div>
          <div className="mt-8 flex flex-wrap gap-4 text-xs text-muted">
            <p className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-strap/70" />
              計画時間
            </p>
            <p className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-forest/80" />
              実績時間
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-strap/50 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-forest">次のマイルストーン</h2>
            <ul className="mt-4 space-y-3">
              {NEXT_MILESTONES.map((milestone) => (
                <li
                  key={milestone.label}
                  className="rounded-xl border border-strap/40 bg-surface px-4 py-3"
                >
                  <p className="text-sm font-semibold text-forest">
                    {milestone.label}
                  </p>
                  <p className="text-xs text-muted">{milestone.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        <div
          className="rounded-2xl border border-accent/40 p-6 shadow-sm"
          style={{
            background:
              "linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(186,229,201,0.6))",
          }}
        >
          <h2 className="text-lg font-semibold text-forest">今日のフォーカス</h2>
          <p className="mt-3 text-sm text-forest/90">
            1. 21:00 までに英語リスニング 45 分
            </p>
            <p className="text-sm text-forest/90">2. 22:00 から数学復習 30 分</p>
            <p className="mt-4 text-xs text-muted">
              完了報告をタイムラインに投稿して、友人からのフィードバックを受け取りましょう。
            </p>
          </div>
        </div>
      </section>
    </DashboardShell>
  )
}

type StatCardProps = {
  title: string
  value: string
  helper?: string
  accent?: boolean
}

function StatCard({ title, value, helper, accent = false }: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border p-6 shadow-sm transition ${
        accent
          ? "border-accent/40 bg-accent-soft"
          : "border-strap/40 bg-white hover:border-accent/40"
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-wide ${accent ? "text-accent" : "text-muted"}`}>
        {title}
      </p>
      <p className={`mt-3 text-3xl font-semibold ${accent ? "text-forest" : "text-forest"}`}>
        {value}
      </p>
      {helper ? (
        <p className={`mt-2 text-xs ${accent ? "text-forest/80" : "text-muted"}`}>
          {helper}
        </p>
      ) : null}
    </div>
  )
}
