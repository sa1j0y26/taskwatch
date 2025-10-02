# Docker 開発環境セットアップガイド

## 1. 概要

- Next.js フロントエンド (`web` コンテナ)
- PostgreSQL 18 (`db` コンテナ)
- Prisma CLI は `web` コンテナ内から実行

`docker-compose.yml` と `Dockerfile.dev` を利用して、開発環境をコンテナで再現します。

## 2. 前提条件

- Docker Desktop もしくは同等の Docker 環境
- `docker compose` コマンド（v2 系）

## 3. 初回セットアップ

1. `.env`（または `.env.local`）を必要に応じて作成し、アプリで利用する環境変数を定義。
   - `DATABASE_URL` は `docker-compose.yml` で `postgresql://postgres:postgres@db:5432/taskwatch?schema=public` を設定済み。
   - `WEB_PORT` を `.env` で指定するとホスト側ポートを変更可能（未設定時は 3000）。
2. コンテナを起動:
   ```bash
   docker compose up -d --build
   ```
3. 依存関係と Prisma クライアントが整っているか確認 (エントリーポイントで自動実行されますが、念のため):
   ```bash
   docker compose exec web npm install
   docker compose exec web npx prisma generate
   ```
4. マイグレーション適用:
   ```bash
   docker compose exec web npx prisma migrate dev --name init
   ```
   - PostgreSQL 18 では `uuidv7()` が標準提供されるため追加拡張は不要です。
5. Next.js 開発サーバーへアクセス: <http://localhost:${WEB_PORT:-3000}>


## 4. よく使うコマンド

- ログ確認: `docker compose logs -f web`
- Prisma Studio: `docker compose exec web npx prisma studio`
- コンテナ停止: `docker compose down`
- データベースを初期化したい場合:
  ```bash
  docker compose down --volumes
  docker compose up -d
  ```

## 5. Tips / メモ

- `web` コンテナはリポジトリをボリュームマウントしているため、ホストで編集すると即座に反映。
- `node_modules` と `.next` はコンテナ側の専用ボリュームに保持し、ホスト OS とのビルド差異を避けています。
- Prisma のモデル変更時は `docker compose exec web npx prisma migrate dev` を都度実行。
- PostgreSQL へホストから接続する場合: `postgresql://postgres:postgres@localhost:5432/taskwatch`
