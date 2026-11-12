CREATE TYPE "public"."suggestion_action" AS ENUM('order', 'skip', 'risk');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('telegram', 'manual');--> statement-breakpoint
CREATE TYPE "public"."loss_reason" AS ENUM('spoiled', 'damaged', 'unsold_promo', 'other');--> statement-breakpoint
CREATE TYPE "public"."response_reason" AS ENUM('price', 'holiday', 'weather', 'promotion', 'stock_wrong', 'other');--> statement-breakpoint
CREATE TYPE "public"."purchase_source" AS ENUM('owner_reply', 'invoice', 'manual');--> statement-breakpoint
CREATE TYPE "public"."stock_count_source" AS ENUM('owner', 'operator');--> statement-breakpoint
CREATE TYPE "public"."sales_import_source" AS ENUM('pdv_csv', 'pdv_xlsx', 'manual', 'telegram');--> statement-breakpoint
CREATE TYPE "public"."suggestion_response" AS ENUM('accepted', 'adjusted', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."sales_import_status" AS ENUM('pending', 'done', 'error');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('draft', 'sent', 'answered', 'expired');--> statement-breakpoint
CREATE TYPE "public"."calendar_event_kind" AS ENUM('holiday', 'fair', 'event');--> statement-breakpoint
CREATE TYPE "public"."item_unit" AS ENUM('kg', 'un', 'maco', 'cx');--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "calendar_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer,
	"event_date" date NOT NULL,
	"kind" "calendar_event_kind" NOT NULL,
	"label" text NOT NULL,
	"demand_factor" numeric DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"unit" "item_unit" NOT NULL,
	"shelf_life_days" integer NOT NULL,
	"avg_cost" numeric,
	"avg_price" numeric,
	"active" boolean DEFAULT true NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "items_store_name_unique" UNIQUE("store_id","name")
);
--> statement-breakpoint
CREATE TABLE "losses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "losses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"loss_date" date NOT NULL,
	"quantity" numeric NOT NULL,
	"est_value" numeric,
	"reason" "loss_reason" DEFAULT 'spoiled' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"purchase_date" date NOT NULL,
	"quantity" numeric NOT NULL,
	"unit_cost" numeric,
	"source" "purchase_source" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_daily" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sales_daily_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"sale_date" date NOT NULL,
	"quantity" numeric NOT NULL,
	"revenue" numeric,
	"import_id" integer,
	CONSTRAINT "sales_daily_store_item_date_unique" UNIQUE("store_id","item_id","sale_date")
);
--> statement-breakpoint
CREATE TABLE "sales_imports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sales_imports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer NOT NULL,
	"source" "sales_import_source" NOT NULL,
	"file_name" text,
	"period_start" date,
	"period_end" date,
	"rows_total" integer DEFAULT 0 NOT NULL,
	"rows_matched" integer DEFAULT 0 NOT NULL,
	"rows_unmatched" integer DEFAULT 0 NOT NULL,
	"status" "sales_import_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_counts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quantity" numeric NOT NULL,
	"source" "stock_count_source" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stockouts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stockouts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"reported_date" date NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"owner_name" text NOT NULL,
	"whatsapp_phone" text,
	"telegram_chat_id" bigint,
	"telegram_link_code" text,
	"channel" "channel" DEFAULT 'manual' NOT NULL,
	"pdv_system" text,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_telegram_link_code_unique" UNIQUE("telegram_link_code")
);
--> statement-breakpoint
CREATE TABLE "suggestion_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "suggestion_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"suggestion_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"action" "suggestion_action" NOT NULL,
	"suggested_qty" numeric NOT NULL,
	"forecast_qty" numeric NOT NULL,
	"estimated_stock" numeric,
	"days_of_cover" numeric,
	"reason" text,
	"response" "suggestion_response",
	"response_qty" numeric,
	"response_reason" "response_reason",
	"response_note" text,
	"responded_at" timestamp with time zone,
	CONSTRAINT "suggestion_items_suggestion_item_unique" UNIQUE("suggestion_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "suggestions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"store_id" integer NOT NULL,
	"suggestion_date" date NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "suggestion_status" DEFAULT 'draft' NOT NULL,
	"message_text" text,
	"sent_at" timestamp with time zone,
	"channel" "channel" NOT NULL,
	"telegram_message_id" bigint,
	CONSTRAINT "suggestions_store_date_unique" UNIQUE("store_id","suggestion_date")
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "losses" ADD CONSTRAINT "losses_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "losses" ADD CONSTRAINT "losses_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_daily" ADD CONSTRAINT "sales_daily_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_daily" ADD CONSTRAINT "sales_daily_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_daily" ADD CONSTRAINT "sales_daily_import_id_sales_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."sales_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_imports" ADD CONSTRAINT "sales_imports_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockouts" ADD CONSTRAINT "stockouts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stockouts" ADD CONSTRAINT "stockouts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_items" ADD CONSTRAINT "suggestion_items_suggestion_id_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_items" ADD CONSTRAINT "suggestion_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_date_idx" ON "calendar_events" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "losses_store_date_idx" ON "losses" USING btree ("store_id","loss_date");--> statement-breakpoint
CREATE INDEX "purchases_store_item_idx" ON "purchases" USING btree ("store_id","item_id","purchase_date");--> statement-breakpoint
CREATE INDEX "sales_imports_store_idx" ON "sales_imports" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_counts_store_item_idx" ON "stock_counts" USING btree ("store_id","item_id","counted_at");--> statement-breakpoint
CREATE INDEX "stockouts_store_date_idx" ON "stockouts" USING btree ("store_id","reported_date");