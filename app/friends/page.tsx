"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"

import { DashboardShell } from "../_components/dashboard-shell"
import { getAvatarInitial, getAvatarTextColor, normalizeHexColor } from "@/lib/avatar"

type FriendUser = {
  id: string
  name: string
  email: string
  avatar: string | null
  avatarColor: string | null
}

type Friendship = {
  id: string
  friendUser: FriendUser
  createdAt: string
}

type ReceivedRequest = {
  id: string
  status: string
  createdAt: string
  respondedAt: string | null
  requester: FriendUser
}

type SentRequest = {
  id: string
  status: string
  createdAt: string
  respondedAt: string | null
  receiver: FriendUser
}

type SearchResult = FriendUser

type Status = "idle" | "loading" | "success" | "error"

export default function FriendsPage() {
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [receivedRequests, setReceivedRequests] = useState<ReceivedRequest[]>([])
  const [sentRequests, setSentRequests] = useState<SentRequest[]>([])

  const [isLoadingFriends, setIsLoadingFriends] = useState(true)
  const [friendsError, setFriendsError] = useState<string | null>(null)

  const [isLoadingRequests, setIsLoadingRequests] = useState(true)
  const [requestsError, setRequestsError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchStatus, setSearchStatus] = useState<Status>("idle")
  const [searchError, setSearchError] = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<"" | "add" | "remove" | "accept" | "reject" | "cancel">("")
  const isMutating = isPending && pendingAction !== ""

  const existingFriendIds = useMemo(
    () => new Set(friendships.map((friendship) => friendship.friendUser.id)),
    [friendships],
  )

  const pendingSentIds = useMemo(
    () => new Set(sentRequests.filter((request) => request.status === "PENDING").map((request) => request.receiver.id)),
    [sentRequests],
  )

  const pendingReceivedIds = useMemo(
    () =>
      new Set(
        receivedRequests
          .filter((request) => request.status === "PENDING")
          .map((request) => request.requester.id),
      ),
    [receivedRequests],
  )

  const loadFriendships = useCallback(async () => {
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
      setFriendships(body?.data?.friendships ?? [])
    } catch (error) {
      console.error("[friends.load]", error)
      setFriendsError(error instanceof Error ? error.message : "友人一覧の取得に失敗しました。")
    } finally {
      setIsLoadingFriends(false)
    }
  }, [])

  const loadRequests = useCallback(async () => {
    setIsLoadingRequests(true)
    setRequestsError(null)
    try {
      const response = await fetch("/api/friendships/requests", {
        method: "GET",
        credentials: "include",
      })
      const body = await safeParseJSON(response)
      if (!response.ok) {
        const message =
          (body && typeof body === "object" && body.error && typeof body.error.message === "string"
            ? body.error.message
            : null) ?? "フレンド申請の取得に失敗しました。"
        throw new Error(message)
      }
      const requests = body?.data?.requests ?? { received: [], sent: [] }
      setReceivedRequests(requests.received ?? [])
      setSentRequests(requests.sent ?? [])
    } catch (error) {
      console.error("[friends.requests]", error)
      setRequestsError(error instanceof Error ? error.message : "フレンド申請の取得に失敗しました。")
    } finally {
      setIsLoadingRequests(false)
    }
  }, [])

  useEffect(() => {
    void loadFriendships()
    void loadRequests()
  }, [loadFriendships, loadRequests])

  const handleSearch = async () => {
    const query = searchQuery.trim()
    if (!query) {
      setSearchError("検索キーワードを入力してください。")
      setSearchResults([])
      setSearchStatus("idle")
      return
    }

    setSearchStatus("loading")
    setSearchError(null)
    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
        method: "GET",
        credentials: "include",
      })
      const body = await safeParseJSON(response)
      if (!response.ok) {
        const message =
          (body && typeof body === "object" && body.error && typeof body.error.message === "string"
            ? body.error.message
            : null) ?? "ユーザー検索に失敗しました。"
        throw new Error(message)
      }

      const results = (body?.data?.results ?? []) as SearchResult[]
      setSearchResults(results)
      setSearchStatus("success")
    } catch (error) {
      console.error("[friends.search]", error)
      setSearchStatus("error")
      setSearchError(error instanceof Error ? error.message : "ユーザー検索に失敗しました。")
      setSearchResults([])
    }
  }

  const handleAddFriend = (user: SearchResult) => {
    setPendingAction("add")
    startTransition(async () => {
      try {
        const response = await fetch("/api/friendships", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ friendUserId: user.id }),
        })
        const body = await safeParseJSON(response)
        if (!response.ok) {
          const message =
            (body && typeof body === "object" && body.error && typeof body.error.message === "string"
              ? body.error.message
              : null) ?? "フレンド申請の送信に失敗しました。"
          throw new Error(message)
        }

        const friendship = body?.data?.friendship as Friendship | undefined
        const friendRequest = body?.data?.friendRequest as SentRequest | undefined

        if (friendship) {
          setFriendships((prev) => [friendship, ...prev])
        }

        if (friendRequest) {
          setSentRequests((prev) => [friendRequest, ...prev])
        }

        setSearchResults((prev) => prev.filter((item) => item.id !== user.id))
        setSearchStatus("success")
      } catch (error) {
        console.error("[friends.add]", error)
        setSearchError(error instanceof Error ? error.message : "フレンド申請の送信に失敗しました。")
        setSearchStatus("error")
      } finally {
        setPendingAction("")
      }
    })
  }

  const handleRemoveFriend = (friendshipId: string) => {
    setPendingAction("remove")
    startTransition(async () => {
      try {
        const response = await fetch(`/api/friendships/${friendshipId}`, {
          method: "DELETE",
          credentials: "include",
        })

        if (!response.ok) {
          const body = await safeParseJSON(response)
          const message =
            (body && typeof body === "object" && body.error && typeof body.error.message === "string"
              ? body.error.message
              : null) ?? "友人削除に失敗しました。"
          throw new Error(message)
        }

        setFriendships((prev) => prev.filter((item) => item.id !== friendshipId))
      } catch (error) {
        console.error("[friends.remove]", error)
        setFriendsError(error instanceof Error ? error.message : "友人削除に失敗しました。")
      } finally {
        setPendingAction("")
      }
    })
  }

  const handleAcceptRequest = (requestId: string) => {
    setPendingAction("accept")
    startTransition(async () => {
      try {
        const response = await fetch(`/api/friendships/requests/${requestId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "accept" }),
        })
        const body = await safeParseJSON(response)
        if (!response.ok) {
          const message =
            (body && typeof body === "object" && body.error && typeof body.error.message === "string"
              ? body.error.message
              : null) ?? "フレンド申請の承認に失敗しました。"
          throw new Error(message)
        }

        const updatedRequest = body?.data?.request as ReceivedRequest | undefined
        const friendship = body?.data?.friendship as Friendship | undefined

        if (friendship) {
          setFriendships((prev) => [friendship, ...prev])
        }

        if (updatedRequest) {
          setReceivedRequests((prev) => prev.filter((item) => item.id !== updatedRequest.id))
        }
      } catch (error) {
        console.error("[friends.accept]", error)
        setRequestsError(error instanceof Error ? error.message : "フレンド申請の承認に失敗しました。")
      } finally {
        setPendingAction("")
      }
    })
  }

  const handleRejectRequest = (requestId: string) => {
    setPendingAction("reject")
    startTransition(async () => {
      try {
        const response = await fetch(`/api/friendships/requests/${requestId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "reject" }),
        })
        const body = await safeParseJSON(response)
        if (!response.ok) {
          const message =
            (body && typeof body === "object" && body.error && typeof body.error.message === "string"
              ? body.error.message
              : null) ?? "フレンド申請の拒否に失敗しました。"
          throw new Error(message)
        }

        const updatedRequest = body?.data?.request as ReceivedRequest | undefined
        if (updatedRequest) {
          setReceivedRequests((prev) => prev.filter((item) => item.id !== updatedRequest.id))
        }
      } catch (error) {
        console.error("[friends.reject]", error)
        setRequestsError(error instanceof Error ? error.message : "フレンド申請の拒否に失敗しました。")
      } finally {
        setPendingAction("")
      }
    })
  }

  const handleCancelRequest = (requestId: string) => {
    setPendingAction("cancel")
    startTransition(async () => {
      try {
        const response = await fetch(`/api/friendships/requests/${requestId}`, {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "cancel" }),
        })
        const body = await safeParseJSON(response)
        if (!response.ok) {
          const message =
            (body && typeof body === "object" && body.error && typeof body.error.message === "string"
              ? body.error.message
              : null) ?? "フレンド申請の取り消しに失敗しました。"
          throw new Error(message)
        }

        const updatedRequest = body?.data?.request as SentRequest | undefined
        if (updatedRequest) {
          setSentRequests((prev) => prev.filter((item) => item.id !== updatedRequest.id))
        }
      } catch (error) {
        console.error("[friends.cancel]", error)
        setRequestsError(error instanceof Error ? error.message : "フレンド申請の取り消しに失敗しました。")
      } finally {
        setPendingAction("")
      }
    })
  }

  return (
    <DashboardShell
      title="フレンド"
      description="友人の検索・申請・管理ができます。"
    >
      <div className="grid gap-8 xl:grid-cols-[2fr_3fr]">
        <section className="space-y-5 rounded-2xl border border-strap/40 bg-surface p-6 shadow-sm">
          <header className="space-y-2">
            <h2 className="text-lg font-semibold text-forest">友だちを検索</h2>
            <p className="text-xs text-muted">名前またはメールアドレスで検索して申請を送りましょう。</p>
          </header>
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void handleSearch()
                  }
                }}
                placeholder="友人の名前やメールアドレスを入力"
                className="flex-1 rounded-lg border border-strap/40 px-4 py-2 text-sm"
                disabled={isMutating}
              />
              <button
                type="button"
                className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-60"
                onClick={() => void handleSearch()}
                disabled={searchStatus === "loading" || isMutating}
              >
                {searchStatus === "loading" ? "検索中..." : "検索"}
              </button>
            </div>
            {searchError ? <p className="text-xs text-red-600">{searchError}</p> : null}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-forest">検索結果</h3>
            {searchStatus === "idle" ? (
              <p className="text-xs text-muted">検索すると候補が表示されます。</p>
            ) : searchStatus === "loading" ? (
              <p className="text-xs text-muted">検索中...</p>
            ) : searchResults.length === 0 ? (
              <p className="text-xs text-muted">該当するユーザーが見つかりませんでした。</p>
            ) : (
              <ul className="space-y-3">
                {searchResults.map((user) => {
                  const alreadyFriend = existingFriendIds.has(user.id)
                  const pendingSent = pendingSentIds.has(user.id)
                  const pendingIncoming = pendingReceivedIds.has(user.id)
                  const disabled = alreadyFriend || pendingSent || pendingIncoming || isMutating
                  return (
                    <li
                      key={user.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-strap/40 bg-surface px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <AvatarCircle name={user.name} color={user.avatarColor} />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-forest">{user.name}</span>
                          <span className="text-xs text-muted">{user.email}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white shadow disabled:opacity-60"
                        onClick={() => handleAddFriend(user)}
                        disabled={disabled}
                      >
                        {alreadyFriend
                          ? "フレンド"
                          : pendingSent
                            ? "申請中"
                            : pendingIncoming
                              ? "承認待ち"
                              : "申請"}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        <div className="space-y-8">
          <section className="space-y-4 rounded-2xl border border-strap/40 bg-surface p-6 shadow-sm">
            <header className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-forest">届いている申請</h2>
                <p className="text-xs text-muted">承認または拒否を選択できます。</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-strap/40 px-4 py-2 text-xs text-forest/80 hover:bg-accent-soft"
                onClick={() => void loadRequests()}
                disabled={isMutating || isLoadingRequests}
              >
                再読み込み
              </button>
            </header>

            {isLoadingRequests ? (
              <p className="text-sm text-muted">読み込み中...</p>
            ) : requestsError ? (
              <p className="text-sm text-red-600">{requestsError}</p>
            ) : receivedRequests.filter((request) => request.status === "PENDING").length === 0 ? (
              <p className="text-sm text-muted">承認待ちの申請はありません。</p>
            ) : (
              <ul className="space-y-3">
                {receivedRequests
                  .filter((request) => request.status === "PENDING")
                  .map((request) => (
                    <li
                      key={request.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-strap/40 bg-surface px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <AvatarCircle name={request.requester.name} color={request.requester.avatarColor} />
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-forest">
                            {request.requester.name}
                          </span>
                          <span className="text-xs text-muted">{request.requester.email}</span>
                          <span className="text-[10px] text-muted">
                            申請日: {formatDate(new Date(request.createdAt))}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleAcceptRequest(request.id)}
                          disabled={isMutating}
                          className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white shadow disabled:opacity-60"
                        >
                          承認
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectRequest(request.id)}
                          disabled={isMutating}
                          className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 disabled:opacity-60"
                        >
                          拒否
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-strap/40 bg-surface p-6 shadow-sm">
            <header className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-forest">送信した申請</h2>
                <p className="text-xs text-muted">承認待ちの申請を確認できます。</p>
              </div>
            </header>

            {isLoadingRequests ? (
              <p className="text-sm text-muted">読み込み中...</p>
            ) : requestsError ? (
              <p className="text-sm text-red-600">{requestsError}</p>
            ) : sentRequests.filter((request) => request.status === "PENDING").length === 0 ? (
              <p className="text-sm text-muted">送信中の申請はありません。</p>
            ) : (
              <ul className="space-y-3">
                {sentRequests
                  .filter((request) => request.status === "PENDING")
                  .map((request) => (
                    <li
                      key={request.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-strap/40 bg-surface px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <AvatarCircle name={request.receiver.name} color={request.receiver.avatarColor} />
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-forest">
                            {request.receiver.name}
                          </span>
                          <span className="text-xs text-muted">{request.receiver.email}</span>
                          <span className="text-[10px] text-muted">
                            申請日: {formatDate(new Date(request.createdAt))}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancelRequest(request.id)}
                        disabled={isMutating}
                        className="rounded-full border border-strap/50 px-4 py-2 text-xs font-semibold text-forest/80 hover:bg-accent-soft disabled:opacity-60"
                      >
                        取消
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <section className="space-y-4 rounded-2xl border border-strap/40 bg-surface p-6 shadow-sm">
            <header className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-forest">フレンド一覧</h2>
                <p className="text-xs text-muted">追加済みの友人を管理します。</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-strap/40 px-4 py-2 text-xs text-forest/80 hover:bg-accent-soft"
                onClick={() => {
                  void loadFriendships()
                  void loadRequests()
                }}
                disabled={isMutating || isLoadingFriends}
              >
                再読み込み
              </button>
            </header>

            {isLoadingFriends ? (
              <p className="text-sm text-muted">読み込み中...</p>
            ) : friendsError ? (
              <p className="text-sm text-red-600">{friendsError}</p>
            ) : friendships.length === 0 ? (
              <p className="text-sm text-muted">友人がまだ登録されていません。</p>
            ) : (
              <ul className="space-y-3">
                {friendships.map((friendship) => (
                  <li
                    key={friendship.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-strap/40 bg-surface px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <AvatarCircle name={friendship.friendUser.name} color={friendship.friendUser.avatarColor} />
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-forest">
                          {friendship.friendUser.name}
                        </span>
                        <span className="text-xs text-muted">{friendship.friendUser.email}</span>
                        <span className="text-[10px] text-muted">
                          追加日: {formatDate(new Date(friendship.createdAt))}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFriend(friendship.id)}
                      disabled={isMutating}
                      className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 disabled:opacity-60"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </DashboardShell>
  )
}

async function safeParseJSON(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function formatDate(date: Date) {
  return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date
    .getDate()
    .toString()
    .padStart(2, "0")}`
}

function AvatarCircle({
  name,
  color,
  className = "h-9 w-9 text-sm",
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
