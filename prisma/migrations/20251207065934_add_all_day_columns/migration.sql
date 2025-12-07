-- AlterTable
ALTER TABLE "events" ADD COLUMN     "is_all_day" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "occurrences" ADD COLUMN     "is_all_day" BOOLEAN NOT NULL DEFAULT false;
