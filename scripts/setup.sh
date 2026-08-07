#!/usr/bin/env bash
# FabriQ local setup: install → infrastructure → schema → seed
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▶ Installing dependencies…"
npm install

if command -v docker >/dev/null 2>&1; then
  echo "▶ Starting infrastructure (Postgres, Redis, MinIO)…"
  docker compose up -d
  echo "   Waiting for Postgres…"
  until docker exec fabriq-postgres pg_isready -U fabriq -d fabriq >/dev/null 2>&1; do sleep 1; done
else
  echo "⚠ Docker not found — ensure PostgreSQL is running and DATABASE_URL in .env is correct."
fi

echo "▶ Creating schema…"
npm run db:push

echo "▶ Seeding platform…"
npm run db:seed

echo "✔ Setup complete. Run: npm run dev"
echo "  Web: http://localhost:3000   API docs: http://localhost:3001/api/docs"
