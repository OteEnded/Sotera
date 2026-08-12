# AI Progress Tracking

## Purpose

- This file stores detailed, chronological AI work logs for this repository.
- Use it for implementation history in the project built from this template.
- Keep long history here, not in `AI_CarryOn.md`.

## Logging Rules

- Add a new entry after each meaningful planning or implementation update.
- Keep each entry concise but specific.
- Include date, summary, files touched, decisions, and next action.
- Before writing a timestamp, get the real current local time from the terminal. On Windows PowerShell, use `Get-Date -Format "yyyy-MM-dd HH:mm:ss K"` and record the local `YYYY-MM-DD HH:mm` value from that output.
- Use newest entries at the bottom (append-only).

## Entry Template

### YYYY-MM-DD HH:mm

- Summary:
- Files touched:
- Decisions:
- Next action:

## Entries

> Append-only, **newest at the bottom**, real-clock timestamps. Anything rewritten in place belongs in
> `AI_CarryOn.md` instead — that separation is the write discipline, not a formatting preference.
>
> ⚠️ This section held *"No implementation entries yet"* until 2026-08-12, while the project had been
> shipping since 2026-08-10. The template's own trailing entries below are the SCAFFOLD's history, not
> hers. A tracker nobody appends to reads exactly like a project where nothing happened.

### 2026-08-12 22:16

- Summary: **RFC_MEMORY_AS_COMPONENT finished — all six steps.** Steps 1-3 (earlier today) made memory a
  portable component: a 13-method `MemoryStore` port, `SequelizeMemoryStore` in the host, an optional
  `SlotStore`, 20 cognition modules moved to `PortableComponents/Packages/Memory/cognition/` consumed as
  a `file:` dep, and a `memory`-kind component (`persona_memory`) so the package is now a `capability`.
  **Step 4** made identity multilingual: the naming ACT is read by a model, behind four deterministic
  filters (assertion gate · explicit-act floor · verbatim spans · function words). **Step 5** added the
  ADOPTION gate (`adopt · noop · ask`) and the ASK via HumanInteraction's held turn, then deleted the
  English regex detector. **Step 6** added provenance (`quoted · elicited · synthesized · observed`) and
  capped confidence by class, with migration `003_provenance.sql`.
- Files touched: `PortableComponents/Packages/Memory/cognition/*` (new `memory-identity-llm.js`,
  `memory-provenance.js`; `memory-identity.js` reduced to vocabulary + gate; `memory-v2-service.js`,
  `memory-identity-resolver.js`, `memory-observation.js`, `memory-extract.js`), its `component.json`,
  `README.md` and four test files · `Backend/app/components/memory-{identity,extract,pipeline,aux-llm}-host.js`,
  `profile-service.js`, `memory-store-sequelize-host.js` · `Backend/app/settings/index.js` ·
  `Backend/app/interaction/service.js` · `Backend/app/routes/v1/chat-site.route.js` ·
  `Backend/database/migrations/003_provenance.sql` (new) + `models/txn_memories.model.js` ·
  `test/unit/{memory-identity-host,rename-consent}.test.mjs` (new), `test/repro/*` (3),
  `test/ui/talk-to-sotera.mjs` (new).
- Decisions: **The LLM interprets, deterministic code adopts** — perception may be fuzzy, adoption may
  not. **The explicit-act floor lives in interpretation, not in the gate**, because `makeObservation`
  defaults intent to `assert`, so a second check there would pass for every producer and guard nothing.
  **The ask port is domain-shaped** (`ask({attribute, from, to})`), and **absent means DEFER, never
  assume**. **Provenance classification happens at interpretation** (only there is the turn text
  available to verify a cited span); the service records the class and enforces the ceiling as a safety
  net. **003 is nullable and un-backfilled on purpose** — nothing outside can recover whether a
  pre-2026-08-12 row was quoted or inferred, and NULL is the honest record of a period when we did not
  ask. **Identity capture must NOT join the serialized write lane**: an ASK can hold five minutes waiting
  for a human, so convergence went into the store instead.
- Measured: regex floor **1/10** naming acts → model **10/10** across th·ja·zh·ko·es·fr·de·en, **0
  invented**; Thai end-to-end `ผมชื่อโอเต้` → `preferred_name "โอเต้"`; in a real conversation
  `preferred_name = Claude` landed `quoted/0.98` while three `remember_fact` writes landed
  `synthesized/0.6`. Gates: 62/62 package (host absent), 5/5 host, 3/3 live repros.
- Bugs found and fixed on the way: `memory.identityEnabled` **read since 2026-07-30 and never
  registered** (no off switch for six weeks, hidden by a defensive try/catch) · `setIdentity` **never
  superseded**, leaving three live names after the first ASK while every check passed · the route never
  logged identity's yield · `commitToMemory`'s **field allowlist** would have dropped provenance
  silently (second allowlist to do this in one arc) · `tidyName` **ate the tone mark off his real name**
  (`โอเต้` → `โอเต`) because combining marks are `\p{M}`, not `\p{L}` · the **rename-consent gate could
  never be escaped** (re-proposing reset the ledger, so every "yes" looked like same-turn self-consent).
- Next action: **L3 + the layer prompt system, with Ote.** The question to settle first is not where the
  layers live but **which one loses when two disagree** — see the ⚠️ block in `AI_CarryOn.md` START HERE.

---

## Template Updates

### 2026-05-05 15:16

- Summary: Added `run.bat` at the repository root so users can start the backend from the root directory without changing directories.
- Files touched: `run.bat`, `README.md`, `AI_CarryOn.md`, `AI_ProgressTracking.md`
- Decisions: `run.bat` calls `npm --prefix Backend start`; kept it minimal so it works on any Windows machine with Node installed.
- Next action: Push the update to GitHub.

### 2026-05-05 16:52

- Summary: Fixed backend startup so query log files are only initialized when database support is enabled, and updated docs to match this behavior.
- Files touched: `Backend/server.js`, `Backend/README.md`, `README.md`, `AI_ProgressTracking.md`
- Decisions: Keep query log initialization inside the database-enabled startup branch to avoid creating unused `queries_*.log` files when DB is off.
- Next action: Commit and push the logging behavior fix.

### 2026-06-17 10:41

- Summary: Changed frontend API base URL to automatically use the current origin (window.location.origin) when config.base_url is empty, eliminating the need for manual configuration when backend serves frontend.
- Files touched: `Frontend/src/config.ts`, `Frontend/public/config.json`, `Frontend/public/config.example.json`, `Frontend/README.md`, `README.md`, `AI_ProgressTracking.md`
- Decisions: Default to same-origin API calls since this is the common case when backend serves the built frontend; allow explicit base_url override for cross-origin scenarios.
- Next action: Commit and push the dynamic API base URL feature.