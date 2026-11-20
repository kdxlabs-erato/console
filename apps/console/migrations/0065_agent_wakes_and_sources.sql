CREATE TABLE "agent_wakes" (
	"person_id" uuid NOT NULL,
	"key" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"text" text NOT NULL,
	"agent" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "agent_wakes_person_id_key_pk" PRIMARY KEY("person_id","key")
);
--> statement-breakpoint
ALTER TABLE "agent_runners" ADD COLUMN "sources" jsonb;--> statement-breakpoint
ALTER TABLE "agent_wakes" ADD CONSTRAINT "agent_wakes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_wakes_at_idx" ON "agent_wakes" USING btree ("at");