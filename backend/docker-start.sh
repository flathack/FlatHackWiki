#!/bin/sh
set -eu

echo "[START] Prisma schema wird angewendet ..."
npx prisma db push

echo "[START] Prüfe optionalen Admin-Bootstrap ..."
node dist/scripts/bootstrap-admin.js

echo "[START] Starte API ..."
exec npm start
