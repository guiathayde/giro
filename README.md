# Giro

Sugestão diária de pedido para hortifrutis. O dono recebe pelo Telegram o que pedir, quanto, o que não repor e o que está encalhando, calculado a partir das vendas do PDV da loja. O objetivo do MVP é validar com 1 a 3 lojas de São Carlos se essa sugestão é seguida e se reduz a perda de FLV.

O plano completo, com hipóteses, métricas, modelo de dados e fases, está em [`docs/PLANO-MVP.md`](docs/PLANO-MVP.md). As decisões de implementação e os desvios do plano estão em [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Status

| Fase                          | Situação                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 0 — Fundação                  | ✅ monorepo, Docker, schema + migrations + seed, bot respondendo `/start`                                   |
| 1 — Ingestão de vendas        | ✅ parser CSV/XLSX/XLS, fila de mapeamento, bot recebe o arquivo, tela "Importar vendas"                    |
| 2 — Motor de sugestão         | ✅ motor heurístico, mensagem diária, envio por Telegram ou manual, rotina das 5h30, telas Hoje/Lojas/Itens |
| 3 — Feedback do dono e perdas | ✅ aceitar/ajustar com motivo no bot, `/perda` `/falta` `/estoque`, inbox, registro manual, tela de perdas  |
| 4 — Métricas                  | ✅ métricas da seção 1 do plano (antes × durante) e tela de métricas                                        |
| 5 — Piloto                    | sem código novo: cadastrar a loja-piloto, baseline de 1 semana, ligar o envio automático                    |

Pendente da Fase 1: testar com um export real de PDV de São Carlos. O arquivo de exemplo é sintético (ver `docs/DECISIONS.md`).

## Antes do piloto

1. **Autenticação:** defina `API_TOKEN` no `.env` antes de expor a API fora da sua máquina. O painel pede o token uma vez e guarda no navegador.
2. **Rotina diária:** `JOBS_ENABLED=true` liga o job das 5h30 (`SUGGESTION_CRON`, fuso `JOBS_TIMEZONE`). Ele expira as sugestões sem resposta, gera a do dia e envia sozinho só para lojas com **envio automático** ligado (tela Lojas), canal Telegram e chat vinculado.
3. **Baseline:** na primeira semana deixe o envio automático desligado e só importe vendas e registre perdas (Fase 5 do plano). As métricas usam essa semana como "antes".
4. **Um processo por token:** só um processo pode fazer long polling e rodar o job com o mesmo token; não deixe `pnpm dev` e o container ligados juntos com `JOBS_ENABLED=true`.

## Stack

- **API:** Node 22, TypeScript strict, Fastify, Drizzle ORM, PostgreSQL 16, Zod, bot do Telegram com grammY (long polling, no mesmo processo).
- **Painel do operador:** React 19, Vite, React Router, TanStack Query, Tailwind e shadcn/ui.
- **Testes:** Vitest.
- **Monorepo:** pnpm workspaces.

## Pré-requisitos

- Node 22 ou mais novo (`.nvmrc`)
- pnpm 11: `corepack enable` ou `npm i -g pnpm@11`
- Docker com Compose

## Como rodar

### Stack completa no Docker

```sh
cp .env.example .env               # e coloque o TELEGRAM_BOT_TOKEN, se tiver
docker compose up -d --build       # postgres + api (aplica as migrations ao subir) + web
docker compose exec api pnpm db:seed   # loja fictícia com 20 itens (idempotente)
```

| Serviço        | Endereço                                     |
| -------------- | -------------------------------------------- |
| Painel         | http://localhost:8080                        |
| API            | http://localhost:3333 (`/health`)            |
| API via painel | http://localhost:8080/api/... (nginx)        |
| Postgres       | `localhost:5432`, usuário/senha/banco `giro` |

### Desenvolvimento local (hot reload)

```sh
pnpm install
cp .env.example .env
docker compose up -d postgres      # só o banco
pnpm db:migrate
pnpm db:seed
pnpm dev                           # api :3333 + web :5173 (o Vite faz proxy de /api)
```

Só um processo pode fazer long polling com o mesmo token do Telegram. Se o container `api` estiver rodando com o token, use `TELEGRAM_POLLING=false pnpm dev` ou pare o container.

## Bot do Telegram

1. Crie o bot no [@BotFather](https://t.me/BotFather) e coloque o token em `TELEGRAM_BOT_TOKEN` no `.env`. Sem token a API sobe normalmente, com o bot desativado (`GET /health` mostra `bot: desativado`).
2. Na tela **Lojas**, toque em **Gerar link** e mande o link `t.me/<bot>?start=<código>` ao dono. Ao tocar em **Iniciar**, o chat fica ligado à loja e o canal dela passa a ser `telegram`.
3. O dono conversa com o bot assim:

| O dono faz                                              | O bot                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| toca **Aceitar tudo** na sugestão do dia                | marca todos os itens como aceitos e registra as compras                                                |
| toca **Ajustar** e manda `1 35` (uma linha por item)    | ajusta o pedido 1 para 35 e pergunta o motivo com botões; os não citados ficam aceitos; `ok` encerra   |
| motivo **outro**                                        | pede uma frase curta e guarda como nota                                                                |
| `ok` / `tudo`                                           | aceita a sugestão do dia / lista todos os pedidos numerados                                            |
| `/perda mamão 6`, `/falta banana`, `/estoque tomate 15` | registra descarte, falta ou contagem de hoje; se o nome bater com mais de um item, pergunta com botões |
| manda o arquivo do PDV como documento                   | importa e responde o resumo (`.csv`, `.txt`, `.xlsx`, `.xls`, até 10 MB)                               |
| qualquer outro texto                                    | responde "Não entendi…" e guarda na **Inbox** do painel para o operador                                |

Lojas sem Telegram usam o fallback manual: na tela **Hoje** o operador copia a mensagem (ou abre o `wa.me`), marca como enviada e registra as respostas do dono item a item.

## Importação de vendas

O operador pode enviar o mesmo arquivo pela tela **Importar vendas** do painel. O parser:

- detecta encoding (UTF-8 ou Windows-1252), separador (`;`, `,`, tab ou `|`) e formato dos números (`1.234,56` ou `1,234.56`);
- acha a linha de cabeçalho pelos nomes mais comuns das colunas (data, código, descrição, quantidade, valor total), pulando títulos e linhas de total;
- usa a data de cada linha ou um dia único no título (ex.: "Data: 10/11/2026"). Relatórios que somam vários dias são recusados;
- soma as vendas por dia e item e casa as descrições com os itens pelo nome e pelos `aliases`, sem acento e sem `KG/UN/MC/CX`.

O que não for reconhecido vai para a fila **"Produtos não reconhecidos"** da importação. Ali o operador pode associar a descrição a um item (ela vira um alias e as próximas importações reconhecem sozinhas) ou marcá-la como **ignorar**, para o que não é hortifruti. Se as colunas não forem detectadas, o operador escolhe quais são na tela; a escolha fica salva para a loja e o arquivo guardado é reprocessado. Reenviar um arquivo substitui as vendas daqueles dias, sem duplicar.

Os arquivos de exemplo ficam em [`apps/api/test/fixtures/pdv/`](apps/api/test/fixtures/pdv/):

- `vendas-por-produto-28-dias.csv` (com versões `.xlsx` e `.xls`): exportação "analítica por dia" de 28 dias, no padrão dos sistemas brasileiros;
- `vendas-dia-sem-coluna-data.csv`: relatório de um dia de outro sistema (UTF-8, vírgula, ponto decimal, data só no título).

Eles são gerados por `apps/api/scripts/gerar-exemplos-pdv.ts`. Não edite à mão; para regenerar, rode `pnpm --filter @giro/api fixtures:pdv`.

## Comandos

| Comando                                | O que faz                                                     |
| -------------------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                             | API e web em modo desenvolvimento                             |
| `pnpm test`                            | testes unitários (Vitest)                                     |
| `pnpm test:int`                        | integração com Postgres (precisa do `postgres` no ar)         |
| `pnpm lint`                            | ESLint + Prettier (`--check`) + typecheck de todos os pacotes |
| `pnpm format`                          | formata com Prettier                                          |
| `pnpm db:generate`                     | gera migration a partir de `apps/api/src/db/schema.ts`        |
| `pnpm db:migrate`                      | aplica as migrations                                          |
| `pnpm db:seed`                         | cria a loja fictícia e os 20 itens (idempotente)              |
| `pnpm --filter @giro/api fixtures:pdv` | regenera os arquivos de exemplo do PDV                        |

Antes de concluir qualquer mudança: `pnpm lint && pnpm test` (e `pnpm test:int` se mexer em serviço com banco).

## API

Toda entrada é validada com Zod. Os DTOs ficam em `packages/shared`. Com `API_TOKEN` definido, todas as rotas menos `/health` exigem `Authorization: Bearer <token>`.

| Rota                                                                                      | Descrição                                                                 |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `GET /health`                                                                             | status da API, do banco e do bot                                          |
| `GET /stores`, `POST /stores`, `PATCH /stores/:id`                                        | lojas (inclui canal e envio automático)                                   |
| `GET /stores/:id/items`, `POST /stores/:id/items`, `PATCH /items/:id`                     | catálogo (unidade, vida útil, custo, preço, múltiplo do pedido, apelidos) |
| `GET /stores/:id/telegram-link`                                                           | código e link de vinculação com o bot                                     |
| `PUT /stores/:id/column-mapping`                                                          | mapeamento de colunas do PDV (`null` limpa)                               |
| `POST /stores/:id/imports`, `GET /stores/:id/imports`, `GET /imports/:id`                 | importação de vendas (multipart, campo `arquivo`)                         |
| `POST /imports/:id/map`, `POST /imports/:id/reprocess`                                    | mapear descrições (`itemId` ou `null` = ignorar) / reprocessar            |
| `GET /today?date=`                                                                        | painel Hoje: sugestão de cada loja e pendências                           |
| `POST /stores/:id/suggestions/run`                                                        | gera a sugestão do dia (idempotente; `refazer` só em rascunho)            |
| `GET /stores/:id/suggestions/:date`, `POST /suggestions/:id/send`                         | busca / envia pelo canal da loja                                          |
| `POST /suggestion-items/:id/response`, `POST /suggestions/:id/accept-all`                 | resposta do dono registrada pelo operador                                 |
| `POST`/`GET /stores/:id/losses`, `/stockouts`, `/stock-counts` + `DELETE`                 | descarte, falta e contagem de estoque                                     |
| `GET /stores/:id/calendar-events`, `POST /calendar-events`, `DELETE /calendar-events/:id` | feriados e feiras (fator de demanda)                                      |
| `GET /inbox`, `POST /inbox/:id/resolve`                                                   | mensagens que o bot não entendeu e arquivos recebidos                     |
| `GET /stores/:id/metrics?from&to`, `GET /metrics/channels`                                | métricas do piloto                                                        |

## Estrutura

```
apps/
  api/                 Fastify + Drizzle + bot
    src/db/            schema, migrations, seed
    src/modules/
      imports/         leitura do arquivo, parser, casamento com itens, serviço e rotas
      suggestions/     motor (engine.ts, puro), mensagem diária, geração, envio e painel Hoje
      messaging/       MessagingChannel: TelegramChannel e ManualChannel
      respostas/       resposta do dono (aceitar/ajustar/ignorar) e compras geradas
      registros/       perdas, faltas e contagens de estoque
      inbox/           mensagens que o bot não entendeu
      calendario/      feriados e feiras
      metricas/        métricas do piloto (agregações puras + consultas)
      stores/          lojas, catálogo, vinculação com o Telegram
      telegram/        bot (handlers finos), parseAdjustments, textos para o dono, sessões
    src/jobs/          rotina diária das 5h30 (node-cron)
    scripts/           gerador dos arquivos de exemplo do PDV
    test/              testes unitários, fixtures e test/integracao (Postgres)
  web/                 painel do operador (React + Vite), servido por nginx no Docker
packages/
  shared/              enums do banco e DTOs (Zod) usados pela API e pelo painel
docs/
  PLANO-MVP.md         plano do MVP
  DECISIONS.md         decisões e desvios do plano
```
