#!/usr/bin/env bash
# Your project's DEV run script (Fastify + React), created at the repo root by the
# wizard. Fastify serves the API + built frontend at http://localhost:3000.
# Installs deps, builds the frontend, then runs the backend in watch mode.
# (This template lives in scripts/launchers/; the wizard copies it to root.)
# To host on a server, use scripts/server_linux.sh instead.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$ROOT/scripts/lib/install_linux.sh"
bash "$ROOT/scripts/lib/build_linux.sh"

echo "Starting Fastify (dev, watch) on http://localhost:3000 ..."
( cd "$ROOT/Backend" && npm run dev )
