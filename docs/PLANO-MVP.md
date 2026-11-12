# Giro — Plano de implementação do MVP

> Documento para ser usado como contexto no Claude Code. Copie para a raiz do repositório como `docs/PLANO-MVP.md` e referencie-o no `CLAUDE.md`.

## 0. O que é este MVP (e o que não é)

**Objetivo:** validar, com 1 a 3 hortifrutis de São Carlos, a hipótese central do Giro: _uma sugestão diária de pedido por item, entregue por mensagem no celular, é seguida pelo dono e reduz a perda de FLV_.

O MVP é a ferramenta interna que permite rodar o piloto "manual" sem planilha artesanal: recebe as vendas da loja, calcula a sugestão, envia a mensagem, registra o que o dono respondeu e mede a perda. O dono interage por um **bot do Telegram** (gratuito, com botões e upload de arquivo) — e, como fallback para quem não usa Telegram, pelo WhatsApp com o operador copiando e colando. O painel web é usado pela equipe (operador).

**Dentro do escopo**

- Importar vendas por **arquivo exportado do PDV** (CSV/XLSX) ou planilha preenchida à mão.
- Catálogo de itens por loja com unidade (kg/un/maço) e vida útil em dias.
- Motor de sugestão **heurístico e explicável** (sem ML): o que pedir, quanto, o que não repor, o que está em risco.
- Bot do Telegram: envia a sugestão diária com botões (aceitar tudo / ajustar), recebe o arquivo do PDV, recebe descarte e falta por comando simples.
- Fallback WhatsApp: botão "copiar mensagem" + `wa.me` no painel; operador registra a resposta à mão.
- Registro da resposta do dono: aceitou / ajustou (quanto) / ignorou, e motivo.
- Registro de descarte (perda) por item e painel de perda em R$ e kg.
- Painel web do operador: lojas, itens, importações, sugestões do dia, respostas, perdas, métricas do piloto.

**Fora do escopo (não construir agora)**

- Integração automática com PDVs/NFC-e. Modelo de ML. App mobile para o dono. API do WhatsApp (paga). Multiusuário/permissões. Pagamento. Marketplace de fornecedores. Precificação dinâmica.

## 1. Hipóteses e métricas que o MVP precisa medir

| Hipótese                     | Métrica                                                                         | Sinal mínimo para continuar                                       |
| ---------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| O dono lê e segue a sugestão | % de dias com resposta; % de itens aceitos sem ajuste; % ajustados; % ignorados | ≥ 60% de dias respondidos; ≥ 50% dos itens aceitos ou ajustados   |
| A sugestão reduz perda       | perda semanal (R$ e kg) antes × durante o piloto, por item                      | queda visível nos itens de maior perda (sem meta fixa; registrar) |
| A sugestão evita falta       | rupturas reportadas por semana (item acabou antes do próximo pedido)            | não aumentar                                                      |
| O fluxo cabe na rotina       | tempo entre envio e resposta; dias sem arquivo de vendas                        | resposta em < 2h; arquivo em ≥ 5 dias/semana                      |
| O dono aceita usar Telegram  | % de lojas que instalam e respondem pelo bot vs. fallback WhatsApp              | se a maioria cair no fallback, orçar WhatsApp API na v1           |
| Motivos de ajuste            | texto livre categorizado (preço no CEASA, feriado, clima, promoção, outro)      | aprendizado para a v1 do modelo                                   |

Tudo isso precisa sair do painel sem planilha paralela.

## 2. Arquitetura e stack

Monorepo simples, stack que a equipe já domina:

- **Backend:** Node.js 22 + TypeScript, **Fastify**, **Drizzle ORM**, **PostgreSQL 16**, Zod para validação, `node-cron` para o job diário, Pino para logs.
- **Frontend (painel do operador):** **React 19 + Vite + TypeScript**, React Router, TanStack Query para dados, **Tailwind + shadcn/ui** para componentes, react-hook-form + Zod nos formulários. SPA simples, sem SSR.
- **Bot do Telegram:** **grammY** (TypeScript), rodando dentro do processo da API em modo long polling (sem webhook/HTTPS no início). Conversa 1:1 com cada dono; `chat_id` salvo na loja. Botões inline para aceitar/ajustar, upload de documento para o arquivo do PDV, comandos `/perda`, `/falta`, `/estoque`.
- **Canal abstraído:** interface `MessagingChannel` com implementações `TelegramChannel` (bot) e `ManualChannel` (copiar/colar para WhatsApp), para que uma API de WhatsApp possa entrar depois sem reescrever.
- **Infra:** `docker-compose` (postgres + api + web), `.env`, migrations com `drizzle-kit`. Deploy inicial em uma VPS barata ou Railway/Render; não otimizar.
- **Testes:** Vitest (unitários no motor de sugestão, no parser de arquivos e no parser de respostas do bot), Supertest para rotas críticas. Nada de e2e agora.

```
giro/
├── CLAUDE.md
├── docs/
│   ├── PLANO-MVP.md            (este arquivo)
│   └── DECISIONS.md            (ADRs curtos)
├── docker-compose.yml
├── package.json                (workspaces: apps/*, packages/*)
├── apps/
│   ├── api/                    Fastify + Drizzle
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── db/ (schema.ts, migrations/, seed.ts)
│   │   │   ├── modules/
│   │   │   │   ├── stores/
│   │   │   │   ├── items/
│   │   │   │   ├── imports/      (upload + parsers)
│   │   │   │   ├── suggestions/  (motor + geração de mensagem)
│   │   │   │   ├── responses/    (feedback do dono)
│   │   │   │   ├── losses/       (descarte)
│   │   │   │   ├── messaging/    (MessagingChannel + telegram/ + manual/)
│   │   │   │   ├── telegram/     (bot grammY: handlers, teclados, parser de respostas)
│   │   │   │   └── metrics/
│   │   │   └── jobs/daily-suggestions.ts
│   │   └── test/
│   └── web/                    React + Vite
│       └── src/ (routes/, features/{stores,items,imports,today,losses,metrics}, components/ui, lib/api.ts)
└── packages/
    └── shared/                 tipos e DTOs compartilhados (Zod schemas)
```

## 3. Modelo de dados (PostgreSQL)

```sql
stores        (id, name, owner_name, whatsapp_phone, telegram_chat_id bigint null, telegram_link_code text,
               channel enum('telegram','manual') default 'manual', pdv_system, timezone, created_at)
items         (id, store_id, name, unit enum('kg','un','maco','cx'), shelf_life_days int,
               avg_cost numeric, avg_price numeric, active bool, aliases text[])
               -- aliases: nomes como aparecem no PDV ("TOMATE KG", "Tomate Italiano")
sales_imports (id, store_id, source enum('pdv_csv','pdv_xlsx','manual','telegram'), file_name,
               period_start date, period_end date, rows_total, rows_matched, rows_unmatched,
               status enum('pending','done','error'), error text, created_at)
sales_daily   (id, store_id, item_id, sale_date date, quantity numeric, revenue numeric,
               import_id, UNIQUE(store_id, item_id, sale_date))
stock_counts  (id, store_id, item_id, counted_at timestamptz, quantity numeric, source enum('owner','operator'))
               -- contagem informada pelo dono na resposta ou pelo operador; opcional
purchases     (id, store_id, item_id, purchase_date date, quantity numeric, unit_cost numeric, source enum('owner_reply','invoice','manual'))
suggestions   (id, store_id, suggestion_date date, generated_at timestamptz,
               status enum('draft','sent','answered','expired'), message_text text,
               sent_at timestamptz, channel enum('telegram','manual'), telegram_message_id bigint null)
suggestion_items (id, suggestion_id, item_id,
               action enum('order','skip','risk'),
               suggested_qty numeric, forecast_qty numeric, estimated_stock numeric,
               days_of_cover numeric, reason text,
               -- resposta do dono
               response enum('accepted','adjusted','ignored') , response_qty numeric,
               response_reason enum('price','holiday','weather','promotion','stock_wrong','other'),
               response_note text, responded_at timestamptz)
losses        (id, store_id, item_id, loss_date date, quantity numeric, est_value numeric,
               reason enum('spoiled','damaged','unsold_promo','other'), note text, created_at)
stockouts     (id, store_id, item_id, reported_date date, note text)
calendar_events (id, store_id null, event_date date, kind enum('holiday','fair','event'), label, demand_factor numeric default 1.0)
```

Regras:

- Vendas são sempre **agregadas por dia e item**; o parser consolida linhas repetidas.
- `estimated_stock` é calculado, nunca a verdade absoluta: `último stock_count (ou 0) + compras − vendas` desde a contagem. Se não houver contagem há > 7 dias, marcar como "estimativa fraca" na mensagem.

## 4. Motor de sugestão (v0, heurístico e explicável)

Roda uma vez por dia por loja (job às 05:30, antes do horário de CEASA) ou sob demanda no painel.

**Entrada:** vendas dos últimos 28 dias, estoque estimado, vida útil do item, eventos de calendário, dia da semana.

**Passos por item ativo:**

1. **Previsão de venda por dia** para o horizonte `H = shelf_life_days` (mínimo 1, máximo 3):
   - `base = média ponderada das últimas 4 ocorrências do mesmo dia da semana` (pesos 0.4, 0.3, 0.2, 0.1). Se houver menos de 2 ocorrências, usar média dos últimos 14 dias.
   - `fator_tendência = média(últimos 7 dias) / média(dias 8–14)`, limitado a [0.7, 1.3].
   - `fator_evento` de `calendar_events` para cada dia do horizonte (feriado, feira).
   - `forecast_dia = base × fator_tendência × fator_evento`
   - `forecast_qty = soma dos forecast_dia no horizonte`
2. **Cobertura:** `days_of_cover = estimated_stock / média(forecast_dia)`.
3. **Decisão:**
   - `skip` (não repor) se `days_of_cover ≥ H` → mensagem "estoque para N dias".
   - `order` se `days_of_cover < H` → `suggested_qty = max(0, forecast_qty × (1 + margem) − estimated_stock)`, com `margem = 0.10` (10% de segurança; itens com histórico de ruptura usam 0.20). Arredondar para a unidade prática do item (kg: múltiplos de 1; cx: inteiro; un: múltiplos de 5 ou 10 configuráveis).
   - `risk` (encalhe) se venda dos últimos 2 dias < 60% do esperado **e** `estimated_stock > forecast_qty` → mensagem "vendendo abaixo do ritmo, X na loja; considerar promoção".
4. **Explicação curta** por item (campo `reason`), em linguagem do dono: "tem ~15 kg, vende ~25 kg/dia, sexta vende mais".
5. **Priorização da mensagem:** o dono não lê 40 itens. A mensagem lista **no máximo 12 itens**: primeiro os `risk`, depois os `order` ordenados por valor (`suggested_qty × avg_cost`), depois um resumo "demais itens: não repor hoje". Um link/"responder com _tudo_" para ver o restante.

**Testes obrigatórios (Vitest):** série estável; item com feira na sexta; item sem histórico; estoque desconhecido; arredondamento por unidade; encalhe detectado; limite de 12 itens.

## 5. Fluxos

### 5.1 Vinculação da loja ao bot (uma vez)

1. Operador cadastra a loja no painel → sistema gera `telegram_link_code` (6 caracteres) e um link `t.me/<bot>?start=<code>`.
2. Operador manda o link ao dono (ou instala o Telegram com ele na visita). Dono toca em "Iniciar" → bot salva o `chat_id` na loja e responde "Pronto, Seu Antônio! Todo dia às 5h30 eu mando a sugestão."
3. Se o dono não quiser Telegram, operador marca `channel = manual` e o fluxo cai no fallback (5.4).

### 5.2 Dono (loja), pelo bot — diário

- 05:30: recebe a sugestão com dois botões: **[Aceitar tudo]** e **[Ajustar]**.
- **Ajustar** → bot lista os itens numerados e pede "mande o número e a quantidade, ex.: `1 35`". Dono manda quantas linhas quiser; bot confirma cada uma e pergunta o motivo com botões (preço no CEASA / feriado / clima / promoção / estoque errado / outro). Itens não mencionados ficam como aceitos.
- Arquivo de vendas: dono manda o CSV/XLSX exportado do PDV como documento no chat → bot baixa, cria o `sales_import` e responde "recebi, 142 linhas, 3 itens que não reconheci (o operador vai mapear)".
- `/perda mamão 6` → registra 6 kg de mamão descartado hoje. `/falta banana` → registra ruptura. `/estoque tomate 15` → contagem.
- Texto livre fora de comando → bot responde "não entendi, use /perda, /falta ou /estoque" e encaminha ao operador (log no painel) para nada se perder.

### 5.3 Operador (equipe), diário

1. Painel "Hoje": vê a sugestão enviada, respostas que chegaram pelo bot e pendências (lojas sem resposta, arquivos não mapeados, mensagens não entendidas).
2. Mapeia descrições novas do PDV (fila "mapear").
3. Para lojas `manual`, faz o fallback (5.4).
4. Semanalmente revisa as perdas e faltas registradas com o dono na reunião.

### 5.4 Fallback WhatsApp (lojas sem Telegram)

- Painel mostra a mensagem pronta com botão "copiar" + abrir `wa.me/55…`; operador envia.
- Dono responde no WhatsApp; operador registra as respostas no painel (tela "Hoje", um item por linha, rápido) e lança perdas/faltas à mão.

### 5.5 Formato da mensagem diária

```
Bom dia, Seu Antônio! Sugestão de hoje (qui 12/11):

⚠️ Mamão: vendendo abaixo do ritmo, tem ~22 kg. Vale promoção hoje.

PEDIR
1. Tomate — 40 kg (tem ~15, vende ~25/dia)
2. Cebola — 20 kg (tem ~8, vende ~10/dia)
3. Alface — 60 un (feira amanhã)

NÃO REPOR HOJE
Banana (estoque p/ 3 dias), Limão, Batata

[Aceitar tudo]  [Ajustar]
```

No fallback WhatsApp os botões viram a linha: "Responda _ok_ para aceitar, ou o número e a quantidade para ajustar (ex.: 1 35).".

## 6. API (Fastify) — rotas mínimas

```
POST   /stores                      criar loja
GET    /stores/:id/items            listar itens
POST   /stores/:id/items            criar item (name, unit, shelf_life_days, avg_cost, avg_price, aliases)
POST   /stores/:id/imports          upload CSV/XLSX (multipart) → cria import, roda parser, retorna não mapeados
POST   /imports/:id/map             associar descrições não reconhecidas a itens/aliases e reprocessar
POST   /stores/:id/suggestions/run  gerar sugestão do dia (idempotente por data)
GET    /stores/:id/suggestions/:date
POST   /suggestions/:id/send        envia pelo canal da loja (telegram) ou marca como enviada (manual)
POST   /suggestion-items/:id/response  { response, response_qty?, response_reason?, note? }
POST   /stores/:id/losses           registrar descarte
POST   /stores/:id/stockouts        registrar falta
POST   /stores/:id/stock-counts     contagem informada
GET    /stores/:id/metrics?from&to  métricas do piloto (seção 1)
GET    /stores/:id/telegram-link    gera/retorna o link t.me/<bot>?start=<code>
GET    /inbox                       mensagens do bot não entendidas / pendências
```

Bot do Telegram (grammY, mesmo processo da API, long polling):

```
/start <code>        vincula chat à loja
callback aceitar     marca todos os itens como accepted
callback ajustar     entra em modo ajuste (conversation) e aceita linhas "N qty"
callback motivo:*    salva response_reason do item em ajuste
document             baixa arquivo → cria sales_import → roda parser
/perda <item> <qty>  cria loss (match por alias; se ambíguo, pergunta com botões)
/falta <item>        cria stockout
/estoque <item> <qty> cria stock_count
```

Variáveis: `TELEGRAM_BOT_TOKEN` (do @BotFather), `TELEGRAM_POLLING=true`.

Autenticação: um token estático por ambiente (`API_TOKEN`) no header. Multiusuário fica para depois.

## 7. Painel web (React) — telas

1. **Hoje** (tela principal): por loja, sugestão do dia, status de envio pelo bot, respostas recebidas e pendências. Para lojas `manual`: botão copiar/abrir WhatsApp e grade de itens para registrar resposta (aceito / ajustado + qty + motivo / ignorado), preenchível em < 2 minutos.
2. **Importar vendas:** upload, preview das linhas, fila de mapeamento de descrições.
3. **Itens:** cadastro com unidade, vida útil, custo, preço, aliases, ativo.
4. **Perdas e faltas:** formulário rápido + lista.
5. **Métricas:** cards e gráficos simples (dias respondidos, % aceito/ajustado/ignorado, perda semanal por item antes × durante, rupturas, tempo de resposta).
6. **Lojas:** cadastro básico + link de vinculação ao bot + canal (telegram/manual).
7. **Inbox do bot:** mensagens não entendidas e arquivos recebidos, para o operador agir.

Sem design system elaborado; shadcn/ui padrão. Mobile-friendly porque o operador vai usar no celular na loja.

## 8. Fases e entregas

Cada fase termina com algo usável no piloto. Não avançar sem fechar a anterior.

### Fase 0 — Fundação (1–2 dias)

- [ ] Monorepo com workspaces, TypeScript strict, ESLint/Prettier.
- [ ] `docker-compose` com Postgres; `apps/api` sobe com healthcheck; `apps/web` (Vite + React) sobe com Hello.
- [ ] Criar o bot no @BotFather, salvar o token no `.env`; bot responde `/start` com "olá" (grammY, long polling).
- [ ] Drizzle schema (seção 3) + primeira migration + seed com 1 loja fictícia e 20 itens de hortifruti.
- [ ] `CLAUDE.md` com convenções (seção 9).

### Fase 1 — Ingestão de vendas (2–3 dias)

- [ ] Parser CSV/XLSX com detecção de colunas por heurística + mapeamento manual salvo por loja (`column_mapping` em `stores`).
- [ ] Normalização de descrição (uppercase, sem acento, sem "KG/UN") e match por `aliases`.
- [ ] Fila de não mapeados e endpoint `/map`.
- [ ] Bot recebe documento → cria import → responde resumo.
- [ ] Tela "Importar vendas" (upload manual + fila de mapeamento). Testar com um export real de pelo menos 1 PDV usado em São Carlos (descobrir qual na entrevista).

### Fase 2 — Motor de sugestão (2–3 dias)

- [ ] Implementar seção 4 em `modules/suggestions/engine.ts`, puro (sem I/O), com testes Vitest.
- [ ] Job diário + endpoint `run`. Idempotência por (store, date).
- [ ] Gerador de mensagem (template da seção 5.5) com limite de 12 itens.
- [ ] `MessagingChannel`: `TelegramChannel` envia com botões inline; `ManualChannel` só marca como enviada.
- [ ] Vinculação `/start <code>` e tela "Lojas" com o link.
- [ ] Tela "Hoje" com status de envio e, para lojas manuais, botão copiar / `wa.me`.

### Fase 3 — Feedback do dono e perdas (2–3 dias)

- [ ] Bot: callbacks aceitar/ajustar, modo ajuste com parser de linhas "N qty" (com testes), botões de motivo.
- [ ] Bot: `/perda`, `/falta`, `/estoque` com match por alias e desambiguação por botões.
- [ ] Inbox de mensagens não entendidas.
- [ ] Painel: registro manual de resposta, descarte, falta e contagem (fallback).
- [ ] Atualização do estoque estimado com compras informadas na resposta.
- [ ] Telas "Perdas e faltas".

### Fase 4 — Métricas (1–2 dias)

- [ ] Endpoint `/metrics` com as métricas da seção 1.
- [ ] Tela "Métricas" com comparação antes × durante (a semana "antes" é a primeira semana de dados, sem sugestão enviada).

### Fase 5 — Piloto (3 semanas, sem código novo)

- [ ] Cadastrar loja-piloto, itens (15–20) e aliases.
- [ ] Semana 1: só coletar vendas e perdas (baseline), não enviar sugestão.
- [ ] Semanas 2–3: enviar sugestão todo dia, registrar respostas e perdas.
- [ ] Reunião semanal com o dono: 3 perguntas fixas (a sugestão fez sentido? o que ajustou e por quê? o que faltou?).
- [ ] Ao final: relatório com as métricas e decisão continuar / pivotar.

### Fase 6 — Só se o piloto passar

- [ ] Decidir canal pela métrica "dono aceita Telegram": se a maioria usou o bot, seguir nele (webhook + HTTPS); se caiu no fallback, orçar WhatsApp API como nova implementação de `MessagingChannel`.
- [ ] Segunda e terceira loja.
- [ ] Primeira integração de PDV (o mais comum entre as lojas do piloto).

## 9. Riscos e como o MVP lida com eles

- **Export do PDV não existe ou é ruim** → fallback: planilha modelo (data, item, qtd) preenchida pelo dono ou pelo operador a partir da foto do fechamento. Descobrir o PDV na entrevista antes da Fase 1.
- **Estoque estimado errado** → pedir contagem rápida de 5 itens-chave 2× por semana; mostrar "estimativa fraca" quando a contagem estiver velha.
- **Dono não usa Telegram** → é a hipótese de canal; o fallback WhatsApp (copiar/colar) mantém o piloto rodando e a métrica diz se vale pagar a API do WhatsApp na v1. Instalar o Telegram com o dono na visita de onboarding reduz muito o atrito.
- **Dono não responde** → métrica explícita; se < 60% de dias respondidos, o problema é o canal/formato, não o modelo — testar horário e tamanho da mensagem antes de mexer no motor.
- **Mensagem vira "mais um relatório"** → limite de 12 itens e itens de risco primeiro; medir se os `risk` geram ação (promoção/descarte evitado).
- **Perda não é a dor prioritária** → o painel também mede ruptura; se faltas doerem mais que sobras, reposicionar a v1 em torno de "nunca deixar faltar".
