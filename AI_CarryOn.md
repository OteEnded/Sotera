# AI_CarryOn.md

> Purpose: short handoff for the project being built from this template.
> Last updated: 2026-06-17

## Current Goal

Replace this section when you start a real project from this template.

Suggested starting content:

- What is the current feature or milestone?
- Which area is actively being changed right now?
- What should the next AI agent continue without re-discovering?

## Current State

Use this file for short, high-signal handoff notes only.

Suggested content to keep here:

- current goal
- current branch / PR context if relevant
- major files being edited
- known blockers or risks
- latest verification status

Do not store long implementation history here. Put that in `AI_ProgressTracking.md`.

## Template Baseline

- `Backend/` is the Fastify backend starter.
- `Frontend/` is the React + Vite frontend starter.
- Frontend production builds output into `Backend/public/dist`.
- Run scripts (OS-named, wizard-driven): root ships `wizard.bat` / `wizard.sh` —
  run once, pick Windows/Linux/Both, and it creates the root `run_windows.bat` /
  `run_linux.sh` (dev: install + build frontend + backend watch) from
  `scripts/launchers/`. `scripts/` also has `server_*` (build + run with
  NODE_ENV=production for hosting) and `pull_*` / `pull_run_*`; helpers in
  `scripts/lib/`. Generated root run scripts are gitignored. Fastify serves API +
  built frontend on one origin.
- Frontend automatically uses the current origin for API calls (no manual base URL config needed when backend serves frontend).
- Example endpoints included by default:
  - `/api/health`
  - `/api/template/meta`
  - `/api/template-items`
- Database support is optional and disabled by default in the shipped local config.
- Query log files are only created when database is enabled.

## Key Files

Update this section to reflect the real project after you begin implementation.

- `Backend/server.js`
- `Backend/config.example.json`
- `Backend/app/routes/api/template-item.route.js`
- `Backend/database/models/template_item.model.js`
- `Backend/database/seeds/seed_template_items.js`
- `Frontend/src/App.tsx`
- `Frontend/src/config.ts` — API base URL auto-detection logic
- `Frontend/src/pages/HomePage.tsx`
- `Frontend/src/pages/ExampleItemsPage.tsx`

### Planning / AI context

- `AI_CarryOn.md` = short current-state handoff for the implementing project
- `AI_ProgressTracking.md` = append-only implementation history for the implementing project
- `AI_TemplateCreation.md` = template-maintainer notes, not implementer history

## Git State

- Replace this section with the live git state of the derived project when work begins.
- Template baseline remote:
  - `origin`
  - `https://github.com/OteEnded/OteFullStackTemplate_Fastify_React.git`

## Verification State

- Replace this section with real verification notes for the derived project.
- Template baseline was verified before publication on 2026-04-17.

Notes:

- `AI_TemplateCreation.md` is intentionally ignored by git.
- `Backend/config.json` is ignored through `Backend/.gitignore`.
- Frontend build output under `Backend/public/dist/` is ignored at the root level.

## Commit Message Policy

Use a consistent commit format:

- `OteEnded[feat]: ...`
- `OteEnded[fix]: ...`
- `OteEnded[refactor]: ...`
- `OteEnded[docs]: ...`
- `OteEnded[chore]: ...`

Examples:

- `OteEnded[feat]: add initial fullstack template structure`
- `OteEnded[refactor]: replace checklist flow with generic template items`
- `OteEnded[docs]: add root template README`

Git workflow policy:

- Do not commit automatically after every edit.
- Commit only when the user explicitly asks for a commit.
- Before committing, re-check `git status` and make sure ignored files stay out of the commit.
- If the remote changes later, record it in this file for the derived project.
- Keep this file short and current.

## Suggested Next Steps

1. Replace the example `TemplateItems` flow with the real domain.
2. Update this file with the actual current goal and implementation state.
3. Start appending detailed work history in `AI_ProgressTracking.md`.