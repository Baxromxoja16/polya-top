#!/usr/bin/env bash
# TZ 7 (backup): MongoDB zaxira nusxasi — mongodump (gzip arxiv), saqlash muddati bilan.
# Self-hosted (O'zbekiston, ADR-0004): cron bilan har kuni ishga tushiriladi, masalan:
#   15 3 * * *  /opt/polya/scripts/backup-mongo.sh >> /var/log/polya-backup.log 2>&1
#
# Muhit o'zgaruvchilari:
#   BACKUP_DIR        — nusxalar papkasi (standart: ./backups)
#   BACKUP_KEEP_DAYS  — necha kunlik nusxa saqlanadi (standart: 14)
#   COMPOSE_SERVICE   — docker compose'dagi mongo servisi (standart: mongo)
#   MONGO_URI         — berilsa, docker'siz to'g'ridan-to'g'ri mongodump ishlatiladi
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
SERVICE="${COMPOSE_SERVICE:-mongo}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/polya-${STAMP}.archive.gz"

mkdir -p "${BACKUP_DIR}"

if [[ -n "${MONGO_URI:-}" ]]; then
  mongodump --uri="${MONGO_URI}" --archive="${FILE}" --gzip
else
  # Konteyner ichida dump qilib, stdout orqali hostga yozamiz
  docker compose exec -T "${SERVICE}" mongodump --archive --gzip --db polya > "${FILE}"
fi

# Bo'sh yoki buzilgan fayl — xato
if [[ ! -s "${FILE}" ]]; then
  echo "[$(date -u +%FT%TZ)] backup FAILED: ${FILE} is empty" >&2
  rm -f "${FILE}"
  exit 1
fi

# Eski nusxalarni tozalash
find "${BACKUP_DIR}" -name 'polya-*.archive.gz' -type f -mtime "+${KEEP_DAYS}" -delete

echo "[$(date -u +%FT%TZ)] backup OK: ${FILE} ($(du -h "${FILE}" | cut -f1))"
