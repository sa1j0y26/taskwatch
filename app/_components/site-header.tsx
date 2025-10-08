export function SiteHeader() {
  return (
    <header className="border-b border-forest/70 bg-forest text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-forest-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
            TW
          </span>
          <span className="text-lg font-semibold">Taskwatch</span>
        </div>
      </div>
    </header>
  )
}
