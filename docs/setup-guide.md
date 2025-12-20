# ローカル開発セットアップガイド

## 概要

- Next.js アプリはホスト上で直接 `npm` で実行。
- PostgreSQL だけ Docker コンテナで用意。
- Prisma CLI はホストから実行。

## 1. 前提条件

- Node.js 20+ / npm 10+
- Docker（PostgreSQL 用）

## 2. 依存関係のインストール

```bash
npm install
```

`.env.local` にアプリ用の環境変数を設定します。最低限 `DATABASE_URL` を定義してください。

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:65432/taskwatch?schema=public
```

## 3. PostgreSQL コンテナ

```bash
docker compose up -d db
```

- 停止: `docker compose stop db`
- 再開: `docker compose start db`
- 削除: `docker compose down --volumes`（`taskwatch_postgres_data` named volume も削除）
- デフォルト接続: `postgresql://postgres:postgres@localhost:65432/taskwatch?schema=public`

## 4. Prisma

初回セットアップ:

```bash
npx prisma migrate dev --name init
```

スキーマ変更時も `npx prisma migrate dev` を実行します。

## 5. 開発サーバー

```bash
npm run dev
```

<http://localhost:3000> にアクセスして動作を確認します。

## 6. よく使うコマンド

- Lint: `npm run lint`
- テスト: `npm test`
- ビルド: `npm run build`
- Prisma Studio: `npx prisma studio`

## 7. トラブルシューティング

### `next dev` が DB に接続できない

- PostgreSQL コンテナが起動しているか確認 (`docker ps`)
- `DATABASE_URL` が `localhost` を指しているか確認
- ファイアウォールやポート競合がないか確認

### コンテナのログを確認したい

```bash
docker logs -f taskwatch-db
```
