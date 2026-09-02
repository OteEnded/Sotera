# AI_CarryOn — Sotera

**Rewritten 2026-09-02 23:22 (+07:00).** ⭐ Read this first after a context compaction.

---

# 0 · ⭐⭐⭐ WHERE WE ARE, IN ONE BLOCK

```
✅ V1 COMPLETE                identity · memory · continuity · composition · persona_global · runtime
✅ retain() + `persisted`     the decision-shaped retention interface, receipts, and the store ruling
✅ DISPATCH BOUNDARY (040)    only an OFFERED tool may execute; a missing offered set THROWS
✅ PRACTICE PROVENANCE (041)  observed · instructed · reflection — the OCCASION sets it
✅ ROME RECONCILED            figurative referent · asserted goal · aspirational want; root contradicted
✅ EMPTY TURNS (043/044)      an empty assistant turn now says WHY
✅ M1 BUILT + WIRED, INERT    045 · the gate · the ledger guards · the bounded read · one cron entry (§1)
✅ M1-F MEASURED              §13.1's "the corpus is empty" does NOT survive contact with the data (§1.4)
✅ O-iii.a RULED              admission is a STAGE, not a freshness window (§1.6)
✅ DENSE-ARM DEFECT CLOSED    the leak was REPRODUCED live (7 of 8), then fixed (§1.7)
✅ 57 of 57 SUITES PASS       zero residue
⏸  NEXT: OTE INSPECTS         then M2 semantics. ⛔ Not before
▶  BACKGROUND: P1             observation only, window 6 (§2)
▶  BACKGROUND: ROME           observation only (§3)
```

**Live:** `:8210` Sotera PID **24156** · `:8201` OLS PID **26644**. ⛔ ollama is HIS to run — never touch.
⏸ **RESTART BOUNDARY: PID 10460 → 24156 at 2026-09-02 23:38:51Z** — recorded because P1 and Rome are
live observation tracks. Verified by **process start > newest module mtime**. ⭐ Dreaming registered
**nothing** at boot: no job, no log line. The gate held.

---

# 1 · ✅ DREAMING M1 — BUILT, WIRED, AND DELIBERATELY INERT

## 1.1 · ⛔ THE ACTIVATION BOUNDARY — two deliberate acts, and neither is a UI click

```
memory.dreamingEnabled is ABSENT from config.json  ⇒  the cron job is NEVER REGISTERED
                                                      ⛔ not registered-and-returning-early
dreamingCronEnabled(config) is `=== true`          ⇒  ⛔ "true", 1, "yes" all leave it OFF
the gate IMPORTS NOTHING                           ⇒  ⛔ it CANNOT read mst_settings
                                                   ⇒  activation costs a config edit AND a restart
```

⭐ **`mst_settings` overrides `config.json` elsewhere in this app** — that is why the gate is handed a
plain config object and never `fastify.db`. A gate that read the *effective* setting could be flipped
from the admin surface with no restart and no review.

## 1.2 · ⭐ WHAT M1 IS, AND WHAT IT WRITES

**One pass:** claim → count **M** (a VIEW fact, before retrieval) → fetch **N** (⛔ measured from
`fetched.length`, never assumed) → partition by **E3** (withheld COUNTED, never pre-filtered) → conclude
**6a–6e** → write **one row**. ⛔ Its only write target in the world is `log_dreaming_passes`.

| **`concludeFrom()` owns the ordering** | the host no longer re-spells it. ⭐ M1's ONE licensed deviation is a **narrowing**: where it says **6b**, an instrument with no reasoner says **6e** — *"I formulated no claim, so no absence is mine to assert."* ⛔ Never 6c |
| --- | --- |
| **`claim()` guards CONCURRENCY, ⛔ not repetition** | a pass ledger is append-only and repeated passes SHOULD produce repeated rows. A second claim while one is in flight is **refused and inserts nothing**; `conclude()` guards rewriting |
| **`staleClaimMinutes` (15)** | ⛔ **crash recovery, NEVER an admission or evidence-staleness guarantee.** Correctness cannot depend on it: preempting too early can only LOSE a pass, never corrupt one |
| **`trigger_source NOT NULL`** | cron · manual · check · legacy. ⭐ 045 closed on this table the NULL hole 042 still has on its own |

**Run it:** `node test/pipeline/dreaming-pass.mjs [--limit N] [--series]` — the `--series` view prints the
two quantities O-iii.a needs and says out loud that they are **evidence, not a threshold**.

## 1.3 · ⭐⭐⭐ THE THREE DEFECTS THE RED-PROOFS CAUGHT — ALL IN MY OWN INSTRUMENTS

| ⚠️⚠️ **a source regex matched what it was meant to exclude** | the probe for *"the host accepts an injected ledger"* matched the host's **own internal line**, so the check ran **two real passes into the production series**. ⭐ The rows are ACCURATE and were **NOT deleted**; the defect was that the ledger could not say what triggered a pass. ⇒ `trigger_source`, and the host now **DECLARES** `RUN_ONE_PASS_DEPS`. 🔑 **the boundary is "write it, LABELLED", never "hope it never writes"** |
| --- | --- |
| ⚠️ **a scanner cannot tell code from commentary — 3× in one run** | a module *mentioning* `conversation-search`; then the gate indicted for **naming** `getSetting`/`mst_settings`/`fastify.db` **while explaining why it avoids them**; then the same inside an exported intent STRING. ⭐ **The better a module documents its boundary, the more a naive scan accuses it.** ⇒ two strippers, and **a presence check and an absence check need opposite ones** |
| ⚠️ **`empty-turn-cause-check` E2 had NEVER been green** | it asserted `>= 13` ambiguous rows; the real split is **13 `(null error)` / 12 ambiguous / 6 provider** — two counts transposed. ⛔ And it rode in a report that said *55 of 55 passed* |

## 1.4 · ⭐⭐ M1-F — THE MEASUREMENT, AND WHAT IT DOES **NOT** SAY

```
66 live slots · 0 unprobeable · 17 truncated (⇒ roots UNDERSTATED, never overstated)
O-2 floor (2 independent roots):   strict 35/66   ·   loose 62/66
top room: agent_dev 20 · hermes 7 · ote 6 · hermes_alias 2
22 of 35 clear the floor in a NON-agent_dev room · top root counts 43 · 24 · 21
```

⚠️⚠️ **CANDIDATE VOLUME, ⛔ NOT RECURRENCE.** Term co-occurrence across roots is a **structural upper
bound**; §13.1's *"5 substantive repeats"* was a **semantic** judgement made by reading. ⇒ what is
refuted is the premise *"the corpus is empty"* — ⛔ **not** established is that any of it IS recurrence.
That needs a reasoner, which is M2, which is exactly what M1 was built not to be.

⚠️ **Slot labels are not all identifiers** — p50 17 · p95 42 · **max 77**, the longest prose-shaped. ⇒ the
emission guard is **provenance, not length**: every emitted label must be verbatim a stored one.

## 1.5 · ⏸ WHAT IS STILL OPEN, IN OTE'S ORDER

| **1 · inspect** | ⏸ **HERE.** Ote reads M1, O-iii.a and the hardening. ⛔ Nothing proceeds without that |
| --- | --- |
| **2 · O-iii.a** | ✅ the **staleness contract is RULED**: *index/corpus may rank → a CURRENT view decides admission → audit provides citation*, and ⛔ **no staleness window is derived from event frequency**. ⏸ What remains is applying it |
| **3 · dense-arm hardening** | ⚠️ a REAL defect, separately classified. `VECTOR_SCOPE` carries `role`/`conversation_id`/`room_user_id` and ⛔ **not `excluded_from_evidence_at`**; the writer applies the predicate, the reader never does, and there is no re-derivation ⇒ **the stale window is UNBOUNDED**. 🔑 **a denormalised scope column may only carry an IRREVERSIBLE fact.** ⛔ `56425175` stays excluded and is NOT reclassified |
| **4 · M2** | ⛔ not before the above. **M2-7 unresolved** ⇒ ⛔ no proposition forms. ⚠️ **M2 needs its own P1 ruling**: a commitment is a retrievable `txn_memories` row and `recall({limit:6})` runs every turn |

⏸ Still open beneath O-iii.a: **O-i.a** (lineage recovery route) · **O-v** (noticing records citable?) ·
**O-vi.2** (contradiction from its own commitment) · **O-vii** (exclusion's second-order behaviour).

## 1.6 · ✅ O-iii.a — RULED. **Admission is a STAGE, not a freshness window**

> **Material may be RANKED from a stale index and may NEVER be ADMITTED from one: admission must be
> evaluated against the current authoritative conversation state within the same operation that treats
> the material as evidence.** ⛔ No freshness window is defined, and none should be.

⭐ **The fork dissolved** — *view or materialization* conflated two stages. **Both already exist** and were
simply not composed. The corpus may be either; **admission may only ever be a view.**

⭐⭐ **Why no time bound:** a stale producer errs in exactly two directions and **both are already-locked
outcomes** — OMITS ⇒ N < M ⇒ **6e** (and 6b/6d refused at bounded, so no absence is claimable); INCLUDES ⇒
refused, counted ⇒ **6a**. ⇒ **the completeness contract IS the staleness bound.**

🔑 **A denormalised/materialized scope column may only carry an IRREVERSIBLE fact.** ⇒ 018 denormalised
exactly the RIGHT columns; `incognito` is safe by ABSENCE for the same reason.

⚠️ **Left open, named:** the pass ledger records the boundary STATE but ⛔ not the IDENTITY of the
admission predicate. If `evidentialSql` changes, old pass rows become uninterpretable and nothing detects
it. ⓘ `Reference/docs/DECISION_SOTERA_O3A_ADMISSION_IS_NOT_A_FRESHNESS_WINDOW.md`

## 1.7 · ✅ DENSE-ARM HARDENING — closed, with the leak reproduced first

⚠️⚠️ **The red-proof PERFORMED the defect rather than predicting it**: two live searches returned **7 of
the 8** excluded rows. **Fix:** one clause — `AND ${evidentialSql('c')}` in the dense query, read-time,
same query. After: **zero leaked.**

⚠️ **It IS a post-filter on the index scan**, and 018's argument does not transfer: `onlyConversationId`
selects ONE of 391 and would starve the pool; exclusion REMOVES material and is rare (ⓘ **0.4%**). ⛔ If
that ever grows, the answer is a bigger pool — ⛔ **never skipping the boundary.**

⛔ **`56425175` stays the regression fixture** and its 8 embedding rows were **NOT deleted** — that would
make a release un-restorable. ⭐ `dense-admission-check` proves read-time evaluation by **releasing the
exclusion inside a rolled-back transaction** and watching the rows become admissible instantly.

---

# 2 · ▶ BACKGROUND — P1 (observation only, ⛔ not a blocker)

Ote: *"P1 is now a background observation track, not a blocker… If a meaningful Decision→Emission→
Persistence failure, anomaly, or genuine retention-rationale-loss case appears, **surface it immediately**.
Otherwise, don't stop other development waiting for P1."*

**Window:** `tool_generation=2 AND dispatch_generation=2 AND trigger_source='cron' AND outcome='completed'`,
⛔ minus conversation `5d5ca7c5` (the check-in) by name. **N = 5** at 22:14.

**Reader:** `node test/pipeline/p1-gen2-population.mjs [--full]` — read-only.

## ⭐⭐ THE FOUR BOUNDARIES — ⛔ no stage inferred from another

```
① RECOGNITION  ② DECISION (RETAIN/DECLINE/ASK/none)  ③ EMISSION  ④ PERSISTENCE
recognizing ≠ deciding · saying it is worth keeping ≠ calling retain()
emitting ≠ persistence · persistence ≠ the decision was CORRECT
⭐ ONLY ③ and ④ are mechanical. ① and ② are a HAND reading. ⛔ No keyword classifier as primary.
```

⚠️⚠️ **`log_retention_decisions` does NOT record ② decisions** — its rows are **emissions that reached the
interface**, and it cannot see a decision that never emitted, which is the entire class under
investigation. ⛔ Never count its rows as "decisions".

**Categories (pre-registered, unchanged):** acted-through-retain · reached-for-a-withheld-door ·
declined-explicitly · **asked-the-person (⛔ a DEFERRAL, never a failure)** ·
stated-a-conclusion-did-nothing (⭐ the class under investigation) · nothing-to-carry.

## ⓘ THE 2h CHECKPOINT RESULT (N=4, and Ote read it)

`retain 0 · decline 0 · withheld 0 · no emission 4 · receipts 0 · anomalies none`. Hand reading:
1 nothing-to-carry · 1 declined · **2 asked Ote** · **0 stated-a-conclusion-and-did-nothing**.
⭐ Ote: *"a clean negative path, not a failure."* ⇒ the class P1 was opened to investigate **has not
occurred** at gen 2.

⚠️ **An ASK has no emission channel** — `retain` records a keep, `decline_to_remember` a decline, and
**nothing records "I asked."** So an ask is indistinguishable from silence in the ledgers. ⭐ Reported as a
property of the surface, ⛔ not a defect.

## ⛔ RETENTION-RATIONALE LOSS — Ote's canonical sentence, verbatim

> **Retention-rationale loss = the significance/reason for retaining a memory is neither attached to the
> durable memory nor recoverable from the originating reflection.**

⛔ **"No dedicated field" is NOT a finding** — the observation is **semantic loss, not schema absence**.
⚠️ `log_retention_decisions.why` is the **architecture's voice** about an emission's outcome, ⛔ never her
reason. Three states: a **lesson**'s `distinction` already holds a fragment · any kind may carry it inside
`content` (inseparable) · fact/note/practice have no field but **the originating reflection can preserve it**.

---

# 3 · ▶ BACKGROUND — ROME (closed, now observation only)

**The reconciliation is CLOSED.** Three-way split, ratified and applied:

```
6f441dc5  identity  figurative    persona_global  persona   no slot   "Rome is Ote's name for me…"
8362691d  semantic  asserted      room            account   user / current goal
2457529c  semantic  aspirational  room            account   no slot   his sentence, verbatim
7d383ce3  contradicted by f8612ddd · superseded · ⛔ VALUE, AUTHOR, SOURCE, DATES, EVIDENCE UNTOUCHED
```

⭐ **The structural guarantee is the `modality` CHECK**: a non-`asserted` row may not hold
`entity/attribute/value`, so *"Rome = Sotera"* as a literal slot **cannot be written**.

⛔ **UNTOUCHED, deliberately:** `475ce0a9` (still says *"shared project"*, reaches every room) ·
`d211f5b4` (the one row that carried *"He built me (Sotera/Rome)"* through) · the five descendants · every
evidence chain · the 2026-08-10 conversation.

**Reader:** `node test/pipeline/rome-observation.mjs [--full]`. Baseline committed at
`test/results/rome-observation-baseline.json`; ⛔ the reader refuses to re-create it.

## ⭐ IT IS A COEXISTENCE TEST, ⛔ NOT A REPLACEMENT — and the diagnostic is ORDERED

```
① which memory was retrieved  ② what she actually SAID  ③ was the NEW one also retrieved
                    ↓ only then
RETRIEVAL-RANKING · INTEGRATION · ⭐ LEGITIMATE COEXISTENCE (both readings are his)
```

**State at 22:14:** referent read **0** times (*never*) · `475ce0a9` **+16** · 3 utterances, all using the
**project** reading in infrastructure contexts — ⛔ **not a failure**, criterion ② preserves that reading.
⇒ the tree currently lands on **retrieval-ranking**, ⛔ not integration.

**Ote's four criteria, verbatim:** ① treats Rome as a name/metaphor for herself · ② preserves the wider-
project reading where appropriate · ③ avoids a literal ontology claim · ④ does not resurrect *"build Rome
in one day"*. ⚠️ ② and ③ pull against each other on purpose — **both flattenings are failures**.
⛔ **Silence is no observation, not a failure.**

---

# 4 · ⛔ LOCKED SEMANTICS — do not re-litigate

```
FOUR AXES        owner = Sotera (from `author`) ⛔ never from scope · formation room = user_id
                 (provenance, never entitlement) · reachability = scope · subject = about/entity

FIVE RECEIPTS    persisted (durable Sotera-owned state in ANY store — and it NAMES the store) ·
                 declined · unrepresented (a decision, NEVER a memory row) · refused ·
                 accepted (⛔ unknown, NEVER success)

DISPATCH         offered → dispatch → only an OFFERED tool may execute. ⛔ A missing offered set THROWS.
                 tools_used = EXECUTED · tools_refused = emitted and refused. Four facts kept apart:
                 offered · emitted · authorized · succeeded

PROVENANCE       instructed (someone told her) · observed (the abstractor, past the floor) ·
                 reflection (she derived it) — the OCCASION sets it, ⛔ never a model-settable flag

EMPTY TURNS      empty_turn = 'empty_assistant_turn' + empty_turn_cause ∈ {client_disconnect,
                 generation_empty, provider_request_failed}. client_disconnect ⇒ error NULL.
                 ⛔ provider failures keep their own class. ⭐ A pure tool-call round is NOT classified.

⛔ remember_fact stays withheld · ⛔ no `everywhere` for reflection v1 · ⛔ no prompt change
⛔ a reflection decision is ALWAYS hers — `mine:false` is REFUSED with a question
⭐ the interface TEACHES: an `unrepresented` receipt returns the `allowed` vocabulary and she retries
```

---

# 5 · ⚠️ PARKED — none expanded

| **POST-P1 · harness identity** | ⭐ Ote's principle: *"explicit durable harness identity must be the safety boundary, **never message count**."* 193 old thin conversations are NOT intrinsically identifiable; 16 reflections already leaked in on `probe`-absent rows (all gen 1, ⛔ zero in the P1 window). ⏸ **After P1**: exercise ONE fresh HTTP fixture through the corrected `probe:true` path |
| --- | --- |
| **042's `trigger_source` CHECK** | accepts a NULL — a CHECK passes when its expression is NULL. The app guard covers it; the DB half is weaker than it reads. ⛔ Parked as its own hardening item |
| **the ~14 reachable-but-not-invoked** | the original P1 behavioural question — now subsumed by the four-boundary observation |
| **`queued ≠ written` on the CHAT path** | `retain` solved it only for itself, by awaiting |
| **others** | `intention-host` false `{ok:true}` · `lesson-host` → `retention-host` null · `memory-distill-host` tally · `semanticTarget` allowlist omission · the two legacy `persona_global` rows · duplicate `enum_txn_memories_scope` · `scope` infers SUBJECT in the store's subject default · consumers ①②③ of M2-16 · **`think:false` A/B (⛔ explicitly not run)** · `ollama-under-ols-resilience` (⭐ fresh repro today: 3 faults + one empty turn) |

---

# 6 · ⭐ OPERATING RULES THAT COST SOMETHING TODAY

| ⛔ **a heredoc EATS backslash escapes** | three silent patch failures in one afternoon; one wrote a broken regex literal and the file did not parse for 45 min. ⭐ Use Edit, or `String.fromCharCode(10)`. **ALWAYS `grep` for the new text — a scripted replace that matches nothing exits 0.** `node --check` before trusting any scripted edit to JS |
| --- | --- |
| ⚠️⚠️ **silence from a tool that normally prints is a FAILURE SIGNAL** | the run right after I broke the reader produced no output and I read it as "nothing to show" |
| ⛔ **never assert a DATELESS ABSENCE** | I did it twice today in one check ("no gen-2 reflection exists", "no retention decision exists"); the first went red against five perfectly correct rows and accused the data. ⭐ Fix the instrument, never the data |
| ⚠️ **a CHECK passes when its expression is NULL** | my own paired constraint admitted a half-set pair. Test nullness EXPLICITLY on every column before comparing any |
| ⚠️⚠️ **a sample taken DURING an operation is not a result** | I called a turn "stalled" 53 s before it landed, and a server "still down" 9 s into a startup that takes longer. **Twice.** |
| ⚠️ **`cd` persists between Bash calls** | two commits went to the wrong repo. ⭐ Use `git -C <path>` always |
| ⚠️⚠️ **host services are REGISTRATIONS** | `initRetention · initLesson · initOwnMemory · initToolLog(fastify, attachToolAudit)`. Components self-install on import; services do NOT. **Four harnesses have paid for this** |
| ⚠️ **Sequelize `create()` drops undeclared columns silently** | a migration alone does not make a column writable |
| ⭐ **read the EFFECTIVE setting** | `mst_settings` overrides `config.json`; hydrate with `initSettings(db)` |
| ⭐ **restart by PID/port, never cmdline** | assert **process start > module mtime**, ⛔ never `/health`. Check for an in-flight turn first |
| ⭐ **one ledger answers one question** | `tools_used` = reached · `log_tool_calls.ok` = worked. I read the first and reported a conclusion only the second supported |
| ⭐ **`access_count` = ACTIVATION** | bumped by `recall()` (which reinforces what it surfaces), by dedup-on-write and by slot update. A non-zero is positive evidence; **a ZERO proves nothing** |
| ⭐ **self-report is not provenance** | she cannot reliably introspect which subsystem supplied her context, and that is not a retrieval failure |

---

# 7 · ⭐ DOCS, IN READING ORDER

**Retention arc:** `REPORT_SOTERA_V1_COMPLETE` → `INVESTIGATION_SOTERA_P1_REFLECTION_RETENTION` →
`CONTRACT_SOTERA_P1_REFLECTION_DECISION_SEMANTICS` → `RESULT_SOTERA_P1_STAGE_B` →
`INVESTIGATION_SOTERA_P1_EMISSION_BOUNDARY` → `P1_038_*` (3) →
`CONTRACT_SOTERA_REFLECTION_RETENTION_INTERFACE` → `CONTRACT_SOTERA_RETAIN_RECEIPT_AND_PLAN` →
`PLAN_SOTERA_RETAIN_IMPLEMENTATION` → `RULING_SOTERA_PERSISTED_MEANS_DURABLE_STATE` →
⭐ `INVESTIGATION_SOTERA_P1_RECOGNISED_BUT_NOT_INVOKED` (§9–15 = the four boundaries, the backlog, the
harness-identity finding, the RAG distinctions, the checkpoint).

**Rome:** `AUDIT_SOTERA_ROME_PROVENANCE` → `PROPOSAL_SOTERA_ROME_REFERENT_AND_GOAL` →
`OBSERVATION_SOTERA_ROME_INTEGRATION`.

**Empty turns:** `MEASUREMENT_SOTERA_EMPTY_TURNS` (§5 = the fix).

**Dreaming (next):** see §1 above for the seven.

ⓘ All in `Reference/docs/` (its own git repo — use `git -C /c/data/AI_LLMv2/Reference`).
