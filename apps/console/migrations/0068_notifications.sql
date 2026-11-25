CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"event_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"followed" boolean DEFAULT false NOT NULL,
	"woken" boolean DEFAULT false NOT NULL,
	"project_id" uuid,
	"task_id" uuid,
	"decision_id" uuid,
	"about_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_follows" (
	"task_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"state" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "task_follows_pkey" PRIMARY KEY("task_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "notifications" jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_about_id_people_id_fk" FOREIGN KEY ("about_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_follows" ADD CONSTRAINT "task_follows_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_follows" ADD CONSTRAINT "task_follows_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_person_event_key" ON "notifications" USING btree ("person_id","event_id");--> statement-breakpoint
CREATE INDEX "notifications_person_idx" ON "notifications" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_event_idx" ON "notifications" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "task_follows_person_idx" ON "task_follows" USING btree ("person_id");