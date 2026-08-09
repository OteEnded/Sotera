#!/usr/bin/env bash
# Helper unit: build the frontend into Backend/public/dist (Fastify serves it).
# The Fastify backend is plain JS, so there's no backend build step.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Building frontend..."
( cd "$ROOT/Frontend" && npm run build )
