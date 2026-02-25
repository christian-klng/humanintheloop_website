#!/bin/sh
set -e

echo "==> Running migration (splitting bundled JSON into individual files)..."
node /app/scripts/migrate-to-individual.js

echo "==> Regenerating OG pages from volume data..."
cd /usr/share/nginx/html
DATA_SOURCE=volume FILES_DIR=/files node /app/scripts/generate-pages.js
cd /

echo "==> Starting API server..."
node /app/server/api.js &
API_PID=$!

echo "==> Starting nginx..."
nginx -g 'daemon off;' &
NGINX_PID=$!

# Wait for either process to exit
wait -n $API_PID $NGINX_PID 2>/dev/null || true
echo "==> One of the processes exited, shutting down..."
kill $API_PID $NGINX_PID 2>/dev/null || true
exit 1
