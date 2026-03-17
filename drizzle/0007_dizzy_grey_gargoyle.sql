CREATE TABLE IF NOT EXISTS "flashcard" (
	"id" text PRIMARY KEY DEFAULT 'fc_' || gen_random_uuid()::text NOT NULL,
	"fact_id" text NOT NULL,
	"question" text NOT NULL,
	"canonical_answer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "flashcard" ADD CONSTRAINT "flashcard_fact_id_fact_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."fact"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
