# Decisões (ADRs curtos)

Formato: data — decisão — porquê.

## 2026-11-12 — Fase 0

1. **pnpm workspaces** em vez de npm. `pnpm-workspace.yaml` fixa `shamefullyHoist: false` para o comportamento local ser igual ao do Docker. `allowBuilds` libera só o esbuild.
2. **TypeScript 5.9**, não o 7. O typescript-eslint 8 só suporta TS < 6.1.
3. **`@giro/shared` exporta o código-fonte TS**, sem build. O Vite, o tsx e o drizzle-kit transpilam direto.
4. **A API roda com `tsx` também no container** (`node --import tsx`). Não há etapa de build, porque o plano pede para não otimizar o deploy agora. Rever quando houver deploy de verdade.
5. **O container da API aplica as migrations ao subir** (`src/db/migrate.ts`, migrator programático do Drizzle). O seed continua manual (`pnpm db:seed`).
6. **O web no Docker é um build estático servido pelo nginx** (porta 8080). O nginx faz proxy de `/api/*` para a API sem o prefixo. Em dev, o Vite (porta 5173) faz o mesmo proxy. O front sempre chama `/api/...`, e a API não tem prefixo nem CORS.
7. **O bot é opcional e não derruba a API.** Sem `TELEGRAM_BOT_TOKEN`, ou com `TELEGRAM_POLLING=false`, ele fica desativado. Se o Telegram recusar (token inválido, ou 409 porque outro processo já faz polling com o mesmo token), o erro só vai para o log. O estado do bot aparece em `GET /health` (`bot: ativo | desativado | erro`). Atenção: `pnpm dev` e `docker compose up` com o mesmo token disputam o polling.
8. **Handlers do bot respondem com `ctx.reply`.** A regra "nunca chamar a API do Telegram fora de `TelegramChannel`" saiu do CLAUDE.md em 2026-11-12. O `TelegramChannel` (Fase 2) fica para os envios que partem do sistema, como a sugestão diária.

### Schema (seção 3 do plano)

Implementado como está no plano, com estes acréscimos:

- **IDs `integer GENERATED ALWAYS AS IDENTITY`.** O plano não define o tipo. Ids curtos são melhores em URL e no `callback_data` do Telegram, que tem limite de 64 bytes.
- **`numeric` sem precisão fixa**, mapeado como `number` no TypeScript.
- **NOT NULL e defaults onde o plano deixa implícito:**
  - `active = true`, `aliases = '{}'`;
  - `status` de import = `pending`, de sugestão = `draft`;
  - `loss.reason = 'spoiled'`, `demand_factor = 1.0`, `timezone = 'America/Sao_Paulo'`;
  - contadores de import = 0.
- **Uniques extras:**
  - `suggestions (store_id, suggestion_date)`, para a idempotência por data da Fase 2;
  - `suggestion_items (suggestion_id, item_id)`;
  - `items (store_id, name)`;
  - `stores.telegram_link_code`.
- **FKs:** tudo que pertence à loja usa `ON DELETE CASCADE`. Referências a `items` não usam cascade, porque item se desativa com `active = false` em vez de ser apagado. `sales_daily.import_id` usa `SET NULL`.
- **Índices** nas consultas óbvias: loja + data em perdas, faltas, compras, contagens e imports; e data em `calendar_events`.
- **Ficam para a fase em que forem necessários:** a tabela da inbox do bot (Fase 3) e o múltiplo de arredondamento por item (Fase 2).

## 2026-11-12 — Fase 1

1. **O arquivo de exemplo do PDV é sintético.** Procurei layouts públicos de exportação de "vendas por produto" (VR Software, Omie, CPlug, Hiper, GDOOR e buscas gerais) e nenhum mostra as colunas. O exemplo imita os traços comuns dos relatórios brasileiros:
   - separador `;`, vírgula decimal, Windows-1252 e CRLF;
   - linhas de título antes da tabela e `TOTAL GERAL` no fim;
   - peso com 3 casas;
   - mercearia misturada com hortifruti;
   - produto repetido no mesmo dia e devolução negativa.

   É gerado por `apps/api/scripts/gerar-exemplos-pdv.ts` (`pnpm --filter @giro/api fixtures:pdv`); não editar os arquivos à mão. **O item do plano "testar com um export real" continua aberto** até a entrevista descobrir o PDV da loja.

2. **Bibliotecas de leitura:**
   - CSV com `csv-parse`; o encoding (UTF-8 ou Windows-1252) e o separador são detectados por nós.
   - XLSX/XLS com o SheetJS 0.20.3 do CDN oficial. O pacote `xlsx` do npm parou na 0.18.5, que tem CVE. O SheetJS também lê `.xls` antigo, comum em PDV; o gerador escreve o exemplo também em `.xlsx` e `.xls`, e os testes exigem as mesmas linhas do CSV.
3. **O formato dos números é decidido pela coluna inteira, não célula a célula.** Exemplo: `18.350` sozinho é ambíguo, mas `27.8` na mesma coluna resolve. Uma coluna que continua ambígua usa o formato indicado pela maioria das outras colunas numéricas do arquivo; por exemplo, um `164.97` no valor faz `18.350` ser lido como 18,35 kg. Só se nada resolver vale o separador do arquivo: `;` indica formato BR e `,` indica formato US.
4. **A data das vendas vem da coluna de data ou de um dia único no título** (ex.: "Data: 10/11/2026"; linhas de "Emitido/Gerado em" são ignoradas). Relatórios que somam vários dias sem separar por dia são recusados. **Nunca se assume o dia de hoje.**
5. **`sales_import_rows` guarda as vendas do arquivo somadas por (dia, descrição normalizada).** Cada linha aponta para o item, para "ignorada" ou para nada; as que não apontam para nada formam a fila "mapear".
   - `sales_daily` é derivada daqui em SQL (`INSERT … SELECT … GROUP BY … ON CONFLICT`).
   - Um arquivo reenviado **substitui** os valores do dia, não soma.
   - Uma importação antiga não sobrescreve uma mais nova (`WHERE sales_daily.import_id <= excluded.import_id`).
6. **O arquivo original fica em `sales_imports.file_content`.** Assim é possível reprocessar depois de mapear colunas, mesmo quando o arquivo veio pelo bot.
7. **`/imports/:id/map`:**
   - Aceita `itemId: null` para "ignorar" (mercearia, sacola). Sem isso a fila nunca esvazia.
   - Ignorados vão para `stores.ignored_descriptions`.
   - Mapear para um item adiciona a descrição do PDV aos `aliases` do item.
   - O mapeamento vale para todas as importações da loja com aquela descrição pendente.
8. **Mapeamento de colunas por loja (`stores.column_mapping`):**
   - Tem prioridade, mas se o arquivo vier em outro layout o parser cai na detecção automática.
   - `POST /imports/:id/reprocess` reaplica no arquivo guardado.
9. **Vinculação do bot puxada da Fase 2, só o mínimo:** `GET /stores/:id/telegram-link` (gera o código de 6 caracteres) e `/start <código>` (salva o `chat_id` e muda o canal para `telegram`). Sem isso o bot não sabe de que loja é o documento. A tela "Lojas" continua na Fase 2.
10. **Rotas extras de apoio à tela:** `GET /stores`, `GET /stores/:id/imports`, `GET /imports/:id` e `PUT /stores/:id/column-mapping`.
11. **Limite de 10 MB por arquivo**, no painel e no bot. O tipo é decidido pela extensão (`.csv`, `.txt`, `.xlsx`, `.xls`).
12. **O download do documento do Telegram usa uma URL que contém o token.** Ela nunca é logada nem gravada; o erro só mostra o status HTTP.
13. **Ainda sem autenticação nas rotas.** O `API_TOKEN` da seção 6 não está em nenhuma fase; precisa entrar antes de expor a API fora da máquina.
