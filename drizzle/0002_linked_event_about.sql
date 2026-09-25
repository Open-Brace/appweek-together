CREATE TABLE "linked_event_about" (
	"url" text PRIMARY KEY NOT NULL,
	"source_url" text NOT NULL,
	"source_name" text NOT NULL,
	"text" text,
	"status" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone
);
