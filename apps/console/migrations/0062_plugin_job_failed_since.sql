ALTER TABLE "plugin_jobs" ADD COLUMN "failed_since" timestamp with time zone;--> statement-breakpoint
-- A job whose last run failed has failed since that run at least: its next failure makes it a
-- problem of its plugin, as a second failure running does from here on (ADR-0128).
UPDATE "plugin_jobs" SET "failed_since" = "last_run_at" WHERE "last_outcome" = 'failed';
