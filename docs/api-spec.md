# API Specification Draft

Taskwatch API の詳細設計ドラフト。Next.js の Route Handler / Server Action を前提とし、REST + WebSocket で提供する。

## 1. 共通仕様

- **Base URL (local)**: `http://localhost:3000/api`
- **認証方式**: Auth.js (NextAuth) のセッションクッキー / JWT。Route Handler では `auth()` でセッションを検証。
- **レスポンス形式**: すべて JSON。成功時は `data` ルート、失敗時は `error` オブジェクトを返す。
- **タイムゾーン**: 受信/返却ともに ISO 8601（UTC）。クライアント側でローカルタイムゾーンに変換。
- **ID**: すべて UUID v7 形式。PostgreSQL 18 の `uuidv7()` を利用。
- **Pagination**: カーソル方式（`cursor`, `limit`）。`limit` のデフォルトは 20。
- **ステータスコード**: 成功 2xx、クライアントエラー 4xx、サーバーエラー 5xx。422 をバリデーションエラーに利用。

### 1.1 エラーフォーマット

```json
{
  "error": {
    "code": "EVENT_NOT_FOUND",
    "message": "Event does not exist or you do not have access.",
    "details": {}
  }
}
```

`code` はアプリ固有エラーコード。`details` にフィールドエラーなどを格納。

## 2. リソース定義

### 2.1 User

```json
{
  "id": "018f5b78-8c84-7b43-bf53-5b624eca0f0f",
  "email": "user@example.com",
  "name": "Yuki",
  "avatar": "https://...",
  "xp": 1200,
  "level": 5,
  "streakCount": 8,
  "createdAt": "2024-03-01T10:00:00Z",
  "updatedAt": "2024-03-20T07:00:00Z"
}
```

### 2.2 Event

```json
{
  "id": "018f5b78-944a-7a1f-b4a6-3f55b5c2f8d2",
  "userId": "018f5b78-8c84-7b43-bf53-5b624eca0f0f",
  "title": "Morning Study",
  "description": "Exam prep",
  "visibility": "PRIVATE",
  "durationMinutes": 90,
  "rrule": "FREQ=DAILY;COUNT=5",
  "exdates": ["2024-04-01T00:00:00Z"],
  "createdAt": "2024-03-30T10:00:00Z",
  "updatedAt": "2024-04-01T07:00:00Z"
}
```

### 2.3 Occurrence

```json
{
  "id": "018f5b78-98e0-74f8-beb4-5a40ee0fe5a9",
  "eventId": "018f5b78-944a-7a1f-b4a6-3f55b5c2f8d2",
  "userId": "018f5b78-8c84-7b43-bf53-5b624eca0f0f",
  "startAt": "2024-04-01T09:00:00Z",
  "endAt": "2024-04-01T10:30:00Z",
  "status": "DONE",
  "completedAt": "2024-04-01T10:20:00Z",
  "notes": "Chapter 3 completed",
  "createdAt": "2024-03-31T00:00:00Z",
  "updatedAt": "2024-04-01T10:20:00Z"
}
```

### 2.4 TimelinePost & Reaction

```json
{
  "id": "018f5b78-9d25-7143-8075-8f6a4ab9b343",
  "userId": "018f5b78-8c84-7b43-bf53-5b624eca0f0f",
  "occurrenceId": "018f5b78-98e0-74f8-beb4-5a40ee0fe5a9",
  "message": "Completed math session!",
  "visibility": "PRIVATE",
  "createdAt": "2024-04-01T10:21:00Z",
  "updatedAt": "2024-04-01T10:21:00Z",
  "reactions": {
    "likes": 3,
    "bads": 0,
    "viewerReaction": "LIKE"
  }
}
```

### 2.5 RankingEntry

```json
{
  "userId": "018f5b78-8c84-7b43-bf53-5b624eca0f0f",
  "name": "Yuki",
  "avatar": "https://...",
  "totalMinutes": 540,
  "pointSum": 125,
  "completionRate": 0.86,
  "streakCount": 10,
  "rank": 1
}
```

## 3. エンドポイント詳細

### 3.1 Authentication (Auth.js)

- Auth.js (NextAuth) の Google OAuth プロバイダを利用し、`/api/auth/[...nextauth]` がサインイン/アウト/セッション確認を提供する。
- クライアント側は `signIn('google')` / `signOut()` を利用。成功時は NextAuth のセッションクッキー（`session.strategy = "jwt"`）がセットされる。
- Route Handler や Server Action では `auth()` でセッションを取得し、`session?.user.id` を元に認可処理を行う。
- 独自の `POST /auth/register` エンドポイントは持たず、OAuth によるアカウント作成をそのまま採用する。

#### GET /api/auth/session (Auth.js)
- **概要**: NextAuth のセッション情報取得。
- **成功 (200)**: Auth.js の標準レスポンス。

#### POST /api/auth/signout (Auth.js)
- **概要**: セッション破棄。
- **成功 (302)**: 既定でリダイレクト。API 経由で使う場合は `redirect: false` を指定。

### 3.2 Users & Friendships

#### GET /users/search
- **用途**: 友達検索。
- **query**: `q` (必須), `limit` (任意, max 20)。
- **認証**: 必須。
- **成功 (200)**: `{ "data": { "results": [ { "id", "name", "avatar" } ] } }`

#### POST /friendships
- **用途**: フレンド関係の確定（相互承認前提）。
- **body**: `{ "friendUserId": "018f5b78-a1b3-7d86-b154-1d5f6d874a63" }`
- **処理**: 自分の ID と相手の ID を昇順に並べて `friendships` レコードを 1 件作成。既に存在する場合は 409。
- **成功 (201)**: `{ "data": { "friendship": { "id": "018f5b78-a54d-7f56-8e0a-4c97da1c0fcb", "userAId": "018f5b78-8c84-7b43-bf53-5b624eca0f0f", "userBId": "018f5b78-a1b3-7d86-b154-1d5f6d874a63" } } }`
- **備考**: フレンド申請/承認フローはクライアント側で制御し、承認完了時に本エンドポイントを呼び出す。

#### DELETE /friendships/:id
- **用途**: 友達解除。
- **成功 (204)**: ボディなし。

#### GET /friendships
- **用途**: 確定済みの友達一覧。
- **備考**: `friendUser` は常に自分以外のユーザーを返す。
- **成功 (200)**:
  ```json
  {
    "data": {
      "friendships": [
        {
          "id": "018f5b78-a54d-7f56-8e0a-4c97da1c0fcb",
          "friendUser": { "id": "018f5b78-a1b3-7d86-b154-1d5f6d874a63", "name": "Aoi", "avatar": null }
        }
      ]
    }
  }
  ```

### 3.3 Events

#### POST /events
- **用途**: イベントテンプレート作成。
- **body**:
  - `title` (必須, 1〜120)
  - `description` (任意, max 1000)
  - `visibility` (`PRIVATE`/`PUBLIC`)
  - `durationMinutes` (必須, 5〜1440)
  - `rrule` (任意, RFC5545)
  - `exdates` (任意, ISO配列)
- **副作用**: `rrule` 指定時 はサーバー側で今後数週間分の occurrences を生成（レンジは後述）。
- **成功 (201)**: `{ "data": { "event": { ...Event } } }`

#### GET /events
- **用途**: イベント一覧取得。
- **query**:
  - `userId` (任意, フレンドのみアクセス可)
  - `visibility`
  - `withOccurrences` (bool, 最新の occurrences を含めるか)
- **備考**: カレンダー UI でタイムブロックを描画するため、`startAt` / `endAt` を中心とした occurrences を取得できるようにする。
- **成功 (200)**: イベント配列 + オプションで occurrences。

#### GET /events/:id
- **制約**: 所有者 or 可視性が許す場合のみ。
- **成功 (200)**: `{ "data": { "event": { ... }, "upcomingOccurrences": [ ... ] } }`

#### PATCH /events/:id
- **用途**: mutable フィールド更新。`rrule` 変更時は今後の occurrences を再生成し、過去は保持。
- **成功 (200)**: 更新済み event。

#### DELETE /events/:id
- **処理**: イベントと未来の occurrences をソフト削除。過去 occurrences は統計のため残す。
- **成功 (204)**: ボディなし。

### 3.4 Occurrences

#### GET /occurrences
- **query**:
  - `start`/`end` (必須): 最大 31 日間。
  - `userId` (任意): フレンド取得用。
  - `status` (任意): `SCHEDULED`/`DONE`/`MISSED`。
- **成功 (200)**:
  ```json
  {
    "data": {
      "occurrences": [
        {
          ...Occurrence,
          "event": { "id": "018f5b78-944a-7a1f-b4a6-3f55b5c2f8d2", "title": "Morning Study" }
        }
      ]
    }
  }
  ```

#### PATCH /occurrences/:id/status
- **用途**: 完了/未達成の更新。
- **body**:
  - `status`: `DONE` | `MISSED`（`SCHEDULED` に戻す場合は `PUT /occurrences/:id/reset` など別エンドポイントにする案も検討）
  - `completedAt` (任意, DONE の場合必須)
  - `notes` (任意)
- **処理**:
  - 状態が `DONE` になった時、内部的に固定ポイント `+25` を加算。
  - `MISSED` の場合 `-10`。結果はランキング計算で使用。
  - streak 更新ロジックを適用し、現在のストリーク/レベル情報を返却。
- **成功 (200)**:
  ```json
  {
    "data": {
      "occurrence": { ...Occurrence },
      "meta": {
        "streakCount": 11,
        "weeklyPointDelta": 25
      }
    }
  }
  ```
- **エラー**: `FORBIDDEN` (他人の occurrence), `INVALID_STATUS_TRANSITION` (422)。

#### POST /occurrences/:id/reset (オプション)
- **用途**: 誤操作で DONE/MISSED を取り消し、`SCHEDULED` に戻す。（実装するなら）

### 3.5 Timeline & Reactions

#### GET /timeline
- **query**: `cursor`, `limit` (最大 50), `userId` (任意)
- **フィルタ**: 可視性チェック。`PUBLIC` の投稿のみ友達外にも表示。
- **成功 (200)**:
  ```json
  {
    "data": {
      "items": [
        {
          ...TimelinePost,
          "author": { "id": "018f5b78-8c84-7b43-bf53-5b624eca0f0f", "name": "Yuki", "avatar": null },
          "occurrence": { "id": "018f5b78-98e0-74f8-beb4-5a40ee0fe5a9", "status": "DONE", "startAt": "..." }
        }
      ],
      "nextCursor": "..."
    }
  }
  ```

#### POST /timeline
- **body**:
  - `occurrenceId` (任意): 紐付けたい場合に指定。`null` ならメッセージだけの投稿。
  - `message` (必須, 1〜280)
  - `visibility`: `PRIVATE`/`PUBLIC`
- **成功 (201)**: 作成済み post。

#### POST /timeline/:id/reactions
- **body**: `{ "type": "LIKE" | "BAD" }`
- **処理**: 同一ユーザーが再度同じ反応を送った場合は削除扱い、別種なら切り替え。
- **成功 (200)**: `likes`/`bads`/`viewerReaction` を返却。

#### DELETE /timeline/:id/reactions
- **用途**: 自分のリアクション解除。
- **成功 (204)**。

### 3.6 Rankings & Stats

#### GET /ranking
- **query**:
  - `periodStart` (任意): 週の開始日。未指定時は現在の週 (月曜始まり想定)。
  - `limit` (任意): 上位 N 人。未指定は全員。
- **成功 (200)**:
  ```json
  {
    "data": {
      "period": {
        "start": "2024-04-01",
        "end": "2024-04-07"
      },
      "entries": [ ...RankingEntry ]
    }
  }
  ```
- **計算**: Occurrence の `status` と予定時間に応じてポイント・完遂率を集計。固定ポイントは DONE:+25, MISSED:-10。

#### GET /stats/mypage
- **用途**: マイページ表示用集計。
- **内容**:
  - `weeklyTotals`: 日付ごとの合計時間・完了数
  - `completionPerDay`: 曜日別の遂行率
  - `currentLevel`, `xp`, `xpToNextLevel`
  - `streakCount`
  - `nextMilestones`: 次のレベル/ストリーク達成条件
- **成功 (200)**: `{ "data": { ... } }`

## 4. Realtime API (WebSocket)

- **エンドポイント**: `ws://localhost:3000/realtime`
- **認証**: 接続時に `Authorization` ヘッダー or クエリ `token`。
- **イベント**:
  - `timeline.posted`
    ```json
    {
      "type": "timeline.posted",
      "payload": { "post": { ...TimelinePost }, "author": { ... } }
    }
    ```
  - `occurrence.updated`
    ```json
    {
      "type": "occurrence.updated",
      "payload": { "occurrence": { ...Occurrence }, "meta": { "streakCount": 10 } }
    }
    ```
  - `ranking.updated`
    ```json
    {
      "type": "ranking.updated",
      "payload": { "entries": [ ...RankingEntry ] }
    }
    ```
- **再接続**: クライアントは last event time を保持し、再接続後に REST で差分取得。

## 5. エラーコード一覧（暫定）

| code | 説明 | HTTP |
| --- | --- | --- |
| `INVALID_CREDENTIALS` | メール/パスワード不一致 | 401 |
| `USER_ALREADY_EXISTS` | 登録済み | 409 |
| `EVENT_NOT_FOUND` | イベントが存在しない | 404 |
| `FORBIDDEN` | アクセス権なし | 403 |
| `INVALID_STATUS_TRANSITION` | 状態遷移エラー | 422 |
| `FRIENDSHIP_ALREADY_EXISTS` | 既にフレンド関係が存在 | 409 |
| `FRIENDSHIP_NOT_FOUND` | フレンド関係が存在しない | 404 |
| `TIMELINE_NOT_FOUND` | 投稿が存在しない | 404 |

## 6. 未決事項 / TODO

1. **Occurrence リセット API**: 誤タップ時に `SCHEDULED` へ戻せるフローが必要か検討。
2. **可視性ルール詳細**: `PUBLIC` をどこまで許可するか（フレンド以外に公開する UI があるか）。
3. **ポイント計算の拡張**: 将来的にイベントごとにポイント倍率を持たせるか。
4. **通知エンドポイント**: 今後 push 通知を導入するかどうか。
5. **Rate Limit**: ログイン/友達招待に対する制限値の決定。

---

この仕様をベースに Next.js の Route Handler 用スキーマ（Zod 等）を整備し、開発と同時に更新していく。EOF
