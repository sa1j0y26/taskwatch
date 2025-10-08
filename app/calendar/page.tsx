"use client"

import { useEffect, useMemo, useState } from "react"

import { DashboardShell } from "../_components/dashboard-shell"

const START_HOUR = 6
const END_HOUR = 22
const HOUR_HEIGHT = 44

const FRIENDS = [
  { id: "me", name: "自分" },
  { id: "aoi", name: "Aoi" },
  { id: "ren", name: "Ren" },
]

const CALENDAR_DAYS = Array.from({ length: 7 }, (_, index) => {
  const base = new Date("2024-06-10")
  base.setDate(base.getDate() + index)
  return {
    key: base.toISOString().slice(0, 10),
    label: base.getDate(),
    weekday: base.toLocaleDateString("ja-JP", { weekday: "short" }),
  }
})

type ScheduleEntry = {
  id: string
  title: string
  tag: string
  start: string
  end: string
  status: "予定" | "完了" | "未達成"
  description?: string
}

type ScheduleMap = Record<string, Record<string, ScheduleEntry[]>>

const SCHEDULES: ScheduleMap = {
  me: {
    "2024-06-10": [
      {
        id: "m1",
        title: "通学読書",
        tag: "習慣",
        start: "07:00",
        end: "07:30",
        status: "完了",
      },
      {
        id: "m2",
        title: "数学過去問",
        tag: "受験",
        start: "20:00",
        end: "21:30",
        status: "予定",
        description: "第5回 模試 A 問題を解く",
      },
    ],
    "2024-06-12": [
      {
        id: "m3",
        title: "英語リスニング",
        tag: "英語",
        start: "19:00",
        end: "20:00",
        status: "予定",
      },
      {
        id: "m4",
        title: "物理復習",
        tag: "理系",
        start: "21:00",
        end: "22:00",
        status: "予定",
      },
    ],
  },
  aoi: {
    "2024-06-12": [
      {
        id: "a1",
        title: "TOEIC 模試",
        tag: "英語",
        start: "18:30",
        end: "20:30",
        status: "予定",
      },
    ],
  },
  ren: {
    "2024-06-12": [
      {
        id: "r1",
        title: "アルゴリズム演習",
        tag: "プログラミング",
        start: "20:00",
        end: "21:00",
        status: "完了",
      },
    ],
  },
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number)
  return hour * 60 + minute
}

function getDuration(start: string, end: string) {
  return timeToMinutes(end) - timeToMinutes(start)
}

export default function CalendarPage() {
  const [selectedFriend, setSelectedFriend] = useState(FRIENDS[0].id)
  const [selectedDay, setSelectedDay] = useState(CALENDAR_DAYS[2]?.key ?? "")
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const events = useMemo(() => {
    return SCHEDULES[selectedFriend]?.[selectedDay] ?? []
  }, [selectedFriend, selectedDay])

  useEffect(() => {
    if (!events.length) {
      setSelectedEventId(null)
      return
    }

    if (!events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(events[0]?.id ?? null)
    }
  }, [events, selectedEventId])

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null

  return (
    <DashboardShell
      title="カレンダー"
      description="日別のタイムブロックと友人の予定を切り替えながら、自分の時間割を調整しましょう。"
      actionSlot={
        <button className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white shadow hover:brightness-105">
          新しい予定を追加
        </button>
      }
    >
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-2 rounded-full border border-strap/50 bg-white p-1 text-sm">
            {FRIENDS.map((friend) => (
              <button
                key={friend.id}
                type="button"
                onClick={() => setSelectedFriend(friend.id)}
                className={`rounded-full px-4 py-1.5 transition ${
                  selectedFriend === friend.id
                    ? "bg-accent text-white shadow"
                    : "text-forest/80 hover:bg-accent-soft"
                }`}
              >
                {friend.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="rounded-2xl border border-strap/40 bg-white p-6 shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-forest">2024 年 6 月</h2>
              </div>
              <div className="flex gap-2 text-xs">
                <button className="rounded-full border border-strap/50 px-3 py-1 text-forest/80 hover:bg-accent-soft">
                  前週
                </button>
                <button className="rounded-full border border-strap/50 px-3 py-1 text-forest/80 hover:bg-accent-soft">
                  次週
                </button>
              </div>
            </header>
            <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-medium text-muted">
              {CALENDAR_DAYS.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => setSelectedDay(day.key)}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border px-2.5 py-1.5 transition ${
                    selectedDay === day.key
                      ? "border-accent/40 bg-accent text-white shadow-sm"
                      : "border-strap/40 bg-surface text-forest/80 hover:bg-accent-soft"
                }`}
              >
                <span className="text-[10px] uppercase">{day.weekday}</span>
                <span className="text-sm font-semibold">{day.label}</span>
              </button>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-strap/30 bg-surface">
              <div className="relative grid grid-cols-[60px_1fr] divide-x divide-strap/30">
                <div className="flex flex-col text-xs text-muted">
                  {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => {
                    const hour = START_HOUR + index
                    return (
                      <div key={hour} className="flex h-[44px] items-start justify-end pr-2">
                        <span>{hour}:00</span>
                      </div>
                    )
                  })}
                </div>
                <div className="relative">
                  <div className="absolute inset-0">
                    {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => (
                      <div key={index} className="h-[44px] border-b border-strap/20" />
                    ))}
                  </div>
                  <div className="relative">
                    {events.map((event) => {
                      const offset =
                        (timeToMinutes(event.start) - START_HOUR * 60) *
                        (HOUR_HEIGHT / 60)
                      const height =
                        getDuration(event.start, event.end) * (HOUR_HEIGHT / 60)

                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => setSelectedEventId(event.id)}
                          className={`absolute left-3 right-3 rounded-xl border px-3 py-2 text-left text-xs font-medium shadow-sm transition hover:shadow-md ${
                            event.status === "完了"
                              ? "border-accent/40 bg-accent/15 text-forest"
                              : event.status === "未達成"
                                ? "border-strap/40 bg-strap/60 text-forest"
                                : "border-strap/40 bg-white text-forest"
                          } ${selectedEventId === event.id ? "ring-2 ring-accent" : ""}`}
                          style={{ top: offset, height }}
                        >
                          <p className="text-sm font-semibold">{event.title}</p>
                          <p className="text-[10px] uppercase text-muted">
                            {event.start} – {event.end} / {event.tag}
                          </p>
                          {event.description ? (
                            <p className="mt-1 text-[11px] text-forest/80">
                              {event.description}
                            </p>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-strap/40 bg-white p-6 shadow-sm">
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-forest">予定の編集</h3>
              </div>

              {selectedEvent ? (
                <form className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted">タイトル</label>
                    <input
                      key={selectedEvent.id}
                      defaultValue={selectedEvent.title}
                      className="w-full rounded-lg border border-strap/40 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted">開始</label>
                      <input
                        key={`start-${selectedEvent.id}`}
                        defaultValue={selectedEvent.start}
                        className="w-full rounded-lg border border-strap/40 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted">終了</label>
                      <input
                        key={`end-${selectedEvent.id}`}
                        defaultValue={selectedEvent.end}
                        className="w-full rounded-lg border border-strap/40 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted">タグ</label>
                    <input
                      key={`tag-${selectedEvent.id}`}
                      defaultValue={selectedEvent.tag}
                      className="w-full rounded-lg border border-strap/40 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted">説明</label>
                    <textarea
                      key={`desc-${selectedEvent.id}`}
                      defaultValue={selectedEvent.description ?? ""}
                      rows={3}
                      className="w-full rounded-lg border border-strap/40 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted">状態:</span>
                    <div className="flex gap-2">
                      {(["予定", "完了", "未達成"] as const).map((status) => (
                        <span
                          key={status}
                          className={`rounded-full px-2.5 py-1 ${
                            selectedEvent.status === status
                              ? "bg-accent text-white"
                              : "border border-strap/40 text-muted"
                          }`}
                        >
                          {status}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <button
                      type="button"
                      className="rounded-full bg-accent px-4 py-2 font-medium text-white shadow"
                    >
                      変更内容を保存
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-strap/50 px-4 py-2 text-forest/80 hover:bg-accent-soft"
                    >
                      削除
                    </button>
                  </div>
                </form>
              ) : (
                <div className="rounded-xl border border-dashed border-strap/40 bg-surface p-5 text-xs text-muted">
                  この日に登録された予定はありません。左のカレンダーから予定を選択すると編集できます。
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </DashboardShell>
  )
}
