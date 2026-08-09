#!/usr/bin/env bash
# Helper unit: install backend + frontend deps if node_modules is missing.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

[ -d "$ROOT/Backend/node_modules" ]  || ( echo "Installing backend dependencies..."  && cd "$ROOT/Backend"  && npm install )
[ -d "$ROOT/Frontend/node_modules" ] || ( echo "Installing frontend dependencies..." && cd "$ROOT/Frontend" && npm install )
