#!/bin/sh
set -e

echo "==> Running migration (splitting bundled JSON into individual files)..."
BUNDLED_DIR=/usr/share/nginx/html node /app/scripts/migrate-to-individual.js

echo "==> Regenerating OG pages from volume data..."
DATA_SOURCE=volume FILES_DIR=/files HTML_ROOT=/usr/share/nginx/html OUTPUT_DIR=/usr/share/nginx/html node /app/scripts/generate-pages.js

if [ -n "$DATABASE_URL" ]; then
  echo "==> Running database migrations..."
  node -e "const db = require('/app/server/db.js'); db.runMigrations().then(() => { console.log('Migrations complete'); process.exit(0); }).catch(e => { console.error('Migration failed:', e); process.exit(1); })"
fi

echo "==> Starting API server..."
node /app/server/api.js &

echo "==> Starting nginx..."
exec nginx -g 'daemon off;'
