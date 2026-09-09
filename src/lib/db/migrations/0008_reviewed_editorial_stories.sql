CREATE TYPE "public"."story_state" AS ENUM('draft', 'reviewed', 'published', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."story_surface" AS ENUM('season-dispatch', 'race-review');--> statement-breakpoint
CREATE TABLE "editorial_story" (
	"id" serial PRIMARY KEY NOT NULL,
	"club_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"checkpoint_ordinal" integer NOT NULL,
	"event_id" integer NOT NULL,
	"surface" "story_surface" NOT NULL,
	"template" text DEFAULT 'club-starts-at-event' NOT NULL,
	"source_raw_fetch_id" bigint NOT NULL,
	"source_content_hash" text NOT NULL,
	"source_list_id" text NOT NULL,
	"source_hidden" boolean NOT NULL,
	"evidence_fingerprint" text NOT NULL,
	"state" "story_state" DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp,
	"reviewed_revision" integer,
	"approved_count" integer,
	"published_by_user_id" text,
	"published_at" timestamp,
	"superseded_by_story_id" integer,
	CONSTRAINT "editorial_story_template_check" CHECK ("editorial_story"."template" = 'club-starts-at-event'),
	CONSTRAINT "editorial_story_checkpoint_check" CHECK ("editorial_story"."checkpoint_ordinal" >= 0),
	CONSTRAINT "editorial_story_revision_check" CHECK ("editorial_story"."revision" > 0),
	CONSTRAINT "editorial_story_count_check" CHECK ("editorial_story"."approved_count" is null or "editorial_story"."approved_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "club_audit_event" ADD COLUMN "story_id" integer;--> statement-breakpoint
ALTER TABLE "editorial_story" ADD CONSTRAINT "editorial_story_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_story" ADD CONSTRAINT "editorial_story_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_story" ADD CONSTRAINT "editorial_story_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_story" ADD CONSTRAINT "editorial_story_source_raw_fetch_id_raw_fetch_id_fk" FOREIGN KEY ("source_raw_fetch_id") REFERENCES "public"."raw_fetch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_story" ADD CONSTRAINT "editorial_story_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_story" ADD CONSTRAINT "editorial_story_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_story" ADD CONSTRAINT "editorial_story_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_story" ADD CONSTRAINT "editorial_story_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_story" ADD CONSTRAINT "editorial_story_superseded_by_story_id_editorial_story_id_fk" FOREIGN KEY ("superseded_by_story_id") REFERENCES "public"."editorial_story"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "editorial_story_dispatch_published_idx" ON "editorial_story" USING btree ("club_id","season_id","checkpoint_ordinal") WHERE "editorial_story"."state" = 'published' and "editorial_story"."surface" = 'season-dispatch';--> statement-breakpoint
CREATE UNIQUE INDEX "editorial_story_race_published_idx" ON "editorial_story" USING btree ("club_id","season_id","checkpoint_ordinal","event_id") WHERE "editorial_story"."state" = 'published' and "editorial_story"."surface" = 'race-review';--> statement-breakpoint
ALTER TABLE "club_audit_event" ADD CONSTRAINT "club_audit_event_story_id_editorial_story_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."editorial_story"("id") ON DELETE no action ON UPDATE no action;