// Modelo de dados do MVP — docs/PLANO-MVP.md, seção 3.
// Desvios do plano (tipo de id, defaults, constraints extras) estão em docs/DECISIONS.md.
import {
  ACOES_SUGESTAO,
  CANAIS,
  MOTIVOS_PERDA,
  MOTIVOS_RESPOSTA,
  ORIGENS_COMPRA,
  ORIGENS_CONTAGEM,
  ORIGENS_IMPORTACAO,
  RESPOSTAS_SUGESTAO,
  STATUS_IMPORTACAO,
  STATUS_SUGESTAO,
  TIPOS_EVENTO,
  UNIDADES,
} from '@giro/shared';
import type { MapeamentoColunas } from '@giro/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

// ---------- enums ----------

export const canalEnum = pgEnum('channel', CANAIS);
export const unidadeEnum = pgEnum('item_unit', UNIDADES);
export const origemImportacaoEnum = pgEnum('sales_import_source', ORIGENS_IMPORTACAO);
export const statusImportacaoEnum = pgEnum('sales_import_status', STATUS_IMPORTACAO);
export const origemContagemEnum = pgEnum('stock_count_source', ORIGENS_CONTAGEM);
export const origemCompraEnum = pgEnum('purchase_source', ORIGENS_COMPRA);
export const statusSugestaoEnum = pgEnum('suggestion_status', STATUS_SUGESTAO);
export const acaoSugestaoEnum = pgEnum('suggestion_action', ACOES_SUGESTAO);
export const respostaSugestaoEnum = pgEnum('suggestion_response', RESPOSTAS_SUGESTAO);
export const motivoRespostaEnum = pgEnum('response_reason', MOTIVOS_RESPOSTA);
export const motivoPerdaEnum = pgEnum('loss_reason', MOTIVOS_PERDA);
export const tipoEventoEnum = pgEnum('calendar_event_kind', TIPOS_EVENTO);

// ---------- helpers ----------

const id = () => integer('id').primaryKey().generatedAlwaysAsIdentity();
const quantidade = (nome: string) => numeric(nome, { mode: 'number' });
const criadoEm = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

// ---------- tabelas ----------

export const stores = pgTable('stores', {
  id: id(),
  name: text('name').notNull(),
  ownerName: text('owner_name').notNull(),
  whatsappPhone: text('whatsapp_phone'),
  telegramChatId: bigint('telegram_chat_id', { mode: 'number' }),
  telegramLinkCode: text('telegram_link_code').unique(),
  channel: canalEnum('channel').notNull().default('manual'),
  pdvSystem: text('pdv_system'),
  timezone: text('timezone').notNull().default('America/Sao_Paulo'),
  // fase 1: nomes das colunas no arquivo do PDV, quando a detecção automática não acerta
  columnMapping: jsonb('column_mapping').$type<MapeamentoColunas>(),
  // fase 1: descrições normalizadas do PDV que não são hortifruti (mercearia, sacola…)
  ignoredDescriptions: text('ignored_descriptions')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  // fase 2: o job diário só envia sozinho quando ligado (semana de baseline do piloto fica desligada)
  autoSend: boolean('auto_send').notNull().default(false),
  createdAt: criadoEm(),
});

export const items = pgTable(
  'items',
  {
    id: id(),
    storeId: integer('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    unit: unidadeEnum('unit').notNull(),
    shelfLifeDays: integer('shelf_life_days').notNull(),
    avgCost: quantidade('avg_cost'),
    avgPrice: quantidade('avg_price'),
    active: boolean('active').notNull().default(true),
    // fase 2: múltiplo de arredondamento do pedido; null = padrão da unidade (un: 5, demais: 1)
    orderMultiple: quantidade('order_multiple'),
    // nomes como aparecem no PDV ("TOMATE KG", "Tomate Italiano")
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (t) => [unique('items_store_name_unique').on(t.storeId, t.name)],
);

export const salesImports = pgTable(
  'sales_imports',
  {
    id: id(),
    storeId: integer('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    source: origemImportacaoEnum('source').notNull(),
    fileName: text('file_name'),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    rowsTotal: integer('rows_total').notNull().default(0),
    rowsMatched: integer('rows_matched').notNull().default(0),
    rowsUnmatched: integer('rows_unmatched').notNull().default(0),
    status: statusImportacaoEnum('status').notNull().default('pending'),
    error: text('error'),
    // fase 1: arquivo original, para reprocessar depois de mapear colunas ou descrições
    fileContent: bytea('file_content'),
    createdAt: criadoEm(),
  },
  (t) => [index('sales_imports_store_idx').on(t.storeId, t.createdAt)],
);

// fase 1: vendas do arquivo somadas por dia e descrição, casadas (ou não) com um item.
// sales_daily é derivada daqui; as linhas sem item formam a fila "mapear".
export const salesImportRows = pgTable(
  'sales_import_rows',
  {
    id: id(),
    importId: integer('import_id')
      .notNull()
      .references(() => salesImports.id, { onDelete: 'cascade' }),
    storeId: integer('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    saleDate: date('sale_date').notNull(),
    description: text('description').notNull(),
    normalizedDescription: text('normalized_description').notNull(),
    productCode: text('product_code'),
    quantity: quantidade('quantity').notNull(),
    revenue: quantidade('revenue'),
    lineCount: integer('line_count').notNull(),
    itemId: integer('item_id').references(() => items.id),
    ignored: boolean('ignored').notNull().default(false),
  },
  (t) => [
    unique('sales_import_rows_import_date_desc_unique').on(
      t.importId,
      t.saleDate,
      t.normalizedDescription,
    ),
    index('sales_import_rows_store_desc_idx').on(t.storeId, t.normalizedDescription),
  ],
);

export const salesDaily = pgTable(
  'sales_daily',
  {
    id: id(),
    storeId: integer('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    saleDate: date('sale_date').notNull(),
    quantity: quantidade('quantity').notNull(),
    revenue: quantidade('revenue'),
    importId: integer('import_id').references(() => salesImports.id, { onDelete: 'set null' }),
  },
  (t) => [unique('sales_daily_store_item_date_unique').on(t.storeId, t.itemId, t.saleDate)],
);

// contagem informada pelo dono na resposta ou pelo operador; opcional
export const stockCounts = pgTable(
  'stock_counts',
  {
    id: id(),
    storeId: integer('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    countedAt: timestamp('counted_at', { withTimezone: true }).notNull().defaultNow(),
    quantity: quantidade('quantity').notNull(),
    source: origemContagemEnum('source').notNull(),
  },
  (t) => [index('stock_counts_store_item_idx').on(t.storeId, t.itemId, t.countedAt)],
);

export const purchases = pgTable(
  'purchases',
  {
    id: id(),
    storeId: integer('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    purchaseDate: date('purchase_date').notNull(),
    quantity: quantidade('quantity').notNull(),
    unitCost: quantidade('unit_cost'),
    source: origemCompraEnum('source').notNull(),
    // fase 3: compra que veio da resposta do dono a um item da sugestão (uma por item)
    suggestionItemId: integer('suggestion_item_id')
      .unique()
      .references(() => suggestionItems.id, { onDelete: 'cascade' }),
  },
  (t) => [index('purchases_store_item_idx').on(t.storeId, t.itemId, t.purchaseDate)],
);

export const suggestions = pgTable(
  'suggestions',
  {
    id: id(),
    storeId: integer('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    suggestionDate: date('suggestion_date').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    status: statusSugestaoEnum('status').notNull().default('draft'),
    messageText: text('message_text'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    channel: canalEnum('channel').notNull(),
    telegramMessageId: bigint('telegram_message_id', { mode: 'number' }),
  },
  // idempotência da geração por (loja, data) — seção 8, fase 2
  (t) => [unique('suggestions_store_date_unique').on(t.storeId, t.suggestionDate)],
);

export const suggestionItems = pgTable(
  'suggestion_items',
  {
    id: id(),
    suggestionId: integer('suggestion_id')
      .notNull()
      .references(() => suggestions.id, { onDelete: 'cascade' }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    action: acaoSugestaoEnum('action').notNull(),
    // fase 2: número do pedido na mensagem ("1. Tomate — 40 kg"); null para não repor/encalhe
    position: integer('position'),
    // fase 2: estoque estimado sem contagem há mais de 7 dias
    weakEstimate: boolean('weak_estimate').notNull().default(false),
    suggestedQty: quantidade('suggested_qty').notNull(),
    forecastQty: quantidade('forecast_qty').notNull(),
    estimatedStock: quantidade('estimated_stock'),
    daysOfCover: quantidade('days_of_cover'),
    reason: text('reason'),
    // resposta do dono
    response: respostaSugestaoEnum('response'),
    responseQty: quantidade('response_qty'),
    responseReason: motivoRespostaEnum('response_reason'),
    responseNote: text('response_note'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [unique('suggestion_items_suggestion_item_unique').on(t.suggestionId, t.itemId)],
);

export const losses = pgTable(
  'losses',
  {
    id: id(),
    storeId: integer('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    lossDate: date('loss_date').notNull(),
    quantity: quantidade('quantity').notNull(),
    estValue: quantidade('est_value'),
    reason: motivoPerdaEnum('reason').notNull().default('spoiled'),
    note: text('note'),
    createdAt: criadoEm(),
  },
  (t) => [index('losses_store_date_idx').on(t.storeId, t.lossDate)],
);

export const stockouts = pgTable(
  'stockouts',
  {
    id: id(),
    storeId: integer('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    reportedDate: date('reported_date').notNull(),
    note: text('note'),
  },
  (t) => [index('stockouts_store_date_idx').on(t.storeId, t.reportedDate)],
);

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: id(),
    // null = evento que vale para todas as lojas (ex.: feriado nacional)
    storeId: integer('store_id').references(() => stores.id, { onDelete: 'cascade' }),
    eventDate: date('event_date').notNull(),
    kind: tipoEventoEnum('kind').notNull(),
    label: text('label').notNull(),
    demandFactor: numeric('demand_factor', { mode: 'number' }).notNull().default(1.0),
  },
  (t) => [index('calendar_events_date_idx').on(t.eventDate)],
);

// fase 3: estado da conversa com o dono (modo ajuste, nota de motivo "outro")
export const modoSessaoEnum = pgEnum('bot_session_mode', ['ajuste', 'nota']);

export const botSessions = pgTable('bot_sessions', {
  chatId: bigint('chat_id', { mode: 'number' }).primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  mode: modoSessaoEnum('mode').notNull(),
  suggestionId: integer('suggestion_id')
    .notNull()
    .references(() => suggestions.id, { onDelete: 'cascade' }),
  suggestionItemId: integer('suggestion_item_id').references(() => suggestionItems.id, {
    onDelete: 'cascade',
  }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// fase 3: mensagens do bot que ele não entendeu, para o operador agir (seção 5.2)
export const inboxMessages = pgTable(
  'inbox_messages',
  {
    id: id(),
    // null quando o chat ainda não está vinculado a uma loja
    storeId: integer('store_id').references(() => stores.id, { onDelete: 'cascade' }),
    telegramChatId: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
    text: text('text').notNull(),
    createdAt: criadoEm(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('inbox_messages_open_idx').on(t.resolvedAt, t.createdAt)],
);
