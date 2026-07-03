#!/bin/sh
set -e

echo "Aplicando migrations pendentes..."
npx prisma migrate deploy

echo "Iniciando servidor..."
exec node dist/server.js
