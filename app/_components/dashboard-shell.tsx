"use client"

import type { ReactNode } from "react"
import { useState } from "react"

import { DashboardNav } from "./dashboard-nav"

type DashboardShellProps = {
  title: string
  description?: string
  actionSlot?: ReactNode
  children: ReactNode
}

export function DashboardShell({
  title,
  description,
  actionSlot,
  children,
}: DashboardShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleNavigate = () => {
    setDrawerOpen(false)
  }

  return (
    <div className="min-h-screen bg-surface text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-6 lg:gap-12 lg:py-10">
        <div className="flex items-center justify-between lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 rounded-full border border-strap/60 bg-surface-elevated px-4 py-2 text-sm font-medium text-forest/80 shadow-sm"
          >
            <span className="inline-flex h-4 w-4 flex-col justify-between">
              <span className="block h-[2px] w-full rounded bg-forest"></span>
              <span className="block h-[2px] w-full rounded bg-forest"></span>
              <span className="block h-[2px] w-full rounded bg-forest"></span>
            </span>
            メニュー
          </button>
          <span className="text-sm font-medium text-muted">Taskwatch</span>
        </div>

        <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-12">
          <aside className="hidden lg:block">
            <DashboardNav onNavigate={handleNavigate} />
          </aside>

          <main className="flex flex-col gap-8 pb-16">
            <header className="flex flex-col gap-4 border-b border-strap/30 pb-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h1 className="text-2xl font-semibold text-forest md:text-3xl">
                    {title}
                  </h1>
                  {description ? (
                    <p className="max-w-3xl text-sm text-muted md:text-base">
                      {description}
                    </p>
                  ) : null}
                </div>
                {actionSlot ? <div className="flex-shrink-0">{actionSlot}</div> : null}
              </div>
            </header>
            {children}
          </main>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-40 transition ${
          drawerOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!drawerOpen}
      >
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setDrawerOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 h-full w-80 max-w-[80vw] -translate-x-full bg-surface-elevated p-6 shadow-xl transition-transform ${
            drawerOpen ? "translate-x-0" : ""
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-forest">Taskwatch</p>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-full border border-strap/40 px-3 py-1 text-xs text-muted"
            >
              閉じる
            </button>
          </div>
          <DashboardNav onNavigate={handleNavigate} />
        </div>
      </div>
    </div>
  )
}
