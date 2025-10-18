import Link from "next/link"

export function SiteFooter() {
  return (
    <footer className="border-t border-strap/30 bg-surface/80">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1 text-sm text-muted">
          <p className="font-semibold text-forest">Taskwatch</p>
          <p>習慣タスクと学習時間を可視化し、友人と励まし合うプロジェクト。</p>
        </div>
        <nav className="flex flex-wrap gap-3 text-sm text-forest/80">
          <Link href="mailto:support@taskwatch.app" className="rounded-full px-3 py-2 transition hover:bg-forest/10">
            お問い合わせ
          </Link>
        </nav>
      </div>
    </footer>
  )
}
