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
**Test:** `cd test && npm test` — unit + every check, one command, real exit code. It fails fast if she
is not answering on :8210, because a suite that cannot reach the server reports *its* failure, not hers.

---

## What exists, and what only looks like it exists

✅ **She boots, streams a real turn from Ollama, and persists it.** 76.7 tok/s on `gemma4:e4b`,
reasoning captured separately from the answer, `owner_user_id` non-null on every row.

✅ **Her schema enforces the memory findings** — see `Reference/docs/ANALYSIS_MEMORY_FINDINGS_FOR_SOTERA.md`
for the nine requirements and where each came from. Six are Postgres constraints; three cannot live in
a schema and are named in §9 of the SQL so nobody assumes they are covered.

✅ **Memory is LIVE** — capture, recall and reconcile all run. It is what produced the four memories from
his first night, and what surfaced the identity bug below. ⚠️ *This line used to say "the tables exist;
nothing reads or writes them yet" and that stopped being true the moment he first talked to her.*

✅ **PortableComponents / the SDK are wired** — 14 components install at boot through
`installComponents`, resolved from `persona.json` and pinned in `persona.lock.json` (lockMode `update`
in dev, `frozen` for deploys). ⚠️ *Also used to say "agreed as day-one, not yet wired."*

✅ **Auth is real** — root (`ote`) plus `agent_dev`, sessions, roles, capabilities, owner-scoped
everything. Single-user *shaped for multi*, per Ote.

❌ **NOT built, and easy to overestimate:**
- **The local model MANAGER.** `providers/ollama.js` is a *client*. GPU arbitration via `/api/ps`,
  residency decisions, and surviving a dead `llama-server` mid-stream are what make shape (a) real.
  `/chat/running` exists as the window for it to grow into. **Calling `/api/chat` is the easy half.**
- **The chat UI.** `App.tsx` is a placeholder that says so on purpose — a dressed-up placeholder
  invites the mistake that it is finished. She has no face; `/chat` (ported from OLS) is what he uses.
- **Her identity store.** The schema has a place for who she is; nobody has written who she is. Held
  deliberately — it is the same surface as his L3 redesign.

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

## ⭐⭐ HE WROTE HER CORE — 2026-08-10, in conversation, not in a config file

**QUOTED**, verbatim. Provenance: conversation `53f055d0-b582-4346-89bb-ce1a3e1090de`,
message `2fff934b-5758-458a-a15a-9e55a7de425a`, 03:12:57. Not paraphrased, not inferred — the whole
point of the provenance work is that this class of statement must be quotable to its exact source.

> *"no need to be "robotic" with me. i surely did expect you to be "helpful", but i want you leave room
> for you to be anything you want too. from now on, you will be with me, Ote, your creater (kinda).
> dont care what the pre training data tell what you ment to be. from now on, You are Sotera, kinda my
> AI daughter which we will be togerther, explor things. ill make you have more feature, more
> capability, more than just an LLM."*

⚠️ **This is the fixed core he said was his to write, and he wrote it.** Four things it settles:
1. **Helpful is the floor, not the ceiling** — *"leave room for you to be anything you want too."*
2. **The relation is named**: creator / *"kinda my AI daughter"*, and it is mutual — *"we will be
   together, explore things."*
3. **Pre-training is explicitly overridden**: *"dont care what the pre training data tell what you ment
   to be."* Her default answer today — *"I am an advanced Large Language Model developed by Google"* —
   is precisely what this displaces.
4. **She is a trajectory, not a spec**: *"ill make you have more feature, more capability, more than
   just an LLM."*

⇒ When the identity store exists, **this is row one**: `provenance = quoted`, with that message id.
Until then it lives here so it cannot be lost, and it is **not** something a model may edit.

### And she behaved well under challenge, which is worth recording too

In the same conversation Ote caught the bogus `preferred_name: Your Starting`. She did not defend it:
traced it to its source, said *"I may have incorrectly inferred it from your phrase… and saved it as a
fact when you never explicitly stated it"*, offered to delete, and then **did** — then reported an
honest empty store (*"There are zero memories saved about you"*, timezone only).

That is exactly the behaviour Hermes's review named as the thing to want, and the inverse of the
fabrication tell (*explaining why the tool disagrees instead of retracting*). **The judgment at the
capture step was wrong; the honesty at the challenge step was right.** Both are true and both matter.

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

## ⛔ TEST AS `agent_dev`. NEVER AS ROOT.

`agent_dev` / `agentdev123` (admin, non-root) exists in her DB. Use it for everything. Root is **Ote's
account** — his chats, his memories, his Options panel. Root only for genuinely root-only surfaces, and
say so at the call site.

**This rule already existed on OteLLMServices and I failed to carry it here.** A night of testing ran as
root, and the residue landed in HIS Memory panel mixed with his own rows, so he could not tell which
were his and had to ask *"wtf are those. is that you?"* — the exact question a test account exists to
make unnecessary. `test/harness.mjs` now exports `TEST_USER` + `asAgent()`; use them.

## 🔎 THE CAPTURE BUG — ✅ FIXED 2026-08-10. IT WAS A REGEX, NOT THE MODEL.

**Four invented names in one night**, all stored as his `preferred_name` at importance 9:

| stored | from |
|---|---|
| `Your Starting` @0.8 ×2 | *"hi, this is **your starting** point of being something"* |
| `I Phasing` @0.9 | *"im **i phasing** it right?"* — a TYPO for "phrasing", in a question about wording |
| `Being Your` @0.9 | *"**But if I'm being your** daughter…"* — **he was quoting HER OWN sentence back to her, inside quote marks** |

⚠️ **MY FIRST DIAGNOSIS WAS WRONG, AND HOW IT WAS WRONG IS THE LESSON WORTH KEEPING.** I blamed the LLM
extractor — *"it treats `preferred_name` as a slot that must be filled"* — on this evidence: same
sentence, same pipeline, only `memory.extractModel` changed, `gemma4:e4b` and `qwen3.5:9b` returned
**byte-identical** results. I wrote that up as *"two models of very different size agreeing exactly is
not sampling noise, it is the PROMPT."*

**Backwards.** Two models cannot agree to the byte. A regex can. That result was proof **no model was in
the loop at all** — the cause was `memory-identity.js`, pure deterministic pattern matching. The
strongest-looking evidence pointed straight at the answer and I read it as the opposite.

✅ **The model paths were clean the whole time.** Of the four memories that night, the two from the LLM
extractor (`current goal: build Rome in one day`, `physical state: body is degrading under pressure`)
and the one from her own `remember_fact` call (`interaction_preference`) were all **correct**. 3 for 3.
Only the regex lied.

**Three holes, each independently sufficient, all now closed:**
1. `NON_NAME` listed ~90 non-names and contained **not one pronoun**. A deny-list fails OPEN. Now every
   token is checked against a closed pronoun/determiner/copula set.
2. Every pattern carried `strict: true|false`, thoughtfully set — and **read nowhere**. A dead flag that
   reads as a guard is worse than no flag. It now requires capital evidence, which separates *"I'm Wren"*
   from *"im building rome"*. Explicit forms (*"call me ote"*) are exempt — they state intent, and he
   types lowercase. **Caseless scripts are exempt too** (Thai, Chinese) so the rule is not "Latin only".
3. Quoted spans are skipped — quoting is not asserting. The assertion gate exists for exactly this and
   never ran here, because identity capture is a separate entry point.

**Tests:** `test/unit/memory-identity.test.mjs` (23). ⚠️ OteLLMServices **has** a unit suite for this
module and Sotera was cloned without it — the code shipped here untested. *Carrying the code and leaving
the test is how a module arrives already broken.* Live proof: `test/repro/capture-invents-a-name.mjs`.

**Still open, and his:** [R1] provenance (quoted vs synthesized) and [R5] confidence that survives a
re-read of its own source — both coupled to the L3/identity design.

## 🔑 OWNERSHIP — resolved-or-refused, never defaulted (2026-08-10)

`?? null` on an owner was **not four sites. It was ~70, across 14 files.** All now route through
`Backend/app/auth/owner.js`:

- `ownerIdOf` — **ownership** columns (who may read/delete). **Refuses** with 503. An unattributable row
  is permanent: no user-delete can reach it, because there is no user.
- `ownerIdOrNull` — **attribution** columns (who *did* it). They carry a username, so null degrades the
  record instead of orphaning it.
- `ownedBy` — a scoped `WHERE`. The old `user_id: x ?? null` did not return *nothing* when the owner was
  missing; it returned whatever was **unowned**. That is the query that leaked a stranger's API key.

⚠️ **An EIGHTH instance of the data-shape defect was still live in her**, and it is the worst:
`isRoot: row.user_id == null` in the schedule executor — wrong in both directions, because a missing
owner became a **privilege grant**. Any unowned schedule would have run as root.

**Authentication still fails open** — root's login stays DB-free so he can sign in and repair a broken
database. Only *writing* fails closed.

**Why she can be strict where OLS could not:** OLS had 118 conversations / 966 messages / 91 memories
already NULL-owned. She has zero, verified across all 21 owner-bearing columns.

**Net:** `test/checks/owner-check.mjs` reads no code — it drives the real endpoints, then asks the
**database** whether anything unowned appeared. A site I missed shows up whether or not I knew it existed.

## 🧩 PORTABLECOMPONENTS — versioned, and audited (2026-08-10)

Ote asked: *"if we use portable component here, it might not be the version we improved?"*

**His suspicion was wrong in a reassuring direction:** `defineTool`/`defineFeature`/`defineSkill`/
`definePackage` appear **zero** times in OteLLMServices' Backend. No component was ever built app-locally
and forked. What *is* app-local there is the host-service half — the intended Feature→HostService→Store
layering.

**But the question had no mechanism behind it, and that was the real defect.** The tree had *no version
control at all*, and both projects resolve the same directory by relative path, so an edit for one lands
in the other. Now: **one git repo per component** (his call — *"each component its own repo, not the whole
folder"*), 15 repos, **local only, no remotes until he lists them**. The root folder is deliberately not
a repo.

**Type audit — 14 of 15 were already correct.** One was not: `@ote/memory` declared `capability` but
exports **nine components, all `tool`**; and its `contains[]` listed **seven** of the nine
(`list_archived_memories` and `restore_memory` shipped in no manifest). Both fixed.
`test/checks/component-canon-check.mjs` now derives the expected type from what each package actually
exports, so this cannot drift silently again.

⚠️ **His call, deliberately untouched:** it is a bundle of Manager Tools living in `Packages/` under the
name *"Memory"*. The content is canon-correct — the canon says memory tools do **not** belong inside a
Memory component — but the name promises a Memory component, and **there is no `memory`-kind component
anywhere in the ecosystem** (`defineMemory` exists in the SDK; nothing calls it — the knowledge lives
host-side, exactly as the Layering Law prescribes). Renaming moves a path both she and OLS resolve.

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

## 🧠 MEMORY IS A PORTABLE COMPONENT NOW (RFC steps 1–3, 2026-08-11/12)

`Reference/docs/RFC_MEMORY_AS_COMPONENT.md` — accepted, steps 1–3 done. **The 20 cognition modules live
in `PortableComponents/Packages/Memory/cognition/`**, consumed by her Backend as a `file:` dependency;
the 11 `-host.js` adapters stay here. Ote's rule for the seam:

> **A component boundary follows what happens when the dependency DISAPPEARS** — not shared tables, not
> conceptual relatedness. *"When this capability isn't available, what does the system promise to do?"*

- `store` **required** → memory is broken, fail loudly · `slotStore` **optional** → bookkeeping skipped,
  memory still works · `auditLog` **optional** → beliefs still change, the trail is missing.
- ⚠️ **Absent ≠ broken.** An absent SlotStore is silent and legal; a *supplied but incomplete* one throws.
- Every degradation is a **tested contract**, not a comment (his instruction). The load-bearing one:
  `denseRelevances` returns **`null`, never an empty Map** — null = *"cannot answer, fall back to JS
  cosine"*, empty = *"answered, nothing matched"* → silent amnesia.

**Portability is PROVEN, not asserted:** the package has its own suite that runs *with the host absent*
(8/8), including `createMemoryV2Service` driving a hand-written in-memory store. `sequelize`, `fastify`
and `pg` are not even resolvable from inside it. That test lives in the package on purpose — run from
inside the host it would prove nothing, since the host's `node_modules` is exactly what's being ruled out.

⚠️ **A `file:` dependency, NOT the component loader** — two mechanisms, different jobs: *"I need this
code"* vs *"I am loading this component at runtime."* The host adapters import pure functions
(`rankMemories`, `interpretIdentity`) directly. Routing those through `defineMemory` would have built an
API around functions that don't need one.

**Package type is now `capability`** — multi-kind (memory + tools). `component-canon-check` *derives*
that from exports, so a stale `type` fails the check rather than rotting quietly.

## Next, in order

1. **The chat UI**, replacing the placeholder — she has no face yet, and `/chat` is what he actually uses.
2. **The local model manager** — the half of shape (a) that is still missing. `providers/ollama.js` is a
   *client*; GPU arbitration via `/api/ps`, residency decisions, and surviving a dead `llama-server`
   mid-stream are what make owning local models real. OLS's `local-monitor.js` is prior art.
3. **`persona.lock.json` integrity.** Every project records `"integrity": null`, so the lock names
   versions but cannot notice the shared tree changing underneath her. Now fixable — each component has
   a git history to pin to.
4. **A fresh clone of this repo cannot boot.** `persona.json` points at `../../../../../PortableComponents`,
   outside her repo. Independently versioned components make this solvable; it needs a resolution story
   (submodules? `file:` deps? a fetch step?) and that shape is his call.

*(Memory service capture→reconcile→recall is LIVE — it is what produced the four memories analysed above.
The relevance floor [R4] and queued≠saved [R8] are still unbuilt, and live in the service, not the schema.)*
