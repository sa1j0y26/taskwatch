# API Spec (Current)

Taskwatch の実装に合わせた簡易 API メモ。未実装・構想段階の内容は省いている。

## 共通仕様

- Base URL (local): `http://localhost:3000/api`
- 認証: Auth.js のセッション Cookie。Route Handler では `auth()` を利用。
- レスポンス形式: 成功時 `{ "data": ... }` / 失敗時 `{ "error": { "code", "message", "details?" } }`
- 日付/時刻: ISO 8601 (UTC)
- ID: UUID (v7)

## 認証

- `/api/auth/[...nextauth]` (Auth.js 標準)
- `GET /api/auth/session`
- `POST /api/auth/signout`

## プロフィール

- `GET /api/me/profile`
- `PATCH /api/me/profile` (`name`, `avatarColor`)

## ユーザー検索 & フレンド

- `GET /api/users/search?q=...`
- `GET /api/friendships`
- `POST /api/friendships` `{ friendUserId }`
- `DELETE /api/friendships/:id`
- `GET /api/friendships/requests?includeHistory=true&direction=received|sent`
- `PATCH /api/friendships/requests/:id` `{ action: accept | reject | cancel }`

## イベント

- `GET /api/events?userId&withOccurrences&rangeStart&rangeEnd`
- `POST /api/events` (`title`, `durationMinutes`, `visibility?`, `tag?`, `description?`, `rrule?`, `exdates?`, `firstOccurrence?`)
- `GET /api/events/:id?withOccurrences&rangeStart&rangeEnd`
- `PATCH /api/events/:id` (`title`, `description`, `tag`, `visibility`, `durationMinutes`, `rrule`, `exdates`)
- `DELETE /api/events/:id`

## Occurrence

- `GET /api/occurrences?start&end&status&userId`
- `GET /api/occurrences/pending?before&limit&cursorId`
- `PATCH /api/occurrences/:id` (`startAt`, `endAt`, `notes`)
- `DELETE /api/occurrences/:id`
- `PATCH /api/occurrences/:id/status` (`status: DONE | MISSED`)

## タイムライン

- `GET /api/timeline?limit&cursor`
- `POST /api/timeline` `{ message }`
- `PATCH /api/timeline/:id` `{ message }`
- `DELETE /api/timeline/:id`
- `PATCH /api/timeline/:id/memo` `{ memo }`
- `POST /api/timeline/:id/reactions` `{ type: LIKE | BAD }`
- `DELETE /api/timeline/:id/reactions`

## ランキング & マイページ集計

- `GET /api/rankings?metric=totalMinutes|completionRate|streak&period=weekly|monthly`
- `GET /api/stats/mypage?weekStart=YYYY-MM-DD`

## リアルタイム (SSE)

- `GET /api/realtime`
- EventSource で接続。`event: message` の `data` に `{ type, payload }` を送信。
- 15 秒ごとに keep-alive のコメントを送信。
- イベント種別:
  - `timeline.posted` `{ post }`
  - `timeline.updated` `{ post }`
  - `timeline.deleted` `{ postId }`
  - `timeline.reacted` `{ postId, reactions: { likes, bads } }`
  - `occurrence.status_changed` `{ occurrenceId, status, timelineKind }`
  - `ready` `{ payload: null }`
