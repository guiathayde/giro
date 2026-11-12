#!/usr/bin/env bash
# Restaura um backup feito por ops/backup-banco.sh. APAGA os dados atuais do banco.
# Uso (na raiz do repositório): ops/restaurar-banco.sh backups/giro-AAAAMMDD-HHMMSS.dump
# Para rodar sem a pergunta de confirmação: CONFIRMAR=sim ops/restaurar-banco.sh <arquivo>
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
arquivo="${1:?informe o arquivo .dump}"
[[ -f "$arquivo" ]] || { echo "arquivo não encontrado: $arquivo" >&2; exit 1; }

if [[ "${CONFIRMAR:-}" != "sim" ]]; then
  read -r -p "Isso substitui TODOS os dados do banco por $arquivo. Digite 'sim' para continuar: " resposta
  [[ "$resposta" == "sim" ]] || { echo "cancelado"; exit 1; }
fi

# a API fica parada durante a restauração para ninguém escrever no meio
"${COMPOSE[@]}" stop api
trap '"${COMPOSE[@]}" start api' EXIT

"${COMPOSE[@]}" exec -T postgres pg_restore -U giro -d giro --clean --if-exists --no-owner \
  --single-transaction <"$arquivo"
echo "restaurado de $arquivo"
