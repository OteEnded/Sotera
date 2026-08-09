# AI_CarryOn.md — Sotera

> **She/her.** Ote's words, twice, and confirmed directly when asked. **Cite this, never the name** —
> deriving a person-attribute from a name is a failure mode we have already been corrected on.
> ⚠️ She does **NOT** inherit OteLLMServices' default assistant identity, which hardcodes *"You are
> male"* to match a male voice. That is OLS's persona, not hers.

## ▶▶ START HERE

**Built 2026-08-10, autonomously, from a four-step plan Ote approved before leaving.** He said *"start
take action as plan. no need to ask me, i might not be there next hours."* Everything below is done and
verified; §Open is what still needs him.

```
Personas/Sotera/          her repo — ONE PERSONA = ONE REPO (Personas/ stays a plain folder)
  Backend/                Fastify :8210
    database/migrations/001_core.sql    ⭐ THE SCHEMA IS THE SOURCE OF TRUTH, not the models
    app/providers/ollama.js             native local client (NOT the manager — see below)
    app/routes/api/chat-site.route.js   the UI-facing surface, SSE
  Frontend/               React + Vite (placeholder page — the chat UI is NOT built)
Personas/_archive/Sotera-legacy-20260810.tar.gz   the dead May-era tree, extraction-verified
```

**Run:** `run_windows.bat` at the repo root, or `cd Backend && npm run dev`. Health: `:8210/api/health`.

---

## What exists, and what only looks like it exists

✅ **She boots, streams a real turn from Ollama, and persists it.** 76.7 tok/s on `gemma4:e4b`,
reasoning captured separately from the answer, `owner_user_id` non-null on every row.

✅ **Her schema enforces the memory findings** — see `Reference/docs/ANALYSIS_MEMORY_FINDINGS_FOR_SOTERA.md`
for the nine requirements and where each came from. Six are Postgres constraints; three cannot live in
a schema and are named in §9 of the SQL so nobody assumes they are covered.

❌ **NOT built, and easy to overestimate:**
- **The local model MANAGER.** `providers/ollama.js` is a *client*. GPU arbitration via `/api/ps`,
  residency decisions, and surviving a dead `llama-server` mid-stream are what make shape (a) real.
  `/chat/running` exists as the window for it to grow into. **Calling `/api/chat` is the easy half.**
- **Memory.** The tables exist; nothing reads or writes them yet. No capture, no recall, no reconcile.
- **The chat UI.** `App.tsx` is a placeholder that says so on purpose — a dressed-up placeholder
  invites the mistake that it is finished.
- **Auth.** There is one user row and no login. Single-user *shaped for multi*, per Ote.
- **PortableComponents / the SDK.** Agreed as day-one, not yet wired.

---

## Decisions I made while he was away (all reversible; flagged rather than buried)

1. **Port 8210.** The template defaults to 3000, which collides with anything. 8201 is OLS.
2. **No `persona` column anywhere.** OLS has one because it hosts many personas. One persona = one
   repo = **one schema**; a second persona gets its own. This deletes a whole class of cross-persona
   leak rather than guarding against it.
3. **Schema as SQL, not Sequelize `sync`.** Sync cannot express `NOT NULL` on an owner, CHECK
   constraints, or partial indexes — exactly the guarantees OLS turned out to be missing. Models mirror
   the SQL; **the SQL wins**. Sync runs `alter:false` so it can never quietly reshape a table.
4. **Applied the migration as the APP role**, not superuser. Applying as `ote` would have made every
   table owned by `ote` and unwritable by the app.
5. **Removed the template's demo chain before the first boot.** Sequelize sync would otherwise have
   created `template_items` inside `persona_sotera`. Timing was the point, not tidiness.
6. **First commit is the pristine template** so every Sotera-specific change is a diff against it.

---

## Two defects found tonight, both mine, both instructive

**1 · Reasoning was being silently discarded.** Ollama streams `message.thinking` in its own field.
My provider read only `message.content`, so on a thinking model (`gemma4:e4b`) ~90% of the output
vanished. **Nothing failed and nothing logged** — the only signal was 25 content deltas against
`eval_count: 250`, two numbers that did not reconcile. Now: its own stream event, its own column.
⇒ *Reasoning is a different KIND of output from the reply, not a prefix of it.*

**2 · My test truncated the stream and it looked like her bug.** `curl … | head -c 600` SIGPIPEs the
pipeline; the answer stopped mid-sentence and the truncated text got persisted. The code was fine.
⇒ *When output looks cut off, suspect the harness before the system.*

---

## ⭐ HER IDENTITY — decided in shape, deferred in detail (2026-08-10)

**Ote's answer: FIXED CORE + LEARNED TEXTURE.** An immutable spine he writes — who she is, her
commitments — plus accreted texture: how she has learned to talk to him specifically.
**Writers to the texture: HIM explicitly, AND the nightly pass. NEVER mid-turn.**

> *"1 + 2. for now, we will discuss again, since i will have to design L3 + Layers prompt again."*

⚠️ **PROVISIONAL. Do not build the identity store yet.** He is redesigning L3 + layer prompts, and that
redesign IS this design — see below.

**Why no-mid-turn is a safety property, not a scheduling preference.** A per-turn writer could talk her
into a new self inside a single conversation — flattery, pressure, or a long night — and nobody would
see the moment it happened. Restricting writes to Ote or the nightly pass means every change to who she
is has slept on it. Drift becomes something you can catch, because it can only arrive on a boundary.

**🔑 THE LEARNED TEXTURE AND THE L3 NOTES ARE THE SAME SURFACE UNDER TWO NAMES.** OLS's L3 notes *are*
temperament: *"maintain a warm and unhurried tone, prioritizing presence over task completion"* is an
identity claim, stored as a note, injected every turn. It cost 22.5× prefill, and in the Hermes
transcript it actively **fought the user** — the notes said be warm while he said *"don't be polite
about it."* So they cannot be settled separately, and Ote is right to hold.

**What this already forecloses (safe to rely on):**
- The **core is never model-writable**. Whatever store it lands in, no runtime path may write it.
- Identity rows, when they exist, carry **provenance** like everything else — retrofitting provenance
  later is the exact mistake documented against OLS.
- **No mid-turn writer touches identity**, so the per-turn pass is scoped to facts about the *user*.

**What is still open:** where the core lives (config vs table vs neither), what the texture actually
records, and whether she may *propose* a change she cannot commit.

**⇒ Unblocked meanwhile:** the memory service for facts about the USER (`subject='user'`) has no
dependency on her identity and can be built now. Only her identity store waits.

## Open — needs Ote

- **⭐ The L3 note shape** (OLS's, but it decides how Sotera's notes are built). 22.5× prefill every
  turn. Now corroborated twice independently: a cost-optimisation talk landed on *"unused skills and
  tools load into the context window with every message"*, and it showed up **live** in the Hermes
  transcript — the notes said *"maintain a warm and unhurried tone"* while he said *"don't be polite
  about it"*, and the model spent reasoning negotiating between them. **The decision is WHERE notes
  live**, not how they are worded.
- **Hermes §25 Q3 follow-up:** he wants per-turn review *and* the nightly distiller — both are legal,
  Principle 11 is one writer per **store**. Remaining call: **which store each one writes**, and who
  wins a conflict.
- **Voice.** OmniVoice ships male because that persona was male. She is she/her and the MM arc is
  paused, so v0 is text-only unless he says otherwise. Text is the substrate anyway.
- **Her identity content.** The schema has a place for who she is; nobody has written who she is.
  That is the actual next question, and it is his, not mine.

## Next, in order

1. Wire PortableComponents/the SDK — a persona *is* an assembly, so her capability list should be real.
2. The memory service: capture → reconcile → recall, against the tables that already enforce the rules.
   ⚠️ The relevance floor ([R4]) and queued≠saved ([R8]) live **here**, not in the schema.
3. The chat UI, replacing the placeholder.
4. Then the local model manager — the half of shape (a) that is still missing.
