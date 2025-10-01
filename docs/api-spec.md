# API Specification Draft

Base URL (local dev): `http://localhost:3000/api`
Authentication: Bearer token (JWT) unless noted.
All timestamps use ISO 8601 (UTC).

## Authentication

### POST /auth/register
新規ユーザー作成。
- Request JSON:
  ```json
  {
    "email": "user@example.com",
    "password": "string",
    "name": "string",
    "timezone": "Asia/Tokyo"
  }
  ```
- Response 201:
  ```json
  {
    "token": "jwt",
    "user": {
      "id": "usr_123",
      "email": "user@example.com",
      "name": "string",
      "timezone": "Asia/Tokyo"
    }
  }
  ```

### POST /auth/login
- Request JSON: `{ "email": "user@example.com", "password": "string" }`
- Response 200: register と同様。

### GET /auth/me
認証済みユーザー情報を返却。
- Response 200: Prisma `User` に準拠したフィールド＋ `level` `xp` `streakCount`。

## Users & Friendships

### GET /users/search
名前/メールで友達候補検索。
- Query: `q` (必須), `limit` (既定 10)
- Response 200: `[{ "id": "usr_123", "name": "string", "avatar": "url" }]`

### POST /friendships
友達リクエスト送信または承認。
- Request JSON:
  ```json
  {
    "friendUserId": "usr_456",
    "action": "request" | "accept"
  }
  ```
- Response 200: `{ "status": "PENDING" | "ACCEPTED" }`

### PATCH /friendships/:id
友達状態更新（accept/block/cancel）。
- Request JSON: `{ "status": "ACCEPTED" | "BLOCKED" }`
- Response 200: 更新済み friendship。

### GET /friendships
承認・保留中の友達リスト。
- Response 200: フレンド情報を含む配列。

## Events & Scheduling

### POST /events
カレンダーテンプレート作成。
- Request JSON:
  ```json
  {
    "title": "Morning Study",
    "description": "Exam prep",
    "tag": "STUDY",
    "visibility": "FRIENDS",
    "durationMinutes": 90,
    "rrule": "FREQ=DAILY;COUNT=5",
    "exdates": ["2024-04-01T09:00:00Z"],
    "flexPolicy": "STRICT"
  }
  ```
- Response 201: 作成済み event。

### GET /events
自身または友達のイベントを取得。
- Query: `userId` (友達限定), `tag`, `visibility`
- Response 200: event 配列。

### GET /events/:id
単一イベント＋今後の occurrences。
- Response 200: event と直近 occurrences。

### PATCH /events/:id
 mutable フィールドの更新。
- Response 200: 更新済み event。

### DELETE /events/:id
イベントと将来 occurrences を削除（ソフト削除想定）。
- Response 204。

## Occurrences

### GET /occurrences
指定期間の予定ブロック取得。
- Query: `start`, `end`, `userId` (任意), `status`
- Response 200: occurrences＋親 event サマリ。

### PATCH /occurrences/:id/status
完了・未達を更新。
- Request JSON:
  ```json
  {
    "status": "DONE" | "MISSED",
    "completedAt": "2024-04-01T10:30:00Z",
    "notes": "Finished chapter 3"
  }
  ```
- Response 200: 更新済み occurrence と streak 情報（meta）。

## Timeline

### GET /timeline
本人＋友達のタイムライン投稿。
- Query: `cursor`, `limit`, `userId`
- Response 200: ページングされた投稿、投稿者情報、リアクション集計。

### POST /timeline
タイムライン投稿作成。
- Request JSON:
  ```json
  {
    "occurrenceId": "occ_123",
    "message": "Completed math session!",
    "visibility": "FRIENDS"
  }
  ```
- Response 201: 作成済み post。

### POST /timeline/:id/reactions
リアクション付与・上書き。
- Request JSON: `{ "type": "LIKE" | "BAD" }`
- Response 200: `likes`, `bads`, `viewerReaction`。

### DELETE /timeline/:id/reactions
自分のリアクションを削除。
- Response 204。

## Rankings & Stats

### GET /ranking
週間ランキングを返却。
- Query: `periodStart` (ISO, 省略時は今週)
- Response 200:
  ```json
  {
    "period": {
      "start": "2024-04-01",
      "end": "2024-04-07"
    },
    "entries": [
      {
        "userId": "usr_123",
        "name": "Yuki",
        "totalMinutes": 540,
        "completionRate": 0.86,
        "streakCount": 10,
        "rank": 1
      }
    ]
  }
  ```

### GET /stats/mypage
マイページ用集計。
- Response 200: `weeklyTotals`, `completionPerDay`, `currentLevel`, `xpToNextLevel`, `streakCount`。

## Realtime & Notifications (Draft)

- WebSocket チャンネル: `/realtime` (JWT 認証)
- サーバー発火イベント:
  - `timeline.posted` → 投稿サマリ
  - `occurrence.updated` → 状態更新スナップショット
  - `ranking.updated` → ランキングの更新差分
- 再接続時は REST で補完しつつ購読し直す。

## Error Format

```json
{
  "error": {
    "code": "EVENT_NOT_FOUND",
    "message": "Event does not exist or you do not have access.",
    "details": {}
  }
}
```

## Security Notes

- 認証ユーザーのみが変更系 API にアクセス。
- アクセス制御:
  - Events/occurrences: 所有者、もしくは可視性が許す友達のみ
  - Timeline posts: `visibility` とフレンド状態を確認
  - Rankings: 自分＋友達のみ
- ログイン・友達リクエストは簡易レート制限を推奨。
