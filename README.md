# Taskwatch

## ローカル開発環境の起動

Docker Compose を利用して Next.js と PostgreSQL を立ち上げます。

### 前提条件

- Docker Desktop など Docker が動作する環境
- `docker compose` コマンド（v2 系）

### 手順

1. 必要であれば `.env` をプロジェクト直下に作成し、ホスト側ポートを変えたい場合は `WEB_PORT` を指定（デフォルトは 3000）。
2. コンテナ起動:
   ```bash
   docker compose up -d --build
   ```
3. Prisma マイグレーション（初回のみ任意の名前で）:
   ```bash
   docker compose exec web npx prisma migrate dev --name init
   ```
4. ブラウザでアプリを確認: <http://localhost:${WEB_PORT:-3000}>

### よく使うコマンド

- ログ確認: `docker compose logs -f web`
- Prisma Studio: `docker compose exec web npx prisma studio`
- コンテナ停止: `docker compose down`
- データベース初期化: `docker compose down --volumes`

詳細なセットアップ手順は `docs/setup-guide.md` を参照してください。
