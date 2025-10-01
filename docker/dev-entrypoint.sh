#!/usr/bin/env sh
set -e

if [ ! -d node_modules ] || [ ! -f node_modules/.prisma/client/index.js ]; then
  echo "Installing dependencies..."
  npm install
  npx prisma generate
fi

exec "$@"
