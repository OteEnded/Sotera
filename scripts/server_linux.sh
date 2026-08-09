#!/usr/bin/env bash
# SERVER launcher for Linux/macOS (Fastify + React). Build + run in production
# mode for hosting. Fastify serves the API + built frontend at http://localhost:3000.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

bash "$HERE/lib/install_linux.sh"
bash "$HERE/lib/build_linux.sh"

export NODE_ENV=production
echo "Starting Fastify (production) on http://localhost:3000 ..."
( cd "$ROOT/Backend" && npm start )
