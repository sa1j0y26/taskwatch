"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"

import { DashboardShell } from "../_components/dashboard-shell"
import { getAvatarInitial, getAvatarTextColor, normalizeHexColor } from "@/lib/avatar"

type OccurrenceStatus = "SCHEDULED" | "DONE" | "MISSED"

type OccurrenceResponse = {
  id: string
  eventId: string
  startAt: string
  endAt: string
  status: OccurrenceStatus
  notes: string | null
  event: {
    id: string
    title: string
    tag?: string | null
    rrule?: string | null
    visibility: string | null
  } | null
}

type CalendarOccurrence = {
  id: string
  eventId: string
  title: string
  tag: string | null
  start: Date
  end: Date
  status: OccurrenceStatus
  notes: string | null
  rrule: string | null
}

type WeekDay = {
  key: string
  label: number
  weekday: string
  date: Date
}

type RepeatOption = "none" | "daily" | "weekly"

type FormState = {
  title: string
  date: string
  startTime: string
  endTime: string
  tag: string
  notes: string
  repeat: RepeatOption
}

type FriendOption = {
  id: string
  name: string
  avatarColor?: string | null
}

const START_HOUR = 6
const END_HOUR = 22
const HOUR_HEIGHT = 44

const STATUS_LABEL: Record<OccurrenceStatus, string> = {
  SCHEDULED: "予定",
  DONE: "完了",
  MISSED: "未達成",
}

const STATUS_CLASS: Record<OccurrenceStatus, string> = {
  SCHEDULED: "border-strap/40 bg-surface text-forest",
  DONE: "border-accent/40 bg-accent/15 text-forest",
  MISSED: "border-strap/40 bg-strap/60 text-forest",
}

const DEFAULT_FORM_TIMES = {
  start: "19:00",
  end: "20:00",
}

export default function CalendarPage() {
  const today = useMemo(() => startOfDay(new Date()), [])
  const todayKey = useMemo(() => formatDateKey(today), [today])

  const [friendOptions, setFriendOptions] = useState<FriendOption[]>([
    { id: "me", name: "自分", avatarColor: "#14532D" },
  ])
  const [friendSearch, setFriendSearch] = useState("")
  const [friendsError, setFriendsError] = useState<string | null>(null)
  const [isLoadingFriends, setIsLoadingFriends] = useState(true)

  const [selectedFriend, setSelectedFriend] = useState("me")
  const [focusDate, setFocusDate] = useState(() => startOfWeek(today))
  const [selectedDay, setSelectedDay] = useState(todayKey)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const [occurrencesByDay, setOccurrencesByDay] = useState<Record<string, CalendarOccurrence[]>>({})
  const [occurrenceIndex, setOccurrenceIndex] = useState<Record<string, CalendarOccurrence>>({})

  const [formState, setFormState] = useState<FormState>(() => createDefaultFormState(todayKey))
  const [originalState, setOriginalState] = useState<FormState>(() => createDefaultFormState(todayKey))
  const [isCreating, setIsCreating] = useState(false)
  const [updateScope, setUpdateScope] = useState<"single" | "series">("single")
  const [deleteScope, setDeleteScope] = useState<"single" | "series">("single")
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<"" | "create" | "update" | "delete">("")

  const weekDays = useMemo(() => buildWeekDays(focusDate), [focusDate])

  const filteredFriendOptions = useMemo(() => {
    const normalized = friendSearch.trim().toLowerCase()
    if (!normalized) {
      return friendOptions
    }
    return friendOptions.filter((option) =>
      option.name.toLowerCase().includes(normalized),
    )
  }, [friendOptions, friendSearch])

  useEffect(() => {
    let cancelled = false

    const loadFriends = async () => {
      setIsLoadingFriends(true)
      setFriendsError(null)
      try {
        const response = await fetch("/api/friendships", {
          method: "GET",
          credentials: "include",
        })
        const body = await safeParseJSON(response)
        if (!response.ok) {
          const message =
            (body && typeof body === "object" && body.error && typeof body.error.message === "string"
              ? body.error.message
              : null) ?? "友人一覧の取得に失敗しました。"
          throw new Error(message)
        }

        const friends: FriendOption[] = (body?.data?.friendships ?? []).map(
          (friendship: { friendUser: { id: string; name: string; avatarColor?: string | null } }) => ({
            id: friendship.friendUser.id,
            name: friendship.friendUser.name,
            avatarColor: friendship.friendUser.avatarColor ?? null,
          }),
        )

        if (!cancelled) {
          const merged = [
            { id: "me", name: "自分", avatarColor: "#14532D" },
            ...friends.filter((option) => option.id !== "me"),
          ]
          setFriendOptions(merged)
        }
      } catch (error) {
        console.error("[calendar.friends]", error)
        if (!cancelled) {
          setFriendsError(
            error instanceof Error ? error.message : "友人一覧の取得に失敗しました。",
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFriends(false)
        }
      }
    }

    void loadFriends()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!friendOptions.some((option) => option.id === selectedFriend)) {
      setSelectedFriend("me")
    }
  }, [friendOptions, selectedFriend])

  useEffect(() => {
    const withinWeek = weekDays.some((day) => day.key === selectedDay)
    if (!withinWeek) {
      const fallback = weekDays.find((day) => day.key === todayKey) ?? weekDays[0]
      if (fallback) {
        setSelectedDay(fallback.key)
      }
    }
  }, [weekDays, selectedDay, todayKey])

  const rangeStart = useMemo(() => startOfDay(focusDate), [focusDate])
  const rangeEnd = useMemo(() => {
    const end = new Date(rangeStart)
    end.setDate(end.getDate() + 7)
    return end
  }, [rangeStart])

  const fetchOccurrences = useCallback(
    async (friendId: string, signal?: AbortSignal) => {
      const params = new URLSearchParams({
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
      })

      if (friendId !== "me") {
        params.set("userId", friendId)
      }

      const response = await fetch(`/api/occurrences?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        signal,
      })

      if (!response.ok) {
        const body = await safeParseJSON(response)
        const message =
          (body && typeof body === "object" && body.error && typeof body.error.message === "string"
            ? body.error.message
            : null) ?? "予定の取得に失敗しました。"
        throw new Error(message)
      }

      const payload = await response.json()
      const occurrences = (payload?.data?.occurrences ?? []) as OccurrenceResponse[]
      return occurrences
    },
    [rangeStart, rangeEnd],
  )

  const applyOccurrences = useCallback(
    (occurrences: OccurrenceResponse[], preferredId?: string | null) => {
      const grouped: Record<string, CalendarOccurrence[]> = {}
      const index: Record<string, CalendarOccurrence> = {}

      for (const occurrence of occurrences) {
        const startDate = new Date(occurrence.startAt)
        const endDate = new Date(occurrence.endAt)
        const dateKey = formatDateKey(startDate)

        const item: CalendarOccurrence = {
          id: occurrence.id,
          eventId: occurrence.eventId || occurrence.event?.id || occurrence.id,
          title: occurrence.event?.title || "(無題の予定)",
          tag: occurrence.event?.tag ?? null,
          start: startDate,
          end: endDate,
          status: occurrence.status,
          notes: occurrence.notes,
          rrule: occurrence.event?.rrule ?? null,
        }

        if (!grouped[dateKey]) {
          grouped[dateKey] = []
        }
        grouped[dateKey].push(item)
        index[item.id] = item
      }

      Object.values(grouped).forEach((list) =>
        list.sort((a, b) => a.start.getTime() - b.start.getTime()),
      )

      setOccurrencesByDay(grouped)
      setOccurrenceIndex(index)
      setSelectedEventId((current) => {
        if (preferredId && index[preferredId]) {
          return preferredId
        }
        if (current && index[current]) {
          return current
        }
        const dayEvents = grouped[selectedDay] ?? []
        return dayEvents.length > 0 ? dayEvents[0].id : null
      })
    },
    [selectedDay],
  )

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setIsLoading(true)
    setLoadError(null)

    fetchOccurrences(selectedFriend, controller.signal)
      .then((occurrences) => {
        if (!cancelled) {
          applyOccurrences(occurrences)
        }
      })
      .catch((error) => {
        if (!cancelled && error.name !== "AbortError") {
          console.error("[calendar.fetch]", error)
          setLoadError(error.message)
          setOccurrencesByDay({})
          setOccurrenceIndex({})
          setSelectedEventId(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [fetchOccurrences, applyOccurrences, selectedFriend])

  const dayOccurrences = occurrencesByDay[selectedDay] ?? []
  const selectedOccurrence = selectedEventId ? occurrenceIndex[selectedEventId] ?? null : null
  const isRecurring = Boolean(selectedOccurrence?.rrule)

  const isCreatePending = isPending && pendingAction === "create"
  const isUpdatePending = isPending && pendingAction === "update"
  const isDeletePending = isPending && pendingAction === "delete"

  const headerMonthLabel = useMemo(() => {
    const firstDay = weekDays[0]?.date
    if (!firstDay) return ""
    return `${firstDay.getFullYear()} 年 ${firstDay.getMonth() + 1} 月`
  }, [weekDays])

  useEffect(() => {
    if (isCreating) {
      return
    }

    if (selectedOccurrence) {
      const nextState: FormState = {
        title: selectedOccurrence.title,
        date: formatDateKey(selectedOccurrence.start),
        startTime: toTimeText(selectedOccurrence.start),
        endTime: toTimeText(selectedOccurrence.end),
        tag: selectedOccurrence.tag ?? "",
        notes: selectedOccurrence.notes ?? "",
        repeat: parseRepeatOption(selectedOccurrence.rrule),
      }
      setFormState(nextState)
      setOriginalState(nextState)
      setUpdateScope("single")
      setDeleteScope("single")
      setFormError(null)
      setFormSuccess(null)
    } else {
      const nextState = createDefaultFormState(selectedDay)
      setFormState(nextState)
      setOriginalState(nextState)
      setUpdateScope("single")
      setDeleteScope("single")
    }
  }, [isCreating, selectedOccurrence, selectedDay])

  const handleSelectFriend = (friendId: string) => {
    setSelectedFriend(friendId)
    setIsCreating(false)
    setSelectedEventId(null)
    const nextState = createDefaultFormState(selectedDay)
    setFormState(nextState)
    setOriginalState(nextState)
    setUpdateScope("single")
    setDeleteScope("single")
    setFormError(null)
    setFormSuccess(null)
  }

  const handleSelectDay = (dayKey: string) => {
    setSelectedDay(dayKey)
    if (isCreating) {
      setFormState((prev) => ({ ...prev, date: dayKey }))
      setOriginalState((prev) => ({ ...prev, date: dayKey }))
    }
    setFormSuccess(null)
    setFormError(null)
  }

  const handleShiftWeek = (offset: -1 | 1) => {
    setIsCreating(false)
    setFormSuccess(null)
    setFormError(null)
    setFocusDate((current) => {
      const next = new Date(current)
      next.setDate(next.getDate() + offset * 7)
      return startOfWeek(next)
    })
  }

  const handleStartCreate = () => {
    if (selectedFriend !== "me") return
    setIsCreating(true)
    setSelectedEventId(null)
    const nextState = createDefaultFormState(selectedDay)
    setFormState(nextState)
    setOriginalState(nextState)
    setFormError(null)
    setFormSuccess(null)
    setUpdateScope("single")
    setDeleteScope("single")
  }

  const handleFormChange = (field: keyof FormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }))
  }

  const handleCreateEvent = () => {
    if (selectedFriend !== "me" || !isCreating) return

    const errors: string[] = []
    const trimmedTitle = formState.title.trim()

    if (!trimmedTitle) {
      errors.push("タイトルを入力してください。")
    }

    if (!formState.date) {
      errors.push("日付を選択してください。")
    }

    const startDate = formState.date ? combineDateTime(formState.date, formState.startTime) : null
    const endDate = formState.date ? combineDateTime(formState.date, formState.endTime) : null

    if (!startDate || !endDate) {
      errors.push("開始・終了時刻の形式が正しくありません。")
    } else if (endDate <= startDate) {
      errors.push("終了時刻は開始時刻より後にしてください。")
    }

    if (errors.length > 0) {
      setFormError(errors[0])
      setFormSuccess(null)
      return
    }

    const durationMinutes = Math.round((endDate!.getTime() - startDate!.getTime()) / (1000 * 60))
    const trimmedTag = formState.tag.trim()
    const trimmedNotes = formState.notes.trim()
    const rruleString = buildRRule(formState.repeat, startDate!)

    const payload = {
      title: trimmedTitle,
      tag: trimmedTag.length > 0 ? trimmedTag : undefined,
      durationMinutes,
      firstOccurrence: {
        startAt: startDate!.toISOString(),
        endAt: endDate!.toISOString(),
        notes: trimmedNotes.length > 0 ? trimmedNotes : undefined,
      },
      ...(rruleString ? { rrule: rruleString } : {}),
    }

    setFormError(null)
    setFormSuccess(null)
    setPendingAction("create")

    startTransition(async () => {
      try {
        const response = await fetch("/api/events", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        })

        const body = await safeParseJSON(response)

        if (!response.ok) {
          const errorMessage =
            (body && typeof body === "object" && body.error && typeof body.error.message === "string"
              ? body.error.message
              : null) ?? "予定の作成に失敗しました。"
          throw new Error(errorMessage)
        }

        const createdOccurrenceId =
          body?.data?.event?.occurrences &&
          Array.isArray(body.data.event.occurrences) &&
          body.data.event.occurrences.length > 0
            ? body.data.event.occurrences[0].id
            : null

        const occurrences = await fetchOccurrences(selectedFriend)
        applyOccurrences(occurrences, createdOccurrenceId)

        if (createdOccurrenceId) {
          const createdOccurrence = occurrences.find((item) => item.id === createdOccurrenceId)
          if (createdOccurrence) {
            const createdDayKey = formatDateKey(new Date(createdOccurrence.startAt))
            setSelectedDay(createdDayKey)
          }
        }

        setIsCreating(false)
        setFormSuccess("予定を登録しました。")
        const nextState = createDefaultFormState(selectedDay)
        setFormState(nextState)
        setOriginalState(nextState)
      } catch (error) {
        console.error("[calendar.create]", error)
        setFormError(error instanceof Error ? error.message : "予定の作成に失敗しました。")
        setFormSuccess(null)
      } finally {
        setPendingAction("")
      }
    })
  }

  const handleSaveChanges = () => {
    if (!selectedOccurrence || isCreating) return

    const isSeriesUpdate = isRecurring && updateScope === "series"
    const trimmedTitle = formState.title.trim()
    const trimmedTag = formState.tag.trim()
    const trimmedNotes = formState.notes.trim()

    if (isSeriesUpdate) {
      const originalDate = formatDateKey(selectedOccurrence.start)
      const originalStart = toTimeText(selectedOccurrence.start)
      const originalEnd = toTimeText(selectedOccurrence.end)

      if (
        formState.date !== originalDate ||
        formState.startTime !== originalStart ||
        formState.endTime !== originalEnd
      ) {
        setFormError("シリーズ全体の日時変更は未対応です。個別に更新してください。")
        setFormSuccess(null)
        return
      }

      const eventUpdates: Record<string, unknown> = {}
      if (trimmedTitle !== selectedOccurrence.title) {
        eventUpdates.title = trimmedTitle
      }
      const originalTag = selectedOccurrence.tag ?? ""
      if (trimmedTag !== originalTag) {
        eventUpdates.tag = trimmedTag.length > 0 ? trimmedTag : null
      }

      if (Object.keys(eventUpdates).length === 0) {
        setFormError("変更箇所がありません。")
        setFormSuccess(null)
        return
      }

      setPendingAction("update")
      startTransition(async () => {
        try {
          const response = await fetch(`/api/events/${selectedOccurrence.eventId}`, {
            method: "PATCH",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(eventUpdates),
          })

          const body = await safeParseJSON(response)
          if (!response.ok) {
            const message =
              (body && typeof body === "object" && body.error && typeof body.error.message === "string"
                ? body.error.message
                : null) ?? "予定の更新に失敗しました。"
            throw new Error(message)
          }

        const occurrences = await fetchOccurrences(selectedFriend)
          applyOccurrences(occurrences, selectedOccurrence.id)

          const nextState: FormState = {
            ...formState,
            title: trimmedTitle,
            tag: trimmedTag,
          }
          setFormState(nextState)
          setOriginalState(nextState)
          setFormSuccess("シリーズの予定を更新しました。")
          setFormError(null)
        } catch (error) {
          console.error("[calendar.update.series]", error)
          setFormError(error instanceof Error ? error.message : "予定の更新に失敗しました。")
          setFormSuccess(null)
        } finally {
          setPendingAction("")
        }
      })

      return
    }

    const errors: string[] = []
    if (!trimmedTitle) {
      errors.push("タイトルを入力してください。")
    }
    if (!formState.date) {
      errors.push("日付を選択してください。")
    }

    const startDate = formState.date ? combineDateTime(formState.date, formState.startTime) : null
    const endDate = formState.date ? combineDateTime(formState.date, formState.endTime) : null

    if (!startDate || !endDate) {
      errors.push("開始・終了時刻の形式が正しくありません。")
    } else if (endDate <= startDate) {
      errors.push("終了時刻は開始時刻より後にしてください。")
    }

    if (errors.length > 0) {
      setFormError(errors[0])
      setFormSuccess(null)
      return
    }

    const eventUpdates: Record<string, unknown> = {}
    if (!isRecurring && trimmedTitle !== selectedOccurrence.title) {
      eventUpdates.title = trimmedTitle
    }
    if (!isRecurring) {
      const originalTag = selectedOccurrence.tag ?? ""
      if (trimmedTag !== originalTag) {
        eventUpdates.tag = trimmedTag.length > 0 ? trimmedTag : null
      }
    }

    const newDuration = Math.round((endDate!.getTime() - startDate!.getTime()) / (1000 * 60))
    const currentDuration = Math.round(
      (selectedOccurrence.end.getTime() - selectedOccurrence.start.getTime()) / (1000 * 60),
    )

    if (!isRecurring && newDuration !== currentDuration) {
      eventUpdates.durationMinutes = newDuration
    }

    const occurrenceUpdates: Record<string, unknown> = {}
    if (startDate!.toISOString() !== selectedOccurrence.start.toISOString()) {
      occurrenceUpdates.startAt = startDate!.toISOString()
    }
    if (endDate!.toISOString() !== selectedOccurrence.end.toISOString()) {
      occurrenceUpdates.endAt = endDate!.toISOString()
    }
    if (trimmedNotes !== (selectedOccurrence.notes ?? "")) {
      occurrenceUpdates.notes = trimmedNotes.length > 0 ? trimmedNotes : null
    }

    if (Object.keys(eventUpdates).length === 0 && Object.keys(occurrenceUpdates).length === 0) {
      setFormError("変更箇所がありません。")
      setFormSuccess(null)
      return
    }

    setPendingAction("update")

    startTransition(async () => {
      try {
        if (Object.keys(eventUpdates).length > 0) {
          const response = await fetch(`/api/events/${selectedOccurrence.eventId}`, {
            method: "PATCH",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(eventUpdates),
          })

          const body = await safeParseJSON(response)
          if (!response.ok) {
            const message =
              (body && typeof body === "object" && body.error && typeof body.error.message === "string"
                ? body.error.message
                : null) ?? "予定の更新に失敗しました。"
            throw new Error(message)
          }
        }

        if (Object.keys(occurrenceUpdates).length > 0) {
          const response = await fetch(`/api/occurrences/${selectedOccurrence.id}`, {
            method: "PATCH",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(occurrenceUpdates),
          })

          const body = await safeParseJSON(response)
          if (!response.ok) {
            const message =
              (body && typeof body === "object" && body.error && typeof body.error.message === "string"
                ? body.error.message
                : null) ?? "予定の更新に失敗しました。"
            throw new Error(message)
          }
        }

        const occurrences = await fetchOccurrences(selectedFriend)
        applyOccurrences(occurrences, selectedOccurrence.id)

        const nextState: FormState = {
          title: trimmedTitle,
          date: formatDateKey(startDate!),
          startTime: toTimeText(startDate!),
          endTime: toTimeText(endDate!),
          tag: trimmedTag,
          notes: trimmedNotes,
          repeat: formState.repeat,
        }
        setFormState(nextState)
        setOriginalState(nextState)
        setSelectedDay(formatDateKey(startDate!))
        setFormSuccess("予定を更新しました。")
        setFormError(null)
      } catch (error) {
        console.error("[calendar.update.single]", error)
        setFormError(error instanceof Error ? error.message : "予定の更新に失敗しました。")
        setFormSuccess(null)
      } finally {
        setPendingAction("")
      }
    })
  }

  const handleDeleteEvent = () => {
    if (!selectedOccurrence || isCreating) return

    const applySeriesDelete = isRecurring && deleteScope === "series"
    setFormError(null)
    setFormSuccess(null)
    setPendingAction("delete")

    startTransition(async () => {
      try {
        let response: Response
        if (applySeriesDelete || !isRecurring) {
          response = await fetch(`/api/events/${selectedOccurrence.eventId}`, {
            method: "DELETE",
            credentials: "include",
          })
        } else {
          response = await fetch(`/api/occurrences/${selectedOccurrence.id}`, {
            method: "DELETE",
            credentials: "include",
          })
        }

        if (!response.ok) {
          const body = await safeParseJSON(response)
          const errorMessage =
            (body && typeof body === "object" && body.error && typeof body.error.message === "string"
              ? body.error.message
              : null) ?? "予定の削除に失敗しました。"
          throw new Error(errorMessage)
        }

        const occurrences = await fetchOccurrences(selectedFriend)
        applyOccurrences(occurrences)
        setSelectedEventId(null)
        const nextState = createDefaultFormState(selectedDay)
        setFormState(nextState)
        setOriginalState(nextState)
        setFormSuccess(applySeriesDelete ? "シリーズの予定を削除しました。" : "予定を削除しました。")
      } catch (error) {
        console.error("[calendar.delete]", error)
        setFormError(error instanceof Error ? error.message : "予定の削除に失敗しました。")
        setFormSuccess(null)
      } finally {
        setPendingAction("")
      }
    })
  }

  return (
    <DashboardShell
      title="カレンダー"
      description="日別のタイムブロックと友人の予定を切り替えながら、自分の時間割を調整しましょう。"
      actionSlot={
        <button
          type="button"
          onClick={handleStartCreate}
          disabled={selectedFriend !== "me"}
          className={`rounded-full px-5 py-2 text-sm font-medium shadow transition ${
            selectedFriend === "me"
              ? "bg-accent text-white hover:brightness-105"
              : "cursor-not-allowed border border-strap/50 bg-surface text-muted"
          }`}
        >
          新しい予定を追加
        </button>
      }
    >
      <section className="space-y-6">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 text-sm">
            <label className="text-xs font-medium text-muted">フレンド検索</label>
            <input
              value={friendSearch}
              onChange={(event) => setFriendSearch(event.target.value)}
              placeholder="名前で絞り込み"
              className="w-full rounded-lg border border-strap/40 px-3 py-2"
            />
          </div>
          {friendsError ? (
            <p className="text-xs text-red-600">{friendsError}</p>
          ) : null}
          <div className="overflow-x-auto">
            <div className="flex items-center gap-2 whitespace-nowrap py-1">
              {isLoadingFriends ? (
                <span className="text-xs text-muted">読み込み中...</span>
              ) : filteredFriendOptions.length === 0 ? (
                <span className="text-xs text-muted">一致するフレンドが見つかりません。</span>
              ) : (
                filteredFriendOptions.map((friend) => (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => handleSelectFriend(friend.id)}
                    className={`rounded-full border px-4 py-1.5 text-sm transition ${
                      selectedFriend === friend.id
                        ? "border-accent/40 bg-accent text-white shadow"
                        : "border-strap/40 bg-surface text-forest/80 hover:bg-accent-soft"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <AvatarCircle name={friend.name} color={friend.avatarColor ?? null} className="h-7 w-7 text-xs" />
                      <span>{friend.name}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="rounded-2xl border border-strap/40 bg-surface p-6 shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-forest">{headerMonthLabel}</h2>
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleShiftWeek(-1)}
                  className="rounded-full border border-strap/50 px-3 py-1 text-forest/80 hover:bg-accent-soft"
                >
                  前週
                </button>
                <button
                  type="button"
                  onClick={() => handleShiftWeek(1)}
                  className="rounded-full border border-strap/50 px-3 py-1 text-forest/80 hover:bg-accent-soft"
                >
                  次週
                </button>
              </div>
            </header>
            <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-medium text-muted">
              {weekDays.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => handleSelectDay(day.key)}
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
                    {isLoading ? (
                      <div className="flex h-full items-center justify-center p-6 text-sm text-muted">
                        読み込み中...
                      </div>
                    ) : loadError ? (
                      <div className="flex h-full items-center justify-center p-6 text-sm text-muted">
                        {loadError}
                      </div>
                    ) : dayOccurrences.length === 0 ? (
                      <div className="flex h-full items-center justify-center p-6 text-sm text-muted">
                        この日の予定は登録されていません。
                      </div>
                    ) : (
                      dayOccurrences.map((item) => {
                        const offset = getMinutesFromStart(item.start) * (HOUR_HEIGHT / 60)
                        const height = Math.max(
                          (item.end.getTime() - item.start.getTime()) / (1000 * 60) * (HOUR_HEIGHT / 60),
                          32,
                        )

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSelectedEventId(item.id)
                              setIsCreating(false)
                              setFormSuccess(null)
                              setFormError(null)
                            }}
                            className={`absolute left-3 right-3 rounded-xl border px-3 py-2 text-left text-xs font-medium shadow-sm transition hover:shadow-md ${
                              STATUS_CLASS[item.status]
                            } ${selectedEventId === item.id ? "ring-2 ring-accent" : ""}`}
                            style={{ top: offset, height }}
                          >
                            <p className="text-sm font-semibold">{item.title}</p>
                            <p className="text-[10px] uppercase text-muted">
                              {toTimeText(item.start)} – {toTimeText(item.end)} / {item.tag ?? "タグ未設定"}
                            </p>
                            {item.notes ? (
                              <p className="mt-1 text-[11px] text-forest/80 line-clamp-2">{item.notes}</p>
                            ) : null}
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-strap/40 bg-surface p-6 shadow-sm">
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-forest">
                  {isCreating ? "新規予定の作成" : "予定の詳細"}
                </h3>
                {selectedFriend !== "me" ? (
                  <p className="mt-2 text-xs text-muted">
                    自分以外の予定編集は現状サポートしていません。
                  </p>
                ) : null}
              </div>

              {isCreating ? (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    handleCreateEvent()
                  }}
                >
                  <FormFields
                    formState={formState}
                    onChange={handleFormChange}
                    disabled={isCreatePending}
                    showRepeat
                  />
                  {formError ? <p className="text-xs text-red-600">{formError}</p> : null}
                  {formSuccess ? <p className="text-xs text-forest">{formSuccess}</p> : null}
                  <div className="flex flex-wrap gap-3 text-sm">
                    <button
                      type="submit"
                      disabled={isCreatePending}
                      className="rounded-full bg-accent px-4 py-2 font-medium text-white shadow disabled:opacity-60"
                    >
                      {isCreatePending ? "登録中..." : "予定を作成"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreating(false)
                        const nextState = createDefaultFormState(selectedDay)
                        setFormState(nextState)
                        setOriginalState(nextState)
                        setFormError(null)
                        setFormSuccess(null)
                      }}
                      className="rounded-full border border-strap/50 px-4 py-2 text-forest/80 hover:bg-accent-soft"
                    >
                      キャンセル
                    </button>
                  </div>
                </form>
              ) : selectedOccurrence ? (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    handleSaveChanges()
                  }}
                >
                  {isRecurring ? (
                    <div className="space-y-1 text-xs text-muted">
                      <p className="font-medium text-forest">変更対象</p>
                      <div className="flex flex-wrap gap-3">
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name="updateScope"
                            value="single"
                            checked={updateScope === "single"}
                            onChange={() => {
                              setUpdateScope("single")
                              setFormError(null)
                              setFormSuccess(null)
                            }}
                          />
                          <span>この予定のみ</span>
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name="updateScope"
                            value="series"
                            checked={updateScope === "series"}
                            onChange={() => {
                              setUpdateScope("series")
                              setFormError(null)
                              setFormSuccess(null)
                            }}
                          />
                          <span>シリーズ全体</span>
                        </label>
                      </div>
                    </div>
                  ) : null}

                  <FormFields
                    formState={formState}
                    onChange={handleFormChange}
                    disabled={isUpdatePending || isDeletePending}
                    disableTitleTag={isRecurring && updateScope === "single"}
                    disableDateTime={isRecurring && updateScope === "series"}
                    disableNotes={isRecurring && updateScope === "series"}
                  />

                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted">状態:</span>
                    <span className="rounded-full bg-accent text-white px-2.5 py-1">
                      {STATUS_LABEL[selectedOccurrence.status]}
                    </span>
                  </div>
                  {formError ? <p className="text-xs text-red-600">{formError}</p> : null}
                  {formSuccess ? <p className="text-xs text-forest">{formSuccess}</p> : null}
                  <div className="flex flex-wrap gap-3 text-sm">
                    <button
                      type="submit"
                      disabled={isUpdatePending}
                      className="rounded-full bg-accent px-4 py-2 font-medium text-white shadow disabled:opacity-60"
                    >
                      {isUpdatePending ? "保存中..." : "変更を保存"}
                    </button>
                    <div className="flex flex-col gap-2 text-xs text-muted">
                      {isRecurring ? (
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-forest">削除対象</span>
                          <div className="flex gap-3">
                            <label className="flex items-center gap-1">
                              <input
                                type="radio"
                                name="deleteScope"
                                value="single"
                                checked={deleteScope === "single"}
                                onChange={() => setDeleteScope("single")}
                              />
                              <span>この予定のみ</span>
                            </label>
                            <label className="flex items-center gap-1">
                              <input
                                type="radio"
                                name="deleteScope"
                                value="series"
                                checked={deleteScope === "series"}
                                onChange={() => setDeleteScope("series")}
                              />
                              <span>シリーズ全体</span>
                            </label>
                          </div>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleDeleteEvent}
                        disabled={isDeletePending}
                        className="rounded-full border border-red-200 bg-surface px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-60"
                      >
                        {isDeletePending ? "削除中..." : "予定を削除"}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormState(originalState)
                        setFormError(null)
                        setFormSuccess(null)
                      }}
                      disabled={isUpdatePending || isDeletePending}
                      className="rounded-full border border-strap/50 px-4 py-2 text-forest/80 hover:bg-accent-soft"
                    >
                      元に戻す
                    </button>
                  </div>
                </form>
              ) : (
                <div className="rounded-xl border border-dashed border-strap/40 bg-surface p-5 text-xs text-muted">
                  左のカレンダーから予定を選択するか、「新しい予定を追加」を押して登録を開始できます。
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </DashboardShell>
  )
}

function FormFields({
  formState,
  onChange,
  disabled,
  showRepeat = false,
  disableTitleTag = false,
  disableDateTime = false,
  disableNotes = false,
}: {
  formState: FormState
  onChange: (field: keyof FormState, value: string) => void
  disabled: boolean
  showRepeat?: boolean
  disableTitleTag?: boolean
  disableDateTime?: boolean
  disableNotes?: boolean
}) {
  return (
    <>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted">タイトル</label>
        <input
          value={formState.title}
          onChange={(event) => onChange("title", event.target.value)}
          className="w-full rounded-lg border border-strap/40 px-3 py-2 text-sm"
          placeholder="学習タスク名を入力"
          required
          disabled={disabled || disableTitleTag}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted">日付</label>
        <input
          type="date"
          value={formState.date}
          onChange={(event) => onChange("date", event.target.value)}
          className="w-full rounded-lg border border-strap/40 px-3 py-2 text-sm"
          required
          disabled={disabled || disableDateTime}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted">開始</label>
          <input
            type="time"
            value={formState.startTime}
            onChange={(event) => onChange("startTime", event.target.value)}
            className="w-full rounded-lg border border-strap/40 px-3 py-2 text-sm"
            min="06:00"
            max="22:00"
            required
            disabled={disabled || disableDateTime}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted">終了</label>
          <input
            type="time"
            value={formState.endTime}
            onChange={(event) => onChange("endTime", event.target.value)}
            className="w-full rounded-lg border border-strap/40 px-3 py-2 text-sm"
            min="06:30"
            max="23:00"
            required
            disabled={disabled || disableDateTime}
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted">タグ</label>
        <input
          value={formState.tag}
          onChange={(event) => onChange("tag", event.target.value)}
          className="w-full rounded-lg border border-strap/40 px-3 py-2 text-sm"
          placeholder="例: 数学 / 英語"
          disabled={disabled || disableTitleTag}
        />
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted">説明</label>
        <textarea
          value={formState.notes}
          onChange={(event) => onChange("notes", event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-strap/40 px-3 py-2 text-sm"
          placeholder="タスクの補足や目標を書き残しましょう"
          disabled={disabled || disableNotes}
        />
      </div>
      {showRepeat ? (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted">繰り返し</label>
          <select
            value={formState.repeat}
            onChange={(event) => onChange("repeat", event.target.value)}
            className="w-full rounded-lg border border-strap/40 px-3 py-2 text-sm"
            disabled={disabled}
          >
            <option value="none">繰り返しなし</option>
            <option value="daily">毎日</option>
            <option value="weekly">毎週 同じ曜日</option>
          </select>
        </div>
      ) : null}
    </>
  )
}

function createDefaultFormState(dateKey: string): FormState {
  return {
    title: "",
    date: dateKey,
    startTime: DEFAULT_FORM_TIMES.start,
    endTime: DEFAULT_FORM_TIMES.end,
    tag: "",
    notes: "",
    repeat: "none",
  }
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function startOfWeek(date: Date) {
  const next = startOfDay(date)
  const day = next.getDay()
  const diff = (day + 6) % 7
  next.setDate(next.getDate() - diff)
  return next
}

function formatDateKey(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function buildWeekDays(focusDate: Date): WeekDay[] {
  const start = startOfWeek(focusDate)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return {
      key: formatDateKey(day),
      label: day.getDate(),
      weekday: day.toLocaleDateString("ja-JP", { weekday: "short" }),
      date: day,
    }
  })
}

function combineDateTime(dateKey: string, time: string) {
  if (!dateKey || !time) return null
  const [hours, minutes] = time.split(":").map(Number)
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }
  const [year, month, day] = dateKey.split("-").map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day, hours, minutes, 0, 0)
}

function getMinutesFromStart(date: Date) {
  const totalMinutes = date.getHours() * 60 + date.getMinutes()
  return Math.max(totalMinutes - START_HOUR * 60, 0)
}

function toTimeText(date: Date) {
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

function buildRRule(repeat: RepeatOption, startDate: Date) {
  if (repeat === "daily") {
    return "FREQ=DAILY;INTERVAL=1"
  }
  if (repeat === "weekly") {
    const weekday = getWeekdayCode(startDate)
    return `FREQ=WEEKLY;INTERVAL=1;BYDAY=${weekday}`
  }
  return null
}

function getWeekdayCode(date: Date) {
  const codes = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const
  return codes[date.getDay()]
}

function parseRepeatOption(rrule: string | null): RepeatOption {
  if (!rrule) return "none"
  if (rrule.includes("FREQ=DAILY")) return "daily"
  if (rrule.includes("FREQ=WEEKLY")) return "weekly"
  return "none"
}

async function safeParseJSON(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function AvatarCircle({
  name,
  color,
  className = "h-7 w-7 text-xs",
}: {
  name: string
  color: string | null
  className?: string
}) {
  const background = normalizeHexColor(color, "#DCFCE7")
  const foreground = getAvatarTextColor(color, "#DCFCE7")
  return (
    <span
      className={`flex items-center justify-center rounded-full font-semibold ${className}`}
      style={{ backgroundColor: background, color: foreground }}
    >
      {getAvatarInitial(name)}
    </span>
  )
}
