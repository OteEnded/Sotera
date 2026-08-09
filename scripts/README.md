# scripts/

Setup wizard output, deploy/server scripts, and their helper units. Scripts are
named by OS (`_windows` / `_linux`) so you can't accidentally run the wrong one
when file extensions are hidden. In this template Fastify serves both the API and
the built React frontend from a single origin (`http://localhost:3000`).

## First: run the wizard (repo root)

After cloning, run the wizard once — it asks Windows / Linux / Both and creates
only the matching **root** run script, so you get a single "run" file to start dev:

| Windows          | Linux/macOS          |
| ---------------- | -------------------- |
| `wizard.bat`     | `bash wizard.sh`     |

It copies the chosen launcher from `scripts/launchers/` to the repo root
(`run_windows.bat` and/or `run_linux.sh`). Re-run any time to add the other OS.

## Server / production (run from `scripts/`)

| Windows                    | Linux/macOS                    | Does                                        |
| -------------------------- | ------------------------------ | ------------------------------------------- |
| `server_windows.bat`       | `bash server_linux.sh`         | install, build frontend, run in prod mode   |
| `pull_windows.bat`         | `bash pull_linux.sh`           | `git pull` this clone                       |
| `pull_run_windows.bat`     | `bash pull_run_linux.sh`       | `git pull`, then build + run                |

## Folders

- `launchers/` — dev run-script templates the wizard copies to the repo root
  (`run_windows.bat`, `run_linux.sh`). Not run from here.
- `lib/` — helper units (`install_*`, `build_*`) called by the scripts above.

## Notes

- **Dev vs server:** `launchers/` run the backend with `--watch`; `server_*` run
  it with `NODE_ENV=production`. Both build the frontend first (Fastify serves it).
- **Hosts:** Fastify binds `0.0.0.0`; Vite is set to accept all hosts.
- **Long-running service:** for real production, run the backend under a process
  manager (pm2, or nssm/Task Scheduler on Windows; systemd on Linux).
- Make the `.sh` scripts executable once: `chmod +x wizard.sh scripts/**/*.sh`.
