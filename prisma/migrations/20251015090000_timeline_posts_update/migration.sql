-- Add timeline post kind enum and memo metadata
CREATE TYPE "TimelinePostKind" AS ENUM ('AUTO_DONE', 'AUTO_MISSED', 'MANUAL_NOTE');

ALTER TABLE "timeline_posts"
  ADD COLUMN "kind" "TimelinePostKind" NOT NULL DEFAULT 'AUTO_DONE',
  ADD COLUMN "memo" TEXT,
  ADD COLUMN "memo_updated_at" TIMESTAMP(3);

ALTER TABLE "timeline_posts"
  ADD CONSTRAINT "timeline_posts_occurrence_id_key" UNIQUE ("occurrence_id");
