import { DashboardShell } from "../_components/dashboard-shell"

const TIMELINE_POSTS = [
  {
    id: "1",
    user: "Aoi",
    avatar: "A",
    timestamp: "15 分前",
    message: "英語リスニング 45 分を完了！シャドーイングが難しかったけど集中できた。",
    reaction: { likes: 5, bads: 0 },
    occurrence: {
      title: "英語リスニング",
      status: "DONE",
      startAt: "19:00",
    },
  },
  {
    id: "2",
    user: "Ren",
    avatar: "R",
    timestamp: "1 時間前",
    message: "数学の過去問でミスが多発…。明日は早めに復習時間を確保します。",
    reaction: { likes: 2, bads: 1 },
    occurrence: {
      title: "数学過去問演習",
      status: "MISSED",
      startAt: "21:30",
    },
  },
]

export default function TimelinePage() {
  return (
    <DashboardShell
      title="タイムライン"
      description="友人たちの完了・未達成報告を確認して、リアクションを送り合いましょう。"
    >
      <section className="space-y-4">
        {TIMELINE_POSTS.map((post) => (
          <article
            key={post.id}
            className="rounded-2xl border border-strap/40 bg-white p-5 shadow-sm"
          >
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest/10 text-sm font-semibold text-forest">
                  {post.avatar}
                </span>
                <div>
                  <p className="text-sm font-semibold text-forest">{post.user}</p>
                  <p className="text-xs text-muted">{post.timestamp}</p>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-semibold ${
                  post.occurrence.status === "DONE"
                    ? "bg-accent/15 text-accent/90"
                    : "bg-strap/60 text-forest"
                }`}
              >
                {post.occurrence.status === "DONE" ? "完了" : "未達成"}
              </span>
            </header>
            <p className="mt-4 text-sm text-forest/90">{post.message}</p>
            <div className="mt-4 rounded-xl border border-strap/30 bg-surface px-4 py-3 text-xs text-muted">
              <p className="font-medium text-forest">{post.occurrence.title}</p>
              <p>開始: {post.occurrence.startAt}</p>
            </div>
            <footer className="mt-4 flex gap-4 text-xs text-muted">
              <span>👍 {post.reaction.likes}</span>
              <span>🙁 {post.reaction.bads}</span>
            </footer>
          </article>
        ))}
      </section>
      <section className="rounded-2xl border border-dashed border-accent/40 bg-accent-soft p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-forest">投稿アイデア</h3>
        <p className="mt-2 text-xs text-muted">
          完了タスクは一言ふりかえりを添えて投稿し、友人からのリアクションをもらいましょう。未達成でも気づきを共有すると改善が進みます。
        </p>
      </section>
    </DashboardShell>
  )
}
