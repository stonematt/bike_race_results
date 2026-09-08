CREATE TYPE "public"."club_role" AS ENUM('member', 'coach', 'admin');--> statement-breakpoint
CREATE TABLE "club_audit_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"club_id" integer NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"subject_user_id" text,
	"squad_id" integer,
	"invitation_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_invitation" (
	"id" serial PRIMARY KEY NOT NULL,
	"club_id" integer NOT NULL,
	"email_normalized" text NOT NULL,
	"role" "club_role" NOT NULL,
	"squad_id" integer,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_by_user_id" text NOT NULL,
	"accepted_at" timestamp,
	"accepted_by_user_id" text,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "club_membership" (
	"club_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" "club_role" NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "club_membership_club_id_user_id_pk" PRIMARY KEY("club_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_club_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"club_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_squad_preference" (
	"user_id" text NOT NULL,
	"club_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"squad_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_squad_preference_user_id_club_id_season_id_pk" PRIMARY KEY("user_id","club_id","season_id")
);
--> statement-breakpoint
ALTER TABLE "squad" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "squad" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "squad" ADD COLUMN "archived_by_user_id" text;--> statement-breakpoint
ALTER TABLE "club_audit_event" ADD CONSTRAINT "club_audit_event_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_audit_event" ADD CONSTRAINT "club_audit_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_audit_event" ADD CONSTRAINT "club_audit_event_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_audit_event" ADD CONSTRAINT "club_audit_event_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."squad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_audit_event" ADD CONSTRAINT "club_audit_event_invitation_id_club_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."club_invitation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_invitation" ADD CONSTRAINT "club_invitation_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_invitation" ADD CONSTRAINT "club_invitation_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."squad"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_invitation" ADD CONSTRAINT "club_invitation_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_invitation" ADD CONSTRAINT "club_invitation_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_club_preference" ADD CONSTRAINT "user_club_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_club_preference" ADD CONSTRAINT "user_club_preference_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_squad_preference" ADD CONSTRAINT "user_squad_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_squad_preference" ADD CONSTRAINT "user_squad_preference_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_squad_preference" ADD CONSTRAINT "user_squad_preference_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_squad_preference" ADD CONSTRAINT "user_squad_preference_squad_id_squad_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."squad"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_audit_event_club_created_idx" ON "club_audit_event" USING btree ("club_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "club_invitation_token_hash_key" ON "club_invitation" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "club_invitation_club_email_idx" ON "club_invitation" USING btree ("club_id","email_normalized");--> statement-breakpoint
CREATE INDEX "club_membership_active_user_idx" ON "club_membership" USING btree ("user_id","revoked_at");--> statement-breakpoint
ALTER TABLE "squad" ADD CONSTRAINT "squad_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad" ADD CONSTRAINT "squad_archived_by_user_id_user_id_fk" FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Legacy coach profiles predate request-time membership. Backfill only users the
-- adapter actually knows, and preserve any row a concurrent/manual migration
-- path already supplied. A legacy coach is never evidence of admin authority.
INSERT INTO "club_membership" ("club_id", "user_id", "role", "revoked_at", "created_at", "updated_at")
SELECT c."club_id", c."user_id", 'coach'::"club_role", NULL, now(), now()
FROM "coach" AS c
INNER JOIN "user" AS u ON u."id" = c."user_id"
ON CONFLICT ("club_id", "user_id") DO NOTHING;
