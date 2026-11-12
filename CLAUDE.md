# Giro — MVP

Leia docs/PLANO-MVP.md antes de qualquer tarefa. Siga as fases na ordem; não implemente nada de "Fora do escopo".

## Stack

Node 22 + TypeScript strict, Fastify, Drizzle ORM, PostgreSQL 16, Zod, Vitest, grammY (bot Telegram). Frontend React 19 + Vite, React Router, TanStack Query, Tailwind + shadcn/ui, react-hook-form. Monorepo com pnpm workspaces (não usar npm/yarn).

## Convenções

- Linguagem do domínio em português (store, item, loss são exceções por serem nomes de tabela); textos para o dono em português simples.
- Motor de sugestão (`apps/api/src/modules/suggestions/engine.ts`) é puro: sem acesso a banco, sem datas do sistema (recebe `today` por parâmetro). Toda mudança nele exige teste.
- Bot: handlers finos em `modules/telegram/`, regra de negócio nos módulos de domínio; parser de respostas (`parseAdjustments`) é puro e testado.
- Migrations via drizzle-kit; nunca editar migration já aplicada.
- Validação de entrada com Zod em todas as rotas; DTOs em packages/shared.
- Commits pequenos, mensagem em português no imperativo.
- Antes de concluir uma tarefa: `pnpm lint && pnpm test` verdes; se mexer em SQL/serviço com banco, `pnpm test:int` também (precisa do postgres no ar).

## Comandos

```sh
docker compose up -d postgres # só o banco, para desenvolver local
pnpm dev                      # api :3333 (com bot em long polling) + web :5173
TELEGRAM_POLLING=false pnpm dev  # se o container da api já estiver usando o mesmo token
pnpm db:generate              # gera migration a partir de apps/api/src/db/schema.ts
pnpm db:migrate
pnpm db:seed                  # idempotente
pnpm test
pnpm test:int                 # integração com Postgres (banco descartável por arquivo de teste)
pnpm lint                     # eslint + prettier --check + typecheck
pnpm --filter @giro/api fixtures:pdv  # regenera os arquivos de exemplo do PDV (test/fixtures/pdv)

docker compose up -d --build  # stack completa: api :3333, web :8080 (nginx, /api → api)
```

Decisões de arquitetura e desvios do plano: docs/DECISIONS.md.
