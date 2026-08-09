#!/usr/bin/env bash
# Setup wizard (Linux/macOS). Run this once after cloning. It asks which OS you
# want a root run script for and creates only that one, so you have a single
# "run" file at the repo root. Re-runnable. Server/deploy scripts live in scripts/.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo
echo "  Project setup wizard"
echo "  --------------------"
echo "  Which OS do you want a root run script for?"
echo
echo "    [1] Windows   (creates run_windows.bat)"
echo "    [2] Linux     (creates run_linux.sh)"
echo "    [3] Both"
echo
read -rp "  Enter 1, 2, or 3: " CHOICE

make_win() { cp "$ROOT/scripts/launchers/run_windows.bat" "$ROOT/run_windows.bat"; echo "  Created run_windows.bat"; }
make_lin() { cp "$ROOT/scripts/launchers/run_linux.sh" "$ROOT/run_linux.sh"; chmod +x "$ROOT/run_linux.sh"; echo "  Created run_linux.sh"; }

case "${CHOICE:-}" in
  1) make_win ;;
  2) make_lin ;;
  3) make_win; make_lin ;;
  *) echo "  Invalid choice. Run the wizard again and enter 1, 2, or 3."; exit 1 ;;
esac

echo
echo "  Done. Start development by running your root run script."
echo "  Server / deploy scripts are in scripts/ (server_*, pull_*)."
