CREATE TYPE "public"."bot_session_mode" AS ENUM('ajuste', 'nota');--> statement-breakpoint
CREATE TABLE "bot_sessions" (
	"chat_id" bigint PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"mode" "bot_session_mode" NOT NULL,
	"suggestion_id" integer NOT NULL,
	"suggestion_item_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inbox_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer,
	"telegram_chat_id" bigint NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "order_multiple" numeric;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "suggestion_item_id" integer;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "auto_send" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "suggestion_items" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "suggestion_items" ADD COLUMN "weak_estimate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_suggestion_id_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_sessions" ADD CONSTRAINT "bot_sessions_suggestion_item_id_suggestion_items_id_fk" FOREIGN KEY ("suggestion_item_id") REFERENCES "public"."suggestion_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_messages_open_idx" ON "inbox_messages" USING btree ("resolved_at","created_at");--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_suggestion_item_id_suggestion_items_id_fk" FOREIGN KEY ("suggestion_item_id") REFERENCES "public"."suggestion_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_suggestion_item_id_unique" UNIQUE("suggestion_item_id");