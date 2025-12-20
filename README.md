# Taskwatch

A habit-tracking dashboard built with Next.js, Prisma, and PostgreSQL.

## Quick Start

1. **Install deps**
   ```bash
   npm install
   ```
2. **Configure env**
   ```bash
   cp env.example .env
   ```
3. **Boot the database**
   ```bash
   docker compose up -d db
   ```
4. **Apply Prisma migrations**
   ```bash
   npx prisma migrate dev
   ```
5. **Run the app**
   ```bash
   npm run dev
   ```
   Visit <http://localhost:3000>.

## Scripts

| Command            | Purpose                              |
| ------------------ | ------------------------------------ |
| `npm run dev`      | Start Next.js in dev mode            |
| `npm run lint`     | ESLint (flat config)                 |
| `npm test`         | Vitest API suite                     |
| `npm run build`    | Production build                     |
| `npx prisma studio`| Inspect/edit data via Prisma Studio  |

## Database Notes

- Compose only spins up PostgreSQL (mapped to `localhost:65432`).
- Data lives in the `taskwatch_postgres_data` named volume so it won't collide with other projects.
- Tear down everything with `docker compose down --volumes`.

## More Info

See `docs/setup-guide.md` for deeper setup details, troubleshooting, and tips.
