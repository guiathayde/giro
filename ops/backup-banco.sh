#!/usr/bin/env bash
# Backup do Postgres de produção (pg_dump em formato custom) com retenção.
# Uso (na raiz do repositório): ops/backup-banco.sh
#   BACKUP_DIR      pasta dos arquivos            (padrão: backups)
#   BACKUP_MANTER   quantos backups guardar       (padrão: 14)
#   RCLONE_DESTINO  se definido, copia o arquivo para fora da máquina com rclone
#                   (ex.: b2:giro-backups); configure antes com `rclone config`
# Cron diário (crontab -e):
#   15 3 * * * cd /opt/giro && ops/backup-banco.sh >> backups/backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)
BACKUP_DIR="${BACKUP_DIR:-backups}"
BACKUP_MANTER="${BACKUP_MANTER:-14}"

mkdir -p "$BACKUP_DIR"
arquivo="$BACKUP_DIR/giro-$(date +%Y%m%d-%H%M%S).dump"
parcial="$arquivo.parcial"

echo "$(date -Iseconds) backup → $arquivo"
"${COMPOSE[@]}" exec -T postgres pg_dump -U giro -d giro --format=custom >"$parcial"

# confere que o arquivo é um dump legível antes de considerar pronto
if ! "${COMPOSE[@]}" exec -T postgres pg_restore --list <"$parcial" >/dev/null; then
  echo "backup inválido, mantido em $parcial" >&2
  exit 1
fi
mv "$parcial" "$arquivo"
echo "ok ($(du -h "$arquivo" | cut -f1))"

if [[ -n "${RCLONE_DESTINO:-}" ]]; then
  rclone copy "$arquivo" "$RCLONE_DESTINO"
  echo "copiado para $RCLONE_DESTINO"
fi

# retenção: apaga os mais antigos além de BACKUP_MANTER
ls -1t "$BACKUP_DIR"/giro-*.dump | tail -n +"$((BACKUP_MANTER + 1))" | while read -r velho; do
  rm -f -- "$velho"
  echo "removido $velho"
done
