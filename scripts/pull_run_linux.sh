#!/usr/bin/env bash
# Update this clone from git, then build + run for the server.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$HERE/pull_linux.sh"
bash "$HERE/server_linux.sh"
