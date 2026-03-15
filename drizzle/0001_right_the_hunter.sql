CREATE TABLE IF NOT EXISTS "app_user" (
	"id" text PRIMARY KEY DEFAULT 'user_' || gen_random_uuid()::text NOT NULL,
	"auth_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_auth_user_id_unique" UNIQUE("auth_user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_user" ADD CONSTRAINT "app_user_auth_user_id_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
