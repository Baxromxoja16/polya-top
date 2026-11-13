#!/usr/bin/env bash
# Zaxira nusxadan tiklash. EHTIYOT: --drop mavjud kolleksiyalarni almashtiradi.
#   scripts/restore-mongo.sh backups/polya-20261113T031500Z.archive.gz
set -euo pipefail

FILE="${1:?Foydalanish: restore-mongo.sh <archive.gz>}"
SERVICE="${COMPOSE_SERVICE:-mongo}"

[[ -s "${FILE}" ]] || { echo "Fayl topilmadi yoki bo'sh: ${FILE}" >&2; exit 1; }

read -r -p "«polya» bazasi ${FILE} dan qayta yoziladi. Davom etilsinmi? (yes/no) " answer
[[ "${answer}" == "yes" ]] || { echo "Bekor qilindi."; exit 1; }

if [[ -n "${MONGO_URI:-}" ]]; then
  mongorestore --uri="${MONGO_URI}" --archive="${FILE}" --gzip --drop
else
  docker compose exec -T "${SERVICE}" mongorestore --archive --gzip --drop < "${FILE}"
fi
echo "Tiklandi: ${FILE}"
