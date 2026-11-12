# Giro

Sugestão diária de pedido para hortifrutis. O dono recebe pelo Telegram o que pedir, quanto, o que não repor e o que está encalhando, calculado a partir das vendas do PDV da loja. O objetivo do MVP é validar com 1 a 3 lojas de São Carlos se essa sugestão é seguida e se reduz a perda de FLV.

O plano completo, com hipóteses, métricas, modelo de dados e fases, está em [`docs/PLANO-MVP.md`](docs/PLANO-MVP.md). As decisões de implementação e os desvios do plano estão em [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Status

| Fase                          | Situação                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| 0 — Fundação                  | ✅ monorepo, Docker, schema + migrations + seed, bot respondendo `/start`                |
| 1 — Ingestão de vendas        | ✅ parser CSV/XLSX/XLS, fila de mapeamento, bot recebe o arquivo, tela "Importar vendas" |
| 2 — Motor de sugestão         | próxima. Da Fase 2 já existe a vinculação da loja ao bot (`/start <código>`)             |
| 3 — Feedback do dono e perdas | —                                                                                        |
| 4 — Métricas                  | —                                                                                        |

Pendente da Fase 1: testar com um export real de PDV de São Carlos. O arquivo de exemplo é sintético (ver `docs/DECISIONS.md`).

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
2. Gere o link de vinculação da loja: `curl localhost:3333/stores/1/telegram-link`, que devolve `https://t.me/<bot>?start=<código>`.
3. O dono abre o link e toca em **Iniciar**. O chat fica ligado à loja e o canal dela passa a ser `telegram`.
4. O dono manda o arquivo de vendas exportado do PDV como **documento** (`.csv`, `.txt`, `.xlsx` ou `.xls`, até 10 MB). O bot importa e responde com um resumo, por exemplo: _"Recebi! 717 linhas de venda de 12/10 a 08/11. 5 itens que não reconheci (o operador vai mapear)."_

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
| `pnpm test`                            | testes (Vitest)                                               |
| `pnpm lint`                            | ESLint + Prettier (`--check`) + typecheck de todos os pacotes |
| `pnpm format`                          | formata com Prettier                                          |
| `pnpm db:generate`                     | gera migration a partir de `apps/api/src/db/schema.ts`        |
| `pnpm db:migrate`                      | aplica as migrations                                          |
| `pnpm db:seed`                         | cria a loja fictícia e os 20 itens (idempotente)              |
| `pnpm --filter @giro/api fixtures:pdv` | regenera os arquivos de exemplo do PDV                        |

Antes de concluir qualquer mudança: `pnpm lint && pnpm test`.

## API

Toda entrada é validada com Zod. Os DTOs ficam em `packages/shared`.

| Rota                             | Descrição                                                        |
| -------------------------------- | ---------------------------------------------------------------- |
| `GET /health`                    | status da API, do banco e do bot                                 |
| `GET /stores`                    | lojas                                                            |
| `GET /stores/:id/items`          | catálogo da loja                                                 |
| `PUT /stores/:id/column-mapping` | salva (ou limpa, com `null`) o mapeamento de colunas do PDV      |
| `GET /stores/:id/telegram-link`  | código e link de vinculação com o bot                            |
| `POST /stores/:id/imports`       | upload do arquivo (multipart, campo `arquivo`)                   |
| `GET /stores/:id/imports`        | importações da loja                                              |
| `GET /imports/:id`               | detalhe: resumo, não reconhecidos, colunas e prévia              |
| `POST /imports/:id/map`          | associa descrições a itens (`itemId`) ou ignora (`itemId: null`) |
| `POST /imports/:id/reprocess`    | reprocessa o arquivo guardado                                    |

Ainda não há autenticação (o `API_TOKEN` da seção 6 do plano). Não exponha a API fora da sua máquina antes disso.

## Estrutura

```
apps/
  api/                 Fastify + Drizzle + bot
    src/db/            schema, migrations, seed
    src/modules/
      imports/         leitura do arquivo, parser, casamento com itens, serviço e rotas
      stores/          lojas, catálogo, vinculação com o Telegram
      telegram/        bot (handlers finos), textos para o dono, download de arquivos
    scripts/           gerador dos arquivos de exemplo do PDV
    test/              testes e fixtures
  web/                 painel do operador (React + Vite), servido por nginx no Docker
packages/
  shared/              enums do banco e DTOs (Zod) usados pela API e pelo painel
docs/
  PLANO-MVP.md         plano do MVP
  DECISIONS.md         decisões e desvios do plano
```
