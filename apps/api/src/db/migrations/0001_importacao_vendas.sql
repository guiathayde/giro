CREATE TABLE "sales_import_rows" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sales_import_rows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"import_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"sale_date" date NOT NULL,
	"description" text NOT NULL,
	"normalized_description" text NOT NULL,
	"product_code" text,
	"quantity" numeric NOT NULL,
	"revenue" numeric,
	"line_count" integer NOT NULL,
	"item_id" integer,
	"ignored" boolean DEFAULT false NOT NULL,
	CONSTRAINT "sales_import_rows_import_date_desc_unique" UNIQUE("import_id","sale_date","normalized_description")
);
--> statement-breakpoint
ALTER TABLE "sales_imports" ADD COLUMN "file_content" "bytea";--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "column_mapping" jsonb;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "ignored_descriptions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_import_rows" ADD CONSTRAINT "sales_import_rows_import_id_sales_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."sales_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_import_rows" ADD CONSTRAINT "sales_import_rows_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_import_rows" ADD CONSTRAINT "sales_import_rows_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_import_rows_store_desc_idx" ON "sales_import_rows" USING btree ("store_id","normalized_description");