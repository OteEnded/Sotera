# AI_CarryOn — Sotera

**Checkpoint 2026-09-05 11:45 (+07:00).** ⭐ Read §0-A first; everything below §0-F is history.

---

# 0-A · ⏸ TWO ARCS ARE OPEN. NEITHER IS BLOCKED.

## ⓐ M2 GOVERNANCE — `MECHANISM CLOSED · AWAITING ELIGIBLE PRODUCTION TRAFFIC`

⛔ NOT "operationally closed" (2 of 5 criteria never observed) · ⛔ NOT "blocked" · ⛔ NOT "disabled"
(it is **enabled**; 83 of 84 slots are NOT-IN-SCOPE, which is different) · ⛔ NOT "waiting on more tests".

> ⭐⭐ **THE MECHANISM BEING LIVE AND M2 BEING OPERATIONALLY CLOSED ARE TWO DIFFERENT CLAIMS.**
> The first is TRUE; the second is ⛔ DELIBERATELY FALSE until production evidence exists. ⛔ Never merge them.

⚠️⚠️ **AND THE BLOCKER IS NOT CORPUS SCARCITY.** Even with a perfect slot, **no non-operator writer can
produce an ALLOWED governed UPDATE**: compliance needs the slot's question KEY, and the model has no way to
learn one — no read exposes it, the refusal deliberately withholds it, the tool says omit rather than guess.
⇒ ⭐⭐⭐ **M2's operational closure is COUPLED to the deferred governance-READ decision.** ⛔ Not reopened.

⭐ Eligibility is now OBSERVED, not remembered: `memory-bind-eligibility-host.js` rides the boot+daily cron
beside the memory lint, and `test/maintenance/audit-bind-candidates.mjs` renders the same function.
Today: bound=1 · newly-eligible=0 · excluded=3 · already-ruled-on=2 (each with its date and reason).

## ⓑ THE 2026-09-04 RECALL INCIDENT — four defects, worked INDEPENDENTLY

She answered *"here's what we talked about today"* with a list that was mostly ten days old.

```
④ relayed speech became Ote's identity                 ✅ CLOSED — proved 14/14 · two rows retired 13/13
① no dates on memories about him                       ✅ CLOSED — when:{date,basis} shipped, 21/21
② the 09-04 recap was a JOIN of transcript + memory      ✅ R-C RATIFIED + IMPLEMENTED 09-05 · ⭐⭐⭐ PROVENANCE AXES SHIPPED 09-05 (PASS)
③ the working-memory summary outranked the transcript  ⏸ AFTER ② — ⛔ untouched
```

⇒ ⭐⭐⭐ **② IS DERIVED AND THE PREMISE DID NOT SURVIVE — `DERIVATION_SOTERA_TEMPORAL_READ.md`.**

```
PROVED   removing "today" from the query returns the IDENTICAL 8 memories ⇒ it is a topic word
PROVED   no temporal parameter exists on ANY of the 9 memory tools (additionalProperties:false)
⭐⭐⭐    the 09-04 incident was a JOIN, ⛔ not a silent search: she MERGED the live transcript
         (genuinely today) with TWO 26-Aug instrument memories under one heading "what we talked about today"
         (⚠️ corrected 09-05: the Rome-as-metaphor item WAS said that day, at 22:38 — not the 10-Aug memory)
⭐⭐⭐    the temporal instrument ALREADY EXISTS — `retrieve_conversations` with `between:` /
         `in:"here"`, 5 successful `between` calls in production. She did not reach for it.
⭐⭐      `list_memories` + `when` ALREADY answers all five of his probes exactly (34 rows, all dated)
⚠️⚠️     THREE CLOCKS: the ranker's `recency` is `last_access` — drifted up to 25.8 days off both
⚠️       memory is a ~4% sample of the conversation, 0% on 5 of 11 days ⇒ a perfect date filter on
         MEMORY still answers "what did we talk about today" wrongly
```

⇒ ⭐ **RECOMMENDED: option C** — route the three questions apart, add the missing DENOMINATOR to the
memory read (*"8 returned, 0 from the day you named, N undateable"*), ⛔ give `recall_memory` no date
parameter. ✅ **SETTLED 09-05: ADVERTISED + NOT CHOSEN.** Persisted trace `{count:49}` on all 14 incident turns; the same
registry (PID 15548 up since 09-03 22:50) rebuilds exactly 49 containing `retrieve_conversations`; chat dispatch has
no `authorizeToolCall`. ⚠️ Count, not names — a reconstruction. ⇒ `DERIVATION_SOTERA_TEMPORAL_ROUTING.md`:
corpus routing measured (she reaches for conversations only when the SOURCE IS NAMED; 0 read-tool calls ever
followed a relative-day word); boundary derived by EVIDENCE KIND; contract = **the MERGE RULE + the DENOMINATOR**
(R-C), ⛔ no classifier in `memoryHint`, ⛔ `when` is not a router, ⛔ no date on `recall_memory`; R-D (a SPAN-capable
conversation read — `{in:"here"}` is a 9-turn PASSAGE, radius fixed) recorded as a separate capability gap.
✅ **R-C RATIFIED 09-05** (merge rule · denominator on the ENUMERATION · retrieve_conversations = history instrument,
recorded as a PASSAGE · R-B rejected · `when` ≠ routing · routing MEASURED not asserted). ⭐ Red-proof DESIGNED around the
VOLUNTEERED recap — `REDPROOF_DESIGN_SOTERA_MERGE_RULE.md`: must-fire = the real 23:03:19 reply (exactly the two 26-Aug
instrument items, ⛔ not Rome — corrected: Rome was said that day at 22:38); fixture MARKERS (streamed tool results are
CLIPPED at 4,000 chars, so mapping is marker→fixture); L-MODEL elicits a recap with a CLOSING CUE, ⛔ no question.
✅ **R-C IMPLEMENTED AND RUN 09-05** (`REDPROOF_DESIGN…` §10): `partitionByWhen` + window on `list_memories` (⛔ not
recall_memory) · merge-rule-check 30/30 — must-fire flags EXACTLY 6864d087 + b9c9a133 on the real reply, Rome WITHIN ·
temporal-denominator-check 32/32 vs the DB oracle · suite 78/78 · unit 689 · package 94/94. ⓘ MODEL ARM: 0/6 volunteered
recaps under the closing cue — an OBSERVATION, ⛔ not a pass; ⚠️ run against the LIVE server which still runs the PRE-R-C
package (PID 15548, no restart — Ote's call). ⛔ `@ote/memory` UNCOMMITTED: my R-C hunks sit beside pre-existing hunks
that are not mine in the same two files — attribution is the standing item. ⏸ STOPPED as ruled; ③ untouched.

⭐ **294f8f26 INVESTIGATED 09-05 (read-only) — `REPORT_SOTERA_PROVENANCE_WRONG_SPEAKER_SOURCE.md` §INVESTIGATION.**
`source_message_id` has THREE meanings by writer: extractor/reconcile = the turn that SAID it · chat tools =
`lastUserMsg.id`, the OCCASION turn · reflection = `top.id`, the conversation's NEWEST message (assistant 13/13), by
DESIGN as a reachability anchor. Genuine speaker contradictions **2/156** (`294f8f26`, `0966ab33`), one reflection pass.
⚠️ `top` ≠ `up_to_rolling_id`: 3 rows anchored 89 turns BEYOND what the pass reviewed. ⛔ Nothing changed, nothing decided.

⭐ **REFLECTION ANCHOR DERIVED 09-05 (read-only) — `DERIVATION_SOTERA_REFLECTION_ANCHOR.md`.** A: TWO concepts are read
from one column TODAY — 5 readers assume PROVENANCE (`when.said`, `getSource`, lineage, corrections, relayed-speech), 4 assume
OCCASION (M2 turn key, lint, refusal record, noteRetrieved), 2 REACHABILITY; they coincide on the extractor path, diverge on
reflection; `getSource`(±2) reaches the proposition on 2/13 reflection rows. B: the transcript is `role: text` — NO ids, NO
timestamps — a retained item CANNOT be tied to a turn; only the pass anchor exists. C: anchor promise written twice (08-21
`top` = 'end of the stretch'; 08-26 ledger moved to `reviewedTo`) — composition-order artefact; content grounded IN range,
pointer 89 turns beyond it; 1 of 89 passes. D: proposition-day ≠ anchor-day **NOT OBSERVED** (13/13 same-day).
ⓘ New question: ①'s `said` gloss assumes the source turn is the ACCOUNT HOLDER's — on all 13 reflection rows it is HERS.
⛔ Undecided by ruling: one field vs two · `top` vs `up_to_rolling_id` · retain naming a turn · speaker validation.

⭐⭐ **SEMANTICS DERIVED 09-05 — `DERIVATION_SOTERA_PROVENANCE_OCCASION_REACHABILITY.md`.** Three concepts, three
cardinalities: PROVENANCE 0..n evidence refs (speaker+said-date derive from it; absence = 'not established') · OCCASION
exactly one act (equality only; unique per ACT — a pass, ⛔ not the conversation's newest message) · REACHABILITY one
conversation (a RANGE for pass writes). ⭐ The store ALREADY defines `source_message_id` as the OCCASION (`lineageFor`,
`memory-lineage`) and keeps `evidence.derivedFrom.messageIds` for derivation — written on 0 rows. Provenance readers
(`when.said`, `getSource` ±2, `corrections.learnedFrom`) rely on the EXTRACTOR's coincidence (occasion == evidence turn).
`said` = provenance-glossed, occasion-computed ⇒ already an overloaded temporal label (wrong gloss on 15 rows; wrong DATE
on 0). Distiller = same writer class (watermark `source` + end-of-window anchor; 0 rows). Beyond-range rows: promise (i)
reachability kept, (ii) end-of-stretch broken; ⚠️ passes 13:40/14:00 SHARE occasion id 6539 (latent M2 collision).
⛔ Undecided by ruling: fields · anchor · question generation · retain reference · `said` restriction · `decided` basis.

⭐ **COMPATIBILITY REVIEW 09-05 — `REVIEW_SOTERA_PROVENANCE_CONTRACT_COMPATIBILITY.md`** (13 consumers, GREEN/YELLOW/RED).
GREEN: lineage/supersession · relayed-speech · lint · manual reconcile (the contract's exemplar: occasion in `source`,
provenance in the pointer). YELLOW (right concept, pass-key = conversation state): M2 admission · refusal records · retrieval
traces (TTL 15 min — a shared key within it leaks derivation across passes) · corrections.learnedFrom · Dreaming writes.
RED: `when.said` · `getSource` (provenance half) · reflection retention · distiller (0 rows) · speaker attribution (no field
on memories; implied speaker = anchor's role). ABSENCES: no-provenance **RED** (unrepresentable when an anchor exists — the
anchor MANUFACTURES `said`); no-occasion GREEN where governed; no-reachability GREEN at getSource (3 flavours), RED for
'reachable but unreviewed'; 29 rows carry all three absences on one NULL. COLLISION 6539: **REAL violation** (key = conversation
state, not act), LATENT by circumstance (20-min gap > 15-min TTL; no recall calls; operator-only declaration). ⛔ Nothing decided.

⭐⭐ **REMEDIATION ARCHITECTURE DESIGNED 09-05 — `DESIGN_SOTERA_PROVENANCE_REMEDIATION_ARCHITECTURE.md`** (semantic only).
§0 THE RULE: no axis is derived from another; the only bridge is a WRITER-DECLARED coincidence (relayed-speech's `sourceText &&`
is the model). OCCASION = the ACT, minted before it writes — turn key (turn-driven) · PASS identity (reflection/Dreaming; the
distiller has NO act record and needs one) · label (operator) · refusals inherit the act; 6539 dissolves by moving the key to
the act (`top` demoted to reachability). PROVENANCE = 0..n typed refs {turn|memory|document|record}, each establishing
support (+speaker/date for TURN refs only); written by the writer or not at all; reflection = NOT established; ⛔ no reader
completes it; ⛔ phrase locations are investigation, not repair. REACHABILITY = turn | RANGE (pass) | document | none, four
states kept + the DISTINCTION 'reachable but unreviewed'. TEMPORAL: said ← account-holder turn refs ONLY; recorded ← row;
decided ← act. Migration meaning: extractor said STANDS (declared coincidence); reflection said WITHDRAWN; chat-tool said
withdrawn unless a turn ref exists (37 rows — the visible cost; a chat coincidence is a §10 writer-contract decision).
⛔ No schema/migration/code/rename/validator/repair. Representation is §10 — not decided.

⭐⭐⭐ **FINAL GATE DOC 09-05 — `FINAL_SEMANTIC_REMEDIATION_ARCHITECTURE_V1.md`** (§10 items closed; FACT→RULE→RECOMMENDATION→
UNDECIDED each). Reflection provenance: she may cite slice ORDINALS (+ optional verbatim span) and memory ids she was given;
⛔ no uuids, ⛔ no dates shown; host RESOLVES and VERIFIES (classifyCapture-style), never mints; failed citation recorded, item
still retained (`not established`). Chat-tool same-turn coincidence: ⛔ NOT declarable (measured: 4 verbatim / 16 partial /
17 <50% of 37; lineage header's own Rome counter-example) — YES as write-time VERIFICATION against the occasion turn only;
cost: 33/37 rows lose coincidental `said`. `decided`: internal for account reads; `decidedOn` preserved as its own-memory
exposure, grounding declared. Multi-day `said`: WITHHOLD scalar, refs carry dates, no span basis. Two BASIS: two concepts
(reference kind vs belief grounds), one-way mapping, no merge/rename now. Credential = property of a REFERENCE; `quoted` w/o
ref is meaningless; elicited/observed are act facts. Distiller: act per (conversation, run) before write; adopt reflection's
coverage invariant (watermark = reviewed end, elision refuses); no `last.id` evidence; ⏸ enable-or-not is Ote's. Admin acts:
label or request identity + actor + reason; audit rows must carry the act id. Speaker: NO write refusal; consumer rule +
integrity report; `speaker: not established` defined. §12 representation boundary listed; §13 seven Ote-level decisions;
§11 invariants I1–I10 + forbidden inferences F1–F10; §14 migration principles. ✅ GATE PASSED — implemented below.

⭐⭐⭐ **PROVENANCE AXES SHIPPED 09-05 11:40 — Phases 1–7, `REPORT_SOTERA_PROVENANCE_AXES_LIFECYCLE.md` · VERDICT PASS.**
Phases 1–3 (Reference `7eb4807`): `PHASE1_…DECISIONS` (seven §13 decisions closed) · `SPEC_…IMPLEMENTATION` · `REDPROOF_PLAN_…`
(tests before code). Phase 4 (Sotera `08f4742` `398aa28` `381f6eb` `ad852b8` · package `d489b6a`): **mig 049** — `writer`,
`(act_kind, act_id)`, `reach_*` + CHECKs on `txn_memories`; `txn_memory_evidence`; act on refusals/changes/retention decisions.
`memory-writer-contracts.js` (13 writers; pass writers REFUSED without an act — `NO_ACT`; declared coincidence ONLY extractor/
identity; chat tools VERIFY value-in-occasion-turn; operator attests) · `memory-evidence.js` (refs verified: exists · in range ·
in conversation · span; failures RECORDED, item stands; speaker/date resolved from the TURN, never stored; `saidFor` = one day of
account-holder turn refs). Store stamps axes from construction only; `said` from evidence only; `getSource` = MATERIAL ≠
EVIDENCE + `speaker: not established`. Every writer wired (reflection `revisit:<ledger id>` + range; Dreaming `dreaming:<pass>`;
chat route turn act; M2 admission act-first with the ratified precedence kept; traces/lineage keyed by act; lint +9 rules;
`@ote/memory remember()` passes `evidenceRefs`). Phase 5 (`test/maintenance/migrate-provenance-axes.mjs --apply`, act
`provenance-axes-backfill-2026-09-05`): 158 rows · 77 refs (36 coincidence · 4 span · 3 attested · 34 document) · 158 audit
rows; reflection 5 ledger-linked → act+range, **8 unlinked → act NOT recorded** (strict reading; window link is Ote's);
`c5567db5` pointer OUTSIDE its range ⇒ `reviewed:false`; 0 refs for any reflection row; **`said` 89 → 43 = 46 withdrawn
(13 reflection + 33 chat-tool), exactly FINAL §14's projection**; 31 unknown rows = ALL agent_dev fixtures. Phase 6:
provenance-axes 49/49 · incident-replay 21/21 · temporal-provenance ALL · lint/evidence-auth/cogito ALL · unit 699 · package
94 · suite 79/80 (the one = D5 order drift, EXTERNAL — 0-E) · `measure-temporal-read` §9/§10 unchanged. ⭐ Clarified inside
the contract: a SPAN is verified before attestation; chat-tool = `model-tool` whatever the author; ledger `from NULL` accepted
only where `messages_considered` = messages ≤ `up_to` (8/8). ⛔ R-C · M2 · ③ · privacy · relayed speech · reflection prompt ·
`source_message_id` all untouched. ⏸ **OTE'S (report §F):** window link for the 8 rows · restart :8210 then re-run the
backfill · Generation-4 reflection citations (store side built) · distiller enablement · historical severity · BASIS rename.

⇒ ✅ **② IS SETTLED** (R-C: the merge rule + the denominator; `recall_memory` gets no date parameter) and the provenance
defect beneath it is closed. ⏸ **③ IS NEXT — ⛔ untouched.**

ⓘ For ③, the measured facts: her prompt was **24,037 tokens** (the whole conversation was present), and the
composer's highest-utility item was the **89-token** working-memory block. ⚠️ Its rendered text is NOT
recoverable — only its token count and utility are logged. Fixing that observability gap is part of ③.

# 0-B · ⭐⭐⭐ THE RULES THAT GOVERN ANY FURTHER WORK HERE

```
① CONTAINMENT · a slot may be bound only if EVERY writer that has ever superseded a row in it can
   declare a claim kind AND name an occasion. ⛔ "it probably won't be touched" is not evidence.
   ⇒ the auto-extractor CANNOT declare a kind and must NOT be modified to fit M2.
② NEW IS OUT OF M2 SCOPE, permanently. A NEW row may still carry a pin; that pin says WHICH QUESTION
   IT WAS ADMITTED UNDER and that the write was UNGATED — ⛔ never that a replacement was authorised.
③ GOVERNANCE KNOWLEDGE IS A **READ** CONCERN; GOVERNANCE COMPLIANCE IS A **WRITE** CONCERN.
   ⛔ The refusal stays opaque — returning a question key would make the gate a permission oracle
   and the refusal a read channel.
④ THE M2 WINDOW IS COUNT-BASED, ⛔ never time-based. Elapsed time without traffic proves nothing.
⑤ `quoted` = VERBATIM, ⛔ NOT speaker attribution. It is a CREDENTIAL — the strongest class we have.
   ⇒ ⛔ never teach it to carry who spoke; fix the EVIDENCE BOUNDARY instead.
⑥ A DATE MUST SAY WHAT IT IS A DATE **OF**: `said` · `recorded` · ⛔ there is no `happened`.
```

# 0-C · LIVE STATE — 2026-09-05 11:45

```
79/80 suites (D5 order drift — EXTERNAL, see 0-E) · @ote/memory 94/94 · migrations through 049
:8210 PID 15548 (Sotera) · :8201 PID 27160 (OLS) · :54322 PID 7132 (pg)
memories 151 · live 113 · slots 84 · BOUND 1 · questions 1 · bindings 2 · pinned 14 (all canary, 1 live)
Ote's live `preferred_name` rows: 0  ⭐ correct — the two false "Cogito" rows are RETIRED, ⛔ not replaced
⭐ AXES: 158 rows classified · 77 evidence refs · said 89→43 · 8 reflection acts NOT recorded · lint defects 8 (those rows)
⚠️ :8210 PID 15548 still runs PRE-AXES code — rows written since the backfill (2 so far) carry no axes
ⓘ 10 legacy `zz_` slots hold 0 memories — empty shells, ⛔ not new residue
ⓘ `tool-call-log-check` is MODEL-DEPENDENT and has flaked twice; green standalone and on re-run
```

**BUILT SINCE THE LAST CHECKPOINT:** ⭐⭐⭐ the four provenance axes (mig 049 · writer contracts · evidence table · audited
backfill — see ⓑ) · the model-tool `claimKind` capability · the always-settling receipt
(`persisted / refused / accepted`) · the model-facing write result · the self-authorisation rule wired at
admission · the rehearsed namespace kill switch · continuous bind-eligibility on the cron · the
relayed-speech threading fix · `when:{date,basis}` on every memory · the `sotera_chat_` export rename.

⚠️⚠️ **`PortableComponents/Packages/Memory` IS UNCOMMITTED, AND SO IS `Tools/Retention`.** ⭐ 09-05 11:40: the two AXES hunks
are committed ALONE (`d489b6a`, staged as blobs — the working tree was not touched); everything below is still uncommitted. ⭐ 09-05: R-C added
`normalizeWindow`/`labelByWhen`/`partitionByWhen`/`WINDOW_LABEL` + `list()` window (service) and `on`/`between`/`basis` on
`list_memories` (index.js) + `test/temporal-window.test.mjs` — MINE, in the same files as the pre-existing hunks.
The package repo ALSO holds **pre-existing work that is NOT mine** — `cognition/memory-pipeline.js`, two
`.bak` files, two test files, and earlier hunks in `memory-v2-service.js` and `index.js`.

⭐ **MINE, cleanly separable:** `claimKind` in `reconcileFact` · `claimKind` in `makeObservation`'s `common`
· `modelResult` + the two tool handlers in `index.js` · `temporalProvenance` / `TEMPORAL_BASIS` / `when` in
`view()`. ⏸ Ote: this must become **independently attributable in git before M2 closeout**, ⛔ without
disturbing the pre-existing work.

# 0-D · ⛔⛔ FENCES

```
ORIGIN PARKED · M2-6 UNWIRED · 12b FROZEN 4/4 · P1 UNTOUCHED · ROME UNTOUCHED · POST-M2 OUT
⭐ ONE GOVERNED SLOT (the canary) · ⛔ NO SECOND BIND · ⛔ NO GOVERNANCE READ SURFACE
⛔ THE EXTRACTOR IS NOT MODIFIED TO FIT M2 · ⛔ ② AND ③ UNTOUCHED · ⛔ NO GENERATED M2 TRAFFIC
```

# 0-E · ⏸ RESIDUALS — recorded, ⛔ none of them fixed

```
⚠️ `recall_own_memory.decidedOn` is a bare `created_at::date` through Sequelize ⇒ renders in UTC and is a
   DAY EARLY before 07:00 local. ⛔ Ote ratified `decidedOn` unchanged; correcting it is its own decision.
⚠️ the `when` date uses the DEPLOYMENT's timezone, ⛔ not the individual user's — no per-account column.
⚠️ INLINE ATTRIBUTED SPEECH is caught today only by the shipped rule's 8-character floor. ATTRIBUTION
   itself — who the surrounding clause assigns a span to — is computed NOWHERE. Open residual.
ⓘ Ote's room holds live rows under TWO persona scopes (`null` 34 · `'sotera'` 20). A read scoped to one
   cannot see the other. ⛔ Not investigated. ⭐ 09-05 shape: null = extractor 14 · chat-tool 8 · reflection 11 ·
   decline 1; 'sotera' = ingest 17 · operator 3 (the Rome reconcile rows); production reads the null scope.
ⓘ Closed field lists remain the standing hazard — 14 recorded instances (the 14th: `@ote/memory remember()` dropped `evidenceRefs`).
⚠️ 8 reflection rows have act NOT recorded (strict reading) ⇒ 8 standing `pass-writer-without-act` lint DEFECTS until Ote
   permits the unambiguous 20-min window link (PHASE1 §8) as a separate audited act.
⚠️ :8210 still runs pre-axes code — live rows since the backfill carry no axes; re-run the idempotent backfill after restart.
ⓘ D5a/D5b (R-C's frozen-order search snapshot): same id set, same per-id relevance, ORDER moved because two of his rows were
   accessed at 04:30:49Z (after the 01:22Z snapshot) — `last_access` is the third clock. ⛔ R-C untouched.
ⓘ Three ledger rows link `wrote_memory_id` to lesson/decline records; those rows keep the `record` act (the contract).
```

# 0-F · ⭐⭐⭐ THE LESSONS THIS ARC PAID FOR — read before writing any proof

```
⭐⭐⭐ MEASURE THE THING THAT EXISTS BEFORE DERIVING ITS REPLACEMENT. I wrote a detector and a second
      gate for ④; the shipped rule already solved it AND was better. Both were deleted.
⭐⭐⭐ A "nothing changed" assertion is the one that PASSES WHEN THE INSTRUMENT IS BROKEN ⇒ positive
      control FIRST, and it must cross the PERSISTENCE boundary.
⭐⭐⭐ A GREEN CAN BE STRUCTURAL: operator labels can never equal message UUIDs, so the occasion rule
      would have passed 100% and proved nothing. CONSTRUCT THE ATTACK before taking credit.
⭐⭐  A DATE IS A LOCAL FACT. `toISOString()` is UTC; `::date` is the SESSION's zone — and psql and
      Sequelize DISAGREE. Name the zone explicitly or ship an off-by-one day.
⭐⭐  ⛔ NEVER assert a GLOBAL ABSENCE — read a BASELINE inside the run and assert the DELTA.
⭐⭐  `col <> 'x'` IS NULL-UNSAFE AND SILENTLY GREEN ⇒ `IS DISTINCT FROM`.
⭐⭐  TWO fixtures under ONE entity COLLAPSE INTO ONE SLOT — separate the ENTITY, not just the label.
⭐   A property of the NAMESPACE is not a property of the SLOT (`slot_governed` is true for all 84).
⭐   A harness that omits an OPTIONAL adapter observes a system MISSING A PART.
⭐   An explicit field list DROPS what it was not told about.
⛔   `node --check` PASSES ON AN EMPTY FILE. A syntax check is not an existence check — I truncated a
      1090-line file with a failed script and restored it from git.
⛔   ASSERT THE STATE, ⛔ not the implementation order · "not in scope" ≠ "deferred" ·
      "could not establish X" must never become "X".
```

---


# 0 · ⭐⭐⭐ WHERE WE ARE, IN ONE BLOCK

```
✅ V1 · retain() · dispatch boundary · practice provenance · Rome · empty turns   (all closed)
✅ M1 DREAMING          built · wired behind an ABSENT gate · INERT. 5 passes, 6e demonstrated
✅ M1-F                 candidate volume measured — §13.1's "empty corpus" is REFUTED
✅ O-iii.a RULED        admission is a STAGE, not a freshness window
✅ DENSE-ARM FIXED      the leak was REPRODUCED live (7 of 8), then closed
✅ M2 · SIX LOCKED      M2-5 · M2-7 · M2-8 · M2-9 · M2-10 · M2-11 all BUILT (migrations 046/047)
✅ M2-6 CONTRACT        built · ⛔ UNWIRED · 14 red-proofs + RP3b green
✅ 12b / 12c            proposal-only 4/4 verified · isolated-persona E2E 16/16
✅ QUANTIFIER           semantics LOCKED (⛔ no vocabulary/API written)
✅ M2-3                 RETIRED and re-derived under the room frame
✅ 3 RULINGS LOCKED     ownership ⛔no column · origin DEFERRED · account shell ⛔REJECTED (§3)
✅ ORIGIN CONTRACT      derived across 6 cases — ⭐ 4 mechanisms exist, 1 fact missing
✅ ORIGIN CONTRACT DONE  semantics RATIFIED end-to-end — ⭐ complete enough to IMPLEMENT
⛔ ORIGIN PROOFS UNBUILT  isolation is SPECIFIED, ⛔ NOT demonstrated (§2 ORIGIN, positive controls)
⏸  ORIGIN PARKED        at its implementation boundary — ⛔ do NOT build unless Ote says
✅ M2 BUILT + PROVEN     048 · RP-D0 · RP-T1 · register · E2E · enforcement · transport · 67/67
⏸  AWAITING OTE         ⭐ the FIRST GOVERNED SLOT — 4 approvals (§3)
▶  BACKGROUND           P1 window 7 · Rome observation (§5)
```

**Live:** `:8210` PID **24156** · `:8201` PID **26644**. ⛔ ollama is HIS — never start or kill.
⏸ Restart boundary recorded: PID 10460 → 24156 at **2026-09-02 23:38:51Z**.

```
60/60 checks · 689/689 unit · P1 7 · memories 125 · passes 5 · warrants 0
slots 82 · declared questions 0 · zz_ residue 0 · migrations through 047
```

---

# 1 · ⛔⛔ THE HARD BOUNDARIES — NONE OF THESE MAY MOVE WITHOUT OTE

```
M2 IS DISABLED           `memory.dreamingEnabled` ABSENT ⇒ the cron job is never REGISTERED
M2-6 IS UNWIRED          zero importers outside its own check — ⛔ do not wire it
12b BASELINE FROZEN      4/4 verified, 0/8 discarded — ⛔ do not move it
NO LIVE-PERSONA WRITE    12a = NO while P1 observes
P1 UNTOUCHED             observation only · ROME UNTOUCHED
```

⛔ And a standing rule for anything built next: **M2 must never infer a question from a slot, a memory,
a label, evidence, or successful historical use.**

---

# 2 · ⭐⭐ THE SEMANTICS LOCKED IN THIS ARC — ⛔ do not re-litigate

```
O-iii.a       index/corpus may RANK → a CURRENT view decides ADMISSION → audit gives AUTHORITY
              ⛔ NO freshness window: staleness lands in already-locked outcomes (omit ⇒ 6e · include ⇒ 6a)
              🔑 a denormalised scope column may only carry an IRREVERSIBLE fact

M2-1          ✅ 6f = SUFFICIENT (affirmative) · ✅ THREE axes: execution → conclusion → PRODUCT
              ⭐ `ran + 6f + no product` must stay representable; ⛔ product never inferred from 6f
              ⚠️ NOT YET BUILT — the CHECK is still 6a…6e and there are 0 product columns

QUANTIFIER    presence-asserting ⇒ bounded may suffice · absence-asserting ⇒ EXHAUSTIVE required
              unknown ⇒ DEFER · DECLARED never inferred · a disqualified declaration is REFUSED,
              ⛔ never reclassified · marker detection is SOUND-NOT-COMPLETE, ⛔ no classifier
              ⭐ It is the 6b/6d absence rule MOVED from the outcome to the PROPOSITION
              ⭐ Gate lives at conclusion admissibility ONLY (⛔ not selection/M2-8/persistence)

M2-6          C0 the selector produces CANDIDATES, ⛔ not evidence
              C1 formation context = containment boundary, DERIVED FROM THE SLOT, ⛔ not a semantic claim
              C2 primary + secondary BOTH admitted and BOTH COUNT; the speaker travels to the warrant
              C3 key = label ∪ value (two conjunctive probes) — RECALL, ⛔ not aboutness

M2-3          RETIRED. WRITER dead (purpose → M2-6 C1 + M2-8) · READER vacuous at room scope
              ⭐ the surviving rule is MIS-ATTRIBUTION, ⛔ not disclosure

ORIGIN        ⭐⭐⭐ ORIGIN = what event/artefact this material RE-PRESENTS. ⛔ NEVER access control.
              ⭐⭐ It is a CHAIN of HOPS, and DELIVERY IS HOP 0 — already stored (source_message_id +
                 user_id) ⇒ a single-valued field CANNOT hold it
              ⭐ `origin = none` is a POSITIVE claim (first-hand) with speaker+subject INTACT;
                 ⛔ it is NOT `unknown`, and ⛔ unknown must never be read as none
              ⭐⭐⭐ `reported` is HOP 0's modality and is CORRECTLY placed. The gap is that hops 1..N
                 have NO modality ⇒ ⛔ do NOT loosen slotViolation; the fix is ARITY
              ⭐ quotation → potentially span-verifiable · paraphrase → no verbatim span exists ⇒
                 potentially UNVERIFIABLE, ⛔ NEVER automatically false
              ⭐⭐ DETECTING a mark ≠ ASSERTING an origin. A · marked in speech (cue-verified) ·
                 B · declared as an ACT (authority = the account, pinned) ·
                 ⛔⛔ C · inferred from shape/content = FORBIDDEN
              ⭐⭐ ROUTE A'S AUTHORITY IS BOUNDED (Ote's tightening): the speaker's words are
                 authoritative that THE SPEAKER MADE THE MARKING and THE SPAN EXISTS — ⛔ NOT of the
                 IDENTITY or the TRUTH of the inner event. Route A ⇒ marked + span verified;
                 ⛔ never inner speaker identity / origin identity / pin. Only Route B does those
              ⛔ DETECTED → VERIFIED → ADMITTED must NOT collapse. Route A's ADMITTED = the write seam
                 applying a DECLARED rule; that is what keeps M2-10 from retroactively re-admitting
              ⚠️ Route A can NEVER establish WHO — *"he said"* leaves `who: UNRESOLVED`, and that is
                 the POINT: a silent misattribution becomes an explicit unknown
              ⭐ `who=none` = an ARTEFACT (no speaker) · `who=unresolved` = a speaker is INDICATED but
                 identity not established. ⛔⛔ NEVER default either to the ROOM OWNER
              ⚠️ "needs no new PRIMITIVE" ≠ "SOLVED" — the acceptance path is unbuilt (0 of 34 doc:
                 rows carry a slot_id)
              ⭐ chain = [delivery, represented-1, represented-2, …] · ORIGIN = chain[1:] — ⛔ NEVER
                 includes the delivery; that is what stops it becoming another name for
                 source_message_id
              ⭐⭐ ④ LOCKED, OTE'S WORDING: "Every hop has a modality FIELD; inner hops currently have
                 only the justified epistemic state UNRECORDED, unless a future producer/consumer
                 contract establishes another value."
                 ⭐ None of the 3 reader decisions consults it — (a) slottability is already NO at hop 0
                 and ⛔ nothing deeper may reopen it · (b) is about `who` · (c) is about spans.
                 ⭐ The field must EXIST so silence is explicit (031: NULL ≠ asserted); values wait for
                 a consumer (⚠️ `actor`='system' on 137/137 is what choosing early looks like)
              ⛔ `reported` is NOT an inner-hop modality — "there is another represented hop" is
                 STRUCTURAL ARITY, ⛔ not a semantic value
              ⚠️⚠️ modality(hop0)='reported' ⟺ origin≠none ⟺ not slottable = THREE SPELLINGS OF ONE FACT
                 ✅ LOCKED DIRECTION: `origin.length > 0 → hop0 is reported`
                 ⛔ NEVER `reported → manufacture an origin chain`
                 ⛔ but do NOT change the modality column yet — see the blockers below
              ⭐ paraphrase: span=NONE EXISTS ⇒ never VERIFIED ⇒ supports a RECORD, ⛔ never a WARRANT.
                 UNWARRANTABLE ≠ false

⭐⭐ THE THREE SCHEMA BLOCKERS — DERIVED 14:59 → `DERIVATION_SOTERA_THREE_SCHEMA_BLOCKERS`
✅ 3 BLOCKERS RULED (Ote): ① DB keeps enforcing ⇒ same-row absent a trigger · ② preserve the THREE
   producer reasons as LEDGER provenance (⛔ no 4th until a producer emits it) · ③ Route B = SEPARATE ACT
⭐⭐ REPRESENTATION DERIVED → `DERIVATION_SOTERA_ORIGIN_REPRESENTATION`
   ⭐⭐⭐ ORIGIN = STATE + HOPS, both SAME-ROW on txn_memories, in TWO dedicated columns tied by a CHECK.
   ⭐ `none` and `unknown` are BOTH hop-empty ⇒ an array ALONE cannot represent origin (the 029 overload)
   ⭐ STATE = not-examined | none | unknown | known. All 125 rows default `not-examined` — ⛔ NOT `none`,
     which would assert first-hand-ness nobody established
   ⭐ gate: `state IN ('not-examined','none') OR (entity IS NULL AND attribute IS NULL AND value IS NULL)`
     — 031's SHAPE, and ⛔ 031's own constraint STAYS as a second independent gate
   ⚠️⚠️ this RELOCATES ①'s vacuity, ⛔ does NOT remove it: no schema removes the need for a PRODUCER
   ⭐ hops same-row because a CHECK can only tie columns ON ONE ROW — a child table would need a TRIGGER
   ⛔ not `evidence` (43 rows, FOUR disjoint key-sets, no key on every row) · ⛔ not a composite type
     (0 exist, and element constraints need an immutable fn; this schema has 1 fn and it is volatile)
   ⭐ transition precedent is ON THIS TABLE: `txn_memories_quoted_needs_source` is NOT VALID
✅ ORIGIN VERB RATIFIED 15:46 — ⭐ THE SEMANTIC/CONTRACT DERIVATION IS **COMPLETE ENOUGH TO IMPLEMENT**
   ⛔⛔ AND THAT IS **NOT** A CLAIM THAT THE ISOLATION BEHAVIOUR HOLDS. Every §7 proof is UNBUILT; until
     each has RUN WITH ITS POSITIVE CONTROL PASSING FIRST, the isolation properties are SPECIFIED,
     ⛔ NOT DEMONSTRATED. ⚠️ The warrant proof would pass VACUOUSLY today on 0 rows
   ⛔⛔ STANDING BOUNDARY — origin establishment/correction is NOT a general memory edit. It cannot:
     mutate a warrant · author a span · mint a person · alter reachability · silently modify ANY
     unrelated memory field. ⭐ Each is a red-proof obligation WITH A POSITIVE CONTROL, ⛔ not an assurance
   ✅ 3 FINAL RULINGS: ① one operation, caller-declared CAS intent, act DERIVED, authority checked ONLY
     against the derived act · ② `expected-current` on CORRECT = **THE WHOLE ORIGIN STATE** (⛔ not one
     field — a concurrent edit elsewhere in the chain must not pass unnoticed) · ③ the 41-row refusal
   ⭐⭐ REFUSAL WORDING RULED: ✅ *"authority cannot be established, because delivery provenance is
     absent"* · ⛔ NEVER *"unauthorized"* — that would say the caller was checked and failed, when in
     truth THERE IS NOBODY WHO COULD PASS. (could-not-establish, in its refusal-message form)
⭐⭐ ORIGIN VERB CONTRACT 15:43 → `CONTRACT_SOTERA_ORIGIN_VERB`
   ⚠️⚠️ NAMING COLLISION FLAGGED: "the VERB" now names TWO acts. ⭐ THE DECLARATION VERB
     (mst_slot_questions, 047's noun) is STILL THE ONLY M2-COMMIT BLOCKER and is UNTOUCHED.
     ⛔ The ORIGIN verb is a different act (ruling ③) — deriving it does NOT unblock M2
   ⭐⭐⭐ ONE OPERATION · THE ACT IS DERIVED · THE INTENT IS DECLARED AND CHECKED
     ⛔ act not supplied (a derivable fact must not also be writable — `reported`/mechanismOf precedent)
     ⚠️ but derived-alone allows SILENT ACT-DRIFT, and ⭐⭐ the authorities are DISJOINT (the operator may
     NOT establish; the deliverer may NOT correct) ⇒ intent is a COMPARE-AND-SET GUARD; mismatch REFUSES,
     naming both; ⭐ AUTHORITY is checked against the DERIVED act, ⛔ never the declared intent
   ⭐ CALLER: target · intent · state/depth/who/what+pin · reason (REQUIRED) · expected-current (CORRECT
     only — intent already covers ESTABLISH drift, but a CORRECT could silently contradict a DIFFERENT claim)
   ⛔ SYSTEM-DERIVED, caller may not supply: the act · `actor` (the SESSION, ⛔ not a label) · `source`
     (the invoking context — else a caller could claim a run caused it) · before/after · `reported`
   ⛔⛔ A payload containing `span`/`how-meant` is REFUSED, ⛔ not silently stripped (allowlist family, 10×)
   ⭐⭐ AUTHORITY REUSES WHAT EXISTS: ESTABLISH walks the chain `resolveFormationContext` already walks;
     CORRECT reuses the store's DERIVED root-ness (*"an authority handed in as a parameter is an authority
     a caller can get wrong"*) ⇒ ⛔ no new admin check
   ⚠️⚠️ MEASURED: 41 of 125 memories have NO `source_message_id` ⇒ no delivering turn ⇒ ⛔ NO ESTABLISH
     AUTHORITY EXISTS for them, and the verb must REFUSE — ⭐ correct, not a defect, and the refusal must
     say exactly that, ⛔ never "unauthorized"
   ⭐ ATOMIC: one txn, FOR UPDATE, and the NO-OP decision happens INSIDE the lock. Exactly ONE audit row
     for a real change, exactly ZERO for a no-op
   ⭐⭐⭐ EVERY ISOLATION PROOF ASSERTS *NOTHING CHANGED* — which is exactly what passes when the instrument
     is broken ⇒ ⛔ EVERY ONE NEEDS A POSITIVE CONTROL (warrant · span · person · reachability)

⭐⭐ ESTABLISH TRANSITIONS DERIVED 15:28 → `DERIVATION_SOTERA_ESTABLISH_TRANSITIONS`
   ⭐⭐⭐ ESTABLISH IS FIRST-ESTABLISHMENT **PER FACT**, ⛔ NOT PER ROW. The discriminator was already
     built: `UNRESOLVED · UNKNOWN · NONE-EXISTS · bounded · not-examined` are EXPLICIT NON-CLAIMS ⇒
     FILLING a non-claim = ESTABLISH · CONTRADICTING a claim = CORRECT
   ⭐ The design REQUIRES it: Route A yields `who: UNRESOLVED` and Route B fills it — if that counted as
     contradiction the ordinary path would need the operator every time
   ⭐⭐ ADDING A HOP is ESTABLISH under depth=bounded/unknown and CORRECT under depth=EXHAUSTIVE ⇒ the
     discriminator is `depth`, ⛔ NOT the state
   ⛔ `none → re-presented` is ALWAYS CORRECT (`none` can only arise from an act; the DEFAULT is
     not-examined) · ⛔ anything → `not-examined` is FORBIDDEN to both: you cannot UN-EXAMINE
   ⛔ span and how-meant: FORBIDDEN TO BOTH ACTS · ⛔ piecemeal hop deletion forbidden (clear only
     wholesale via state→none) · withdrawing an identity = a value change to UNRESOLVED, ⛔ not a delete
   ⭐ identical re-assert ⇒ CONVERGES and writes NO audit row · a partial act is REFUSED WHOLE
   ⭐⭐⭐ A WARRANT NEITHER BLOCKS NOR PERMITS and is never consulted — blocking would make provenance
     discovery impossible on exactly the material that most needs it; CHECK ① forces remediation instead.
     ⭐ A superseded warrant is not a lie: it is timestamped and carries `value_at_warrant`
   ⭐⭐⭐ RETRACT IS NOT A THIRD ACT — `none` is a POSITIVE claim, so retracting = CORRECT-to-`none`.
     ⇒ TWO ACTS: ESTABLISH · CORRECT
   ⚠️⚠️ THE WARRANT RED-PROOF WOULD BE VACUOUS TODAY (0 warrant rows) ⇒ ⭐ A POSITIVE CONTROL IS
     MANDATORY: issue a real warrant and assert the snapshot CHANGES before asserting it does not

⭐⭐ ROUTE B ACT + RUN PROVENANCE DERIVED 15:21 → `DERIVATION_SOTERA_ROUTE_B_ACT`
   ⭐⭐ TWO ACTS: ESTABLISH = the ACCOUNT owning the DELIVERING TURN'S ROOM (the only party that knows;
     ⛔ not root-because-admin, ⛔ an ACCOUNT never a person) · CORRECT/RETRACT = the operator via the
     EXISTING `MECHANISM.reconciliation` (3 rows of precedent) ⇒ ⛔ no new mechanism for the correction
   ⭐⭐⭐ B ESTABLISHES IDENTITY · A ESTABLISHES TEXT. B may change state·depth·who·what+pin;
     ⛔⛔ NEVER `span` (not even to ADD one — a supplied span is NEW MATERIAL, not provenance) and
     ⛔ never `how-meant`
   ⭐⭐ ⇒ IF A SPAN EXISTS, ONLY MECHANICAL VERIFICATION PUT IT THERE ⇒ verified-ness is DERIVABLE FROM
     EXISTENCE ⇒ ⛔ NO marker field, and "may not rewrite a verified span" becomes ENFORCEABLE
   ⭐ Retraction is WHOLESALE via `state → none` (audit `before` preserves every hop); ⛔ never hop deletion
   ⭐⭐ THE PIN IS THE SNAPSHOT — this schema already pins that way twice (`value_at_warrant`,
     `before`/`after`) ⇒ ⛔ no new hash, no new pin field
   ⭐ Route B verifies REFERENTIAL INTEGRITY + PRECONDITIONS ONLY, ⛔ never the claim ⇒ it is TESTIMONY:
     trustworthy by ATTRIBUTION + AUDITABILITY, ⛔ not by verification
   ⭐⭐⭐ THE ANTI-LAUNDERING INVARIANT: Route B changes PERMISSION (both directions) and can NEVER change
     SUPPORT. ⛔ No declaration makes a span verify. Red-proof: an act must never move a warrant count
   ⭐⭐ TWO RECEIPTS, ⛔ never interchangeable: `log_memory_warrants` = mechanical support ·
     `log_memory_changes` = attributed testimony
⭐⭐⭐ RUN PROVENANCE — THREE THINGS, THREE PLACES, ⛔ and the origin carries NO run id:
   ① what the origin IS = txn_memories state+hops · ② how it CHANGED = log_memory_changes before/after ·
   ③ WHICH RUN caused it = log_memory_changes.SOURCE (the occasion)
   ⛔ `related_id` is OCCUPIED — *"the other row in the transition"*, a MEMORY id, 135/137 populated
   ✅ `source` ALREADY carries the occasion OF THE CHANGE and is already used that way (model-tool ×42,
     conversation:<id> ×7) — the same mechanism+occasion string `reconcile:<act>` uses ⇒ NO NEW COLUMN
   ⭐⭐ RECEIPT→RUN scales, RUN→ARTEFACT does not: `log_conversation_revisits.wrote_memory_id` is a
     SINGLE uuid ⇒ a run that touched two memories can record only one
   ⭐⭐⭐ A RUN MAY BE THE OCCASION; ⛔ IT MAY NEVER BE THE AUTHORITY. Run discovers + MECHANICAL content
     = fine; run supplies identity/pin = ⛔ Route C AND self-authorising
   ⭐⭐ Run discovers, account declares ⇒ TWO AMENDMENTS, not one (mechanical@pass, then declared@act)
     ⇒ ⛔ no field ever holds two occasions
   ⚠️⚠️ PRE-EXISTING GAP FOUND: `MECHANISM` has NO `dreaming`/`reflection` entry ⇒ the first row either
     writes lands in `unknown`, which its own check calls a DEFECT. ⏸ M2 NEEDS THIS REGARDLESS OF ORIGIN
⚠️ ⛔ ORIGIN COMPLETE ≠ M2 MAY COMMIT. 0 of 82 slots declared ⇒ checkKind DEFERs on every slot.
   ⭐ What origin DOES unblock: M2-6 may now be wired without baking delivery into formation — ⛔ still unwired

✅ 4 MORE RULED (Ote): ① not-examined permissiveness ACCEPTED — ⭐ and the schema does NOT discharge
   PRODUCER COVERAGE, which stays a separate obligation · ② dedicated SAME-ROW JSONB hops, for the
   state↔hops invariant ⛔ not convenience · ③ names/spellings OPEN · ④ Route B stays a SEPARATE ACT
⭐⭐ STATES × CARDINALITY + ROUTE B DERIVED → `DERIVATION_SOTERA_ORIGIN_STATES_AND_ROUTE_B`
   ⭐⭐⭐ THREE STATES, ⛔ NOT FOUR — `unknown`/`known` are the SAME epistemic position and differ only
     in hop CARDINALITY ⇒ keeping both is TWO SPELLINGS OF ONE FACT (the argument that already killed
     `reported`-as-inner-modality). ⏸ THIS REVISES A VOCABULARY OTE ACCEPTED — his ruling needed
   ⭐ `not-examined` · `none` · `re-presented`; unknown ⟺ re-presented+0 hops (⭐ the ORDINARY Route A
     outcome), known ⟺ re-presented+≥1 hop
   ⚠️ MY OWN CORRECTION: `depth` is CHAIN-LEVEL, ⛔ not per-hop ⇒ a hop has FOUR fields (who · what ·
     span · how-meant). Depth is NOT redundant with cardinality: cardinality = how many recorded,
     depth = whether that is all there is
   ⭐ 3 same-row CHECKs: ① slot gate (031's shape) · ② only re-presented may carry hops · ③ ⛔ the
     contradiction `re-presented + 0 hops + exhaustive`
   ⭐⭐⭐ ROUTE B IS AN AMENDMENT — all 3 precedents CREATE; Route B AMENDS an existing row ⇒ its record
     is a `log_memory_changes` entry (137 rows, before/after/actor/reason/source, and ⭐ `forget` has
     NO after — the log already distinguishes absence from emptiness)
   ⭐⭐ It would be the FIRST caller ever to give `actor` a real value (137/137 are 'system')
   ⭐⭐ Naming an inner speaker IS naming a person not present ⇒ REFERENCE `person-service` (two-phase,
     confirm only in a LATER turn), ⛔ Route B may NEVER mint a person
   ⭐⭐⭐ DERIVED SAFETY: `none → re-presented` on a SLOTTED row is REFUSED by CHECK ① ⇒ discovering that
     material was forwarded CANNOT silently coexist with the fact slot built on it
   ⛔ Route B may not rewrite a VERIFIED span (A writes span; B writes who/what/pin)

⚠️ TWO OF MY CLAIMS CORRECTED: a trigger is NOT unprecedented here (`txn_intentions_touch_trg` exists —
   but ⭐ no trigger has ever enforced an INVARIANT); and the `evidence` CLOBBER risk is ⛔ NOT
   demonstrated — `lineageFor` MERGES via withDerivedFrom and preserves incoming evidence

① COMPAT      ⛔⛔ THE GATE GOES VACUOUS. `txn_memories_modality_slot_ck` keys on `modality`; stop
              writing `reported` and every re-presented row is NULL, which SATISFIES the CHECK.
              ⭐ 4 enforcement sites, not 1: the DB · slotViolation() · ownership-boundary:199 ·
              ⚠️ memory-lineage-check:73 (a source scan) ⇒ ⛔ origin may NOT ride on source/lineage
              ⭐ Existing data costs NOTHING (0 rows carry `reported`, 0 carry a chain) — the whole
              risk is FORWARD. ⭐⭐⭐ A CHECK CANNOT CROSS TABLES ⇒ if the DB is to keep enforcing,
              ORIGIN MUST BE SAME-ROW; a normalized table forces a trigger or the seam alone
② DISCARD     ⭐⭐⭐ THE REASON ALREADY EXISTS — `dreaming-verify.js` emits THREE (`malformed cite` ·
              `root not in evidence` · `span mismatch`) and the LEDGER drops them into a bare integer.
              ⇒ ⭐ minimum vocabulary = the producer's three, CARRIED THROUGH, ⛔ none invented.
              ⛔ a 4th ("no span exists") only when a producer emits it. ⚠️ 0 rows, 0 readers, 0 real
              discards ⇒ ⭐ inventing costs a dead column; DROPPING costs an unrecoverable fact
③ ROUTE B     ⭐⭐⭐ NOT the declaration VERB — SAME PATTERN, DIFFERENT ACT. A question is SUBJECT-FREE
              (which is WHY she has standing); an origin is entirely SUBJECT-BEARING ⇒ opposite sides
              of the line the standing derivation drew. Also type-vs-instance · supersede-vs-correct ·
              DEFER-vs-misattribute. ⭐ 047 SAYS SO: *"no subject, no room and no value — which is what
              makes it safe as a persona-global object"* ⇒ ⛔ an origin cannot live there.
              ⭐ We are instantiating an existing pattern for the 4th time, ⛔ not inventing a mechanism

STANDING      ⭐⭐⭐ A QUESTION IS SUBJECT-FREE ⇒ declaring one asserts NOTHING about any person
              ⇒ two authorities, separated by WHAT THE ACT ASSERTS, ⛔ not by whose slot it is:
                 define her own cognitive contract (a QUESTION) | assert a fact (a VALUE)
              ⚠️ subject-free in CONTENT, ⛔ NOT in EFFECT — a question constrains future answers
              ⭐ safe because M2-10 locked: immutable · repoint-not-edit · existing memories NEVER
                re-validated ⇒ a bad question cannot reach backwards
              ⛔ Sotera's identity NEVER depends on room, interface, or whether the other party
                has an account. ⭐ The full 9-way distinction is in §3 — it is FOUNDATIONAL
```

---

# 3 · ✅ THE THREE RULINGS — ⭐ ALL THREE LOCKED BY OTE 2026-09-03

⭐ Evidence: `DERIVATION_SOTERA_OWNERSHIP_FORWARDING_ACCOUNTSHELL`. ⛔ Do not re-litigate.

| **① SLOT OWNERSHIP** | ✅ **LOCKED — ⛔ do NOT add `mst_slots.author`.** A slot is a durable CONCEPT IDENTITY; ownership belongs to the authored memory ACT. `txn_memories.author` **is** the ownership mechanism. ⭐⭐ Decisive live proof: `how_I_see_him` = **author/owner `Sotera` · subject `Ote` · formation `agent_dev`** — ⛔ and none of those is the slot's. ⏸ Revisit **only** if a real consumer needs *"whose cognitive structure is this?"* — ⛔ no speculative column |
| --- | --- |
| **② FORWARDED ORIGIN** | ✅ **finding LOCKED · implementation DEFERRED.** ⛔ `source` must NOT be overloaded — it is **mechanism + writing occasion**, ⛔ not origin. ⭐ Origin **is** the one genuinely missing axis and must represent a **non-local** origin. ⛔ **Do not build the field.** ▶ Derive the contract across the six cases first → `DERIVATION_SOTERA_ORIGIN_CONTRACT` (done 14:07). ⭐ **Constraint: origin stays SEPARATE from `source`** |
| **③ ACCOUNT SHELL** | ✅ **LOCKED — ⛔ REJECTED. Do not create account shells.** `person_id IS NULL` cannot be repurposed: it already means *"not established"* (`mina`), and later linking would destroy the distinction. ⭐ **An account is an operational ROOM/INTERFACE holder, ⛔ NOT the identity primitive.** ⏸ If a non-account counterparty ever needs representing, derive it on the **person/interface** side — ⛔ never by manufacturing accounts |

## ⭐⭐⭐ THE HARD INVARIANT — ⭐ FOUNDATIONAL TO SOTERA'S IDENTITY MODEL (Ote, 2026-09-03)

```
OWNER ≠ SUBJECT ≠ SPEAKER ≠ ORIGIN ≠ FORMATION CONTEXT ≠ REACHABILITY ≠ INTERFACE ≠ ACCOUNT ≠ PERSON

Sotera's identity is independent of interface, room, account, and formation context.
```

⭐ **`how_I_see_him` is the CANONICAL LIVE PROOF that these axes legitimately diverge.** ⛔ Keep it.

⭐⭐ **THE THREE FACTS THAT MADE THESE ANSWERABLE — all measured, all new:**
- **five authorship axes exist; ONE works.** `author` 125/125 · `actor` 137/137 but **a single constant** ·
  `created_by_user_id` **0 of 5** · `declared_by` 0 rows · `mst_slots` no column.
  ⭐ The one that works is declared **at a seam every writer passes**, by the caller that knows the occasion,
  with a safe default. ⇒ **⛔ don't add a fifth on speculation.**
- ⭐⭐⭐ **CASE F ALREADY HAPPENED.** `here he come. "Hi, Sotera. I'm Cogito. I'm your uncle."` — typed by Ote,
  **quoting somebody else** — became `preferred_name = "Cogito"` **on HIS account**. Delivery was taken as
  formation AND as speaker. ⚠️ The refusal built for it (`relayedSpeech`) has **never fired: 0 rows in
  `log_memory_refusals`** — ⛔ the clean corpus is not evidence the boundary works.
- ⚠️ **`resolveFormationContext()` returns the DELIVERY room by construction** (it walks
  `source_message_id → conversation → user_id`). ⓘ 84/84 rows are ordinary today, so it is not a live bug —
  ⛔ but it is the exact line that would absorb forwarded material into the deliverer's room.

⚠️ **TWO OF MY OWN FIGURES CORRECTED THERE:** *"82 slots · 773 writes · max 168"* was **72% `zz_` probe
traffic** — the honest figure is **72 real slots · 220 writes · max 65** (the conclusion survives, the
number did not). And *"9 accounts → 4 persons"* undercounted: there are **5 persons**, and the fifth is
the whole of finding ③.

## ⭐⭐ THE DECLARATION VERB — DERIVED 16:19 → `DERIVATION_SOTERA_DECLARATION_VERB`

```
⏸ STATUS       semantics DERIVED, ⛔ NOT ratified · ⛔ NOT built · ⛔ STILL THE M2 BLOCKER
⭐⭐⭐ THE SPLIT  DECLARE (a subject-free DEFINITION) ≠ BIND (point a room-scoped SLOT at one).
               047 already built BOTH objects ⇒ TWO ACTS.
⭐⭐ AND THE RISK IS IN **BIND**, ⛔ NOT DECLARE — a slot was minted get-or-create from a LABEL by a
   component that "must never fail a write" and "degrades silently" ⇒ nothing ever interpreted it.
   M2-10's "never infer a question from a slot/memory/label/evidence/historical use" is a
   constraint on BIND. ⚠️ And §9.2: the SAFE half is fully audited, the DANGEROUS half is NOT
STANDING     DECLARE = ⭐ Sotera AND the account (Ote already ruled: authority over the subject-free
   cognitive contract). ⚠️ OPPOSITE of the origin verb, whose authorities are DISJOINT
   BIND = first-bind (fills a NON-CLAIM ⇒ ESTABLISH-shaped) vs rebind (contradicts ⇒ CORRECT-shaped)
⭐⭐⭐ SELF-AUTHORISATION IS THE CENTRAL HAZARD: if Sotera may declare and Dreaming is Sotera, what
   stops Dreaming declaring the question it needs to commit? ⛔ Withholding the OFFER is worthless —
   measured: a withheld tool was called 4× across 3 days ⇒ ⭐ ENFORCE AT ADMISSION.
   ⭐ THE RULE: *the act that declares must not be the act that needs it* ⇒ a question declared in
   occasion X may not be consumed by occasion X ⇒ ⚠️ the declaration must record its OCCASION
   (047 has NO such column), and enforcement goes on the CONSUMER side (ONE gate, not N callers)
⛔ NO COMBINED DECLARE+BIND OPERATION — one call that authors a permission AND applies it IS the
   self-authorisation shape. ⭐ The separation is the gate, ⛔ not ergonomics
⭐ IMMUTABLE ⇒ no UPDATE path; "changing a question" = new definition + rebind
⭐⭐⭐ ⚠️ REPOINTING SILENTLY REWRITES HISTORY: M2-10 stops RE-VALIDATION but not MISREADING — after a
   repoint, "what question does this row answer?" resolves to the CURRENT definition
   ⇒ AN ADMITTED MEMORY MUST RECORD THE QUESTION ID IT WAS ADMITTED UNDER (pin by snapshot, like
   value_at_warrant). ⛔ And `supersedes_id` is a LINEAGE link, ⛔ NEVER a redirect
⭐ AUTHORIZES EXACTLY ONE THING: checkKind may return ALLOW. ⛔ NOT the write — every other gate stands
⚠️⚠️ THREE PIECES MISSING, NOT ONE: ① DECLARE ② BIND ③ **RESOLVE question_id → slotKind — UNBUILT AND
   UNSPECIFIED.** `kindPreconditionFor` reads `slot?.kind`; ⛔ mst_slots has NO kind column and
   NOTHING in the repo reads question_id ⇒ a perfect DECLARE+BIND would STILL DEFER on every write,
   and EVERY TEST WOULD STAY GREEN because 100% DEFER is the current expected state
⭐⭐⭐ ⇒ RP-D0 IS MANDATORY AND FIRST: DECLARE → BIND → checkKind must ALLOW. ⛔ Until it passes every
   other proof is VACUOUS. ⓘ Only FOUR checks are registered (nonempty · single-line ·
   no-trailing-ellipsis · is-iso-date) — a definition can express very little today
✅ 6 RULED: ① DECLARE≠BIND YES · ② self-authorisation YES · ③ question_id_at_admission YES ·
   ④ BIND audit DERIVE-FIRST · ⑤ RESOLVE is IN SCOPE · ⑥ BIND standing DERIVE (⛔ no analogy to Origin)
```

## ⭐⭐ BIND · RESOLVE · ADMISSION — DERIVED 16:30 → `DERIVATION_SOTERA_BIND_RESOLVE_ADMISSION`

```
⚠️⚠️ §0 A CORRECTION TO RULING ②, WHICH OTE ALREADY RATIFIED: a declaration only becomes consumable
   when it is BOUND ⇒ a definition declared LAST WEEK could be BOUND MID-PASS by the pass that needs
   it. ⇒ ⭐⭐⭐ THE RULE MUST COVER BOTH ACTS: neither the DECLARE nor the BIND may share the consuming
   occasion. ⭐ BIND is the one that matters — BIND is what makes a definition OPERATIVE
⭐⭐⭐ BIND STANDING — the obvious route is CLOSED by ruling ①: a slot HAS NO OWNER ⇒ standing cannot
   be derived from slot ownership
⭐ BIND asserts "this ADDRESS means that question" ⇒ SUBJECT-FREE IN CONTENT, ROOM-SCOPED IN EFFECT
   ⇒ a THIRD shape: ⛔ neither DECLARE nor CORRECT. Ote was right that the analogy would not carry
⭐⭐⭐ THE REAL DISCRIMINATOR IS JUDGEMENT vs TESTIMONY, ⛔ NOT WHO. ⓘ 82 of 82 slots minted by
   `reconcileFact` from a LABEL NOBODY INTERPRETED ⇒ ⛔ NOT ONE SLOT IN THE CORPUS HAS A DELIBERATELY
   AUTHORED ADDRESS ⇒ every BIND available today is inference-shaped, which M2-10 forbids REGARDLESS
   OF WHO PERFORMS IT ⇒ ⭐⭐ STANDING IS NOT THE BINDING CONSTRAINT — EVIDENCE IS
⭐ TWO ROUTES: B-i the address was AUTHORED (⛔ no writer does this today) · B-ii a deliberate later
   act with the NOT-PRESENT discipline (person-service's propose/confirm), audited, ⛔ never inferred
⭐⭐ STANDING for B-ii: Sotera (her structure) AND the account — and ⭐ for a label-minted slot THE
   ACCOUNT'S IS THE NON-INFERENTIAL ONE: the label came from THEIR words
⭐⭐ REBIND does NOT need the operator — ruling ③ REMOVED the retroactive damage (a rebind can no
   longer rewrite history) ⇒ what it needs is STANDING + not-present discipline + AN AUDIT: it must
   be unable to happen SILENTLY, ⛔ not escalated
⭐ RESOLVE: authoritative = EXACTLY the row question_id points at; slotKind = its `question_key`
   ⭐⭐ ⛔ RESOLVE DOES NOT FOLLOW `supersedes_id` ⇒ supersession alone changes NOTHING operative;
   only a REBIND makes a new definition live. ⭐ Declaring cannot change behaviour; only binding can
   ⭐ "missing definition" is IMPOSSIBLE — mst_slots_question_id_fkey has NO ON DELETE clause
   ⭐⭐ RESOLVE returns TWO things: question_key → checkKind · checks[] → evaluate. ⛔ Never conflate
   ⚠️ GAP: nothing validates that a CLAIM's kind is a declared question key ⇒ "no kind" and "a kind
   nobody declared" collapse into one outcome
⚠️⚠️ THE ADMISSION BOUNDARY — THERE ISN'T ONE. `kindPreconditionFor` has ZERO callers.
   THREE write paths into txn_memories, and TWO BYPASS THE STORE (lesson-host ×2, direct INSERT, no
   gates) — and one of them writes SLOT-SHAPED rows (entity='sotera', attribute='lesson', no slot_id)
⭐⭐⭐ AND IT IS BIGGER: **49 of 104 slot-shaped rows have NO slot_id** (doc: 34/34 have none) because
   the slot store DEGRADES SILENTLY ⇒ A ROW CAN BE SLOT-SHAPED WITHOUT HAVING A SLOT, and a row with
   no slot can never carry a question
⏸⏸ ⇒ THE TENSION, BEFORE ANY FIELD IS ADDED: the gate says *"this binds EVERY writer"* — but once
   wired, either ⓐ those 49 DEFER (⛔ the doc: class can no longer write slot-shaped rows) or
   ⓑ they are EXEMPT (⛔ the stated intent is false). ⭐ THIS is what the trace was for
⭐ CAPTURE question_id_at_admission WHERE THE GATE SUCCEEDS, in the SAME statement as the row —
   ⛔ never looked up later (a later read resolves to whatever the slot points at NOW)
⭐ AND ITS NULL MUST MEAN EXACTLY ONE THING — *no kind gate was applied* — ⛔ never "admitted under the
   slot's current question". This store has already paid for a NULL that meant two things (029)
⛔ BIND AUDIT: no existing structure can take it honestly — log_memory_changes.memory_id is NOT NULL ·
   log_user/config_changes are about other things · mst_slots.evidence would be an audit INSIDE the
   mutable object it audits. ⏸ Storage home stays Ote's, as ruled
✅ 6 MORE RULED: self-authorisation covers DECLARE+BIND · occasion REQUIRED · BIND standing =
   Sotera + account · ⭐ STANDING DOES NOT SUBSTITUTE FOR EVIDENCE · rebind ⛔ does NOT require the
   operator · rebind needs standing + not-present discipline + AUDIT
⏸ OPEN: claim-kind vocabulary validation · the BIND audit STORAGE HOME
```

## ⭐⭐ SLOTLESS ROWS · WRITE PATHS — DERIVED 16:46 → `DERIVATION_SOTERA_SLOTLESS_AND_WRITE_PATHS`

```
⚠️⚠️ THREE CORRECTIONS TO MY OWN CLAIMS:
   ① "THREE write paths" was ⛔ INCOMPLETE — I scoped the grep to Backend/.
     `test/maintenance/seed-decisions.mjs` raw-INSERTs and wrote **34 of 125 rows (27%)**
   ② the slotless `preferred_name` rows are ⛔ NOT an accidental bypass — the code EXCLUDES them
     deliberately: *"identity is owned by the Identity Resolver, not the generic slot reconcile"*,
     and ⓘ namespace='identity' holds exactly those 11 rows
   ③ doc:'s 2-rows-per-address is ⛔ NOT duplicate live claims — ⓘ 17 addresses × 2 ROOMS, one live
     per room, 0 supersedes. Correct behaviour
⭐⭐⭐ THE META-FINDING: "slot-shaped" is an ARTEFACT OF THE TEST. `slotted()` ORs three columns and
   answers "is anything in them?", ⛔ not "does this row make a property CLAIM?" ⇒ of the 49, **45
   carry a value and 4 do not** ⇒ the population was NEVER one thing, and classifying by the
   implementation predicate would have produced exactly the false dichotomy Ote refused
⭐⭐ THREE SEMANTIC CLASSES:
   A · IDENTITY (11, namespace='identity') — ⛔ OUT OF THE DOMAIN BY DESIGN, declared in code
   B · PROJECT-DECISION (34, doc:) — ⭐⭐⭐ IN THE DOMAIN AND BYPASSING IT. seed-decisions is
     idempotent by (user_id, entity, attribute) IN RAW SQL — the mst_slots unique key re-expressed —
     and carries `evidence->>'kind'` — a PRIVATE KIND VOCABULARY. ⇒ slot identity re-implemented
     TWICE, and neither is the one the gate reads
   C · LESSON/DECLINED (4) — ⭐ ADDRESSED BUT NOT VALUED (value NULL): entity/attribute used as a TAG.
     A lesson ACCUMULATES ⇒ out by SHAPE, ⛔ not a gate bypass — ⚠️ but a representation smell
⭐⭐⭐ ⇒ "BINDS EVERY WRITER" NEEDS A **DOMAIN**, ⛔ NOT AN EXEMPTION LIST:
   *the kind gate governs a write that ASSERTS A VALUE AT AN ADDRESS IN A SLOT-GOVERNED NAMESPACE*
   ⇒ ⭐ the original dichotomy DISSOLVES: 45 make claims, 11 of those are owned elsewhere, 34 are in
   the domain and bypassing. ⛔ Neither "all 49 defer" nor "the 49 are exceptions" was right
⭐ ADMISSION CAN ONLY BE CAPTURED IN `reconcileFact` — the ONLY method that resolves a slot
⭐ NULL on question_id_at_admission keeps ONE meaning (*no kind gate applied*) — now true of THREE
   stated situations: predates the gate · outside the domain · a bypass
⭐⭐ RP-T1 TEMPORAL PROOF SPECIFIED (Ote's #8): A → bind → admit M → B → M still adheres to A, new
   admissions use B. ⭐ It must exercise EVERY reader of a historical admission — a field written and
   read by nobody is the `actor='system'` failure (137/137, one value, no reader)
✅ ALL 4 RULED: A out by design · B a GENUINE DEFECT · C out by shape · ⭐ DOMAIN STATEMENT ADOPTED:
   *the kind gate governs a write that ASSERTS A VALUE AT AN ADDRESS IN A SLOT-GOVERNED NAMESPACE*
```

## ⭐⭐ `project-decision` AS A SEMANTIC CLASS — DERIVED 17:06 → `DERIVATION_SOTERA_PROJECT_DECISION_CLASS`

```
⭐⭐ MEASURED: THE VALUE **IS** THE STATUS — value = evidence->>'status' on EVERY row, from a CLOSED
   4-value vocabulary (shipped ×18 · frozen ×8 · deferred ×6 · open ×2)
⭐ THE QUESTION: "what is the current STATUS of decision X?" ⛔ NOT "what was decided" (that lives in
   `content` + the pinned doc:<path>@<sha>). ⇒ the cleanest slot question in the corpus
⭐⭐⭐ BUT THE ADDRESS IS **INVERTED** — and that IS the defect:
     user / preferred_name / "Hermes"       entity = SUBJECT · attribute = PROPERTY
     project-decision / okf-export / "…"    entity = TYPE    · attribute = SUBJECT
   ⇒ ⭐⭐ THE PROPERTY NAME (`status`) APPEARS NOWHERE IN THE ADDRESS — which is exactly WHY the writer
   needed a private `evidence->>'kind'`: the address does not say what is being asked
   ⓘ Distribution proves it: `user` = 43 attributes / 60 rows (one subject, many properties) ·
   `project-decision` = 17 attributes / 34 rows (ONE property, many subjects)
⭐ REPLACE, ⛔ not accumulate (a decision has ONE current status) — ⚠️ but 0 addresses have 2 values, so
   replacement is UNEXERCISED; the semantic argument stands alone, the data neither supports nor denies
⭐ SUBJECT IS A THIRD CLASS: an ARTEFACT (not a person, not her own practice) ⇒ correctly NO
   subject_person_id — ⚠️ and there is NO artefact-subject axis at all; identity survives only in the slug
⚠️ AND THE FOUR "KINDS" (fact/note/stance/practice) ARE **NOT A COLUMN** — kind = semantic|identity (a
   NAMESPACE axis) · tier = hot|warm|cold (RETENTION) · stance lives in txn_relational_records ·
   practice lives in the lesson rows. ⇒ "does an existing kind cover it?" cannot be answered by lookup
⭐⭐⭐ ⇒ IT NEEDS NO NEW SEMANTIC CATEGORY. **It is a correctly-shaped FACT with a MALFORMED ADDRESS.**
   canonical: entity = <the decision> · attribute = `status` · value = deferred ⇒ ⭐ the private
   evidence kind becomes UNNECESSARY, because the address then says what it asks
⚠️⚠️ ⇒ BUT THE REPAIR IS A RE-ADDRESSING OF 34 LIVE ROWS — the "rewriting history" class ⇒ ⏸ A SEPARATE
   RULED ACT, ⛔ never a side effect of canonicalizing a writer. (doc: provenance is unaffected; the
   seeder's idempotence key CHANGES MEANING and would create a second population)
⭐⭐⭐ FIRST REAL DEMAND FOR A CHECK THE REGISTRY LACKS: an ENUMERATION check. ⓘ Registered = nonempty ·
   single-line · no-trailing-ellipsis · is-iso-date. ⛔ Must NOT be met by loosening the registry
   (*"a definition cannot invent a check by naming one"*) ⚠️ and a PARAMETERISED check is a new shape —
   every existing check is NULLARY over the value
⭐ CANONICAL WRITER: registration and slot resolution are ORTHOGONAL — `reconcile:`'s slot-shaped row
   DOES carry a slot_id ⇒ ⛔ "it's a maintenance script" is not a reason to bypass reconcileFact
✅ ALL 5 RULED: ① the defect IS the address · ② ⛔ do NOT rewrite the 34 rows now · ③ parameterised
   enum YES in principle, contract to be derived · ④ canonical writer = reconcileFact · ⑤ artefact
   subject = a RECORDED GAP, ⛔ no schema
⭐ AND THE GENERAL PRINCIPLE OTE LOCKED: **physical column shape does not determine semantic shape**
```

## ⭐⭐ LEGACY DECISIONS · THE ENUM CHECK — DERIVED 17:12 → `DERIVATION_SOTERA_LEGACY_DECISIONS_AND_ENUM_CHECK`

```
⚠️⚠️ A.0 TRACING THE READER FOUND AN ARGUMENT **FOR** THE CURRENT ADDRESSING. `list_decisions` already
   reads the semantics right (`attribute AS key, value AS status`) ⇒ ⭐ the inversion was never a
   misunderstanding; the READER COMPENSATES BY ALIASING. ⛔ BUT its stated safety boundary — *"ONE
   ENTITY … so it cannot become a general memory reader by accident"* — DEPENDS ON THE INVERSION.
   Canonical addressing makes every decision its own entity ⇒ ⛔ THE CONTAINMENT PREDICATE VANISHES
⭐⭐ A.0b THE FIX THAT USES AN EXISTING AXIS: `namespace` (already governs `identity`) ⇒ canonical +
   contained = namespace=<decisions> · entity=<the decision> · attribute=status. ⏸ An option, ⛔ not a
   decision
⭐ A.1 the 34 rows READ SAFELY and are untouched — the kind gate is a WRITE precondition
⭐ A.2 Dreaming may use them: they carry a PINNED doc:<path>@<sha> + verbatim quote ⇒ better-attested
   than most of the corpus. ⛔ A.3 but they can NEVER pass kind admission as they stand (no slot) ⇒
   permanently *no kind gate applied* — one of NULL's three stated situations, ⛔ not a defect
⚠️⚠️ A.4 THE DANGEROUS CASE: a corrected seeder's key MATCHES NOTHING under canonical addressing ⇒ it
   INSERTS ⇒ **TWO LIVE CLAIMS about one decision, NO key collision** — ⭐ the keys don't collide, the
   MEANING does — and SILENTLY, because list_decisions would show only the old rows
⭐⭐ A.5 ⇒ ⛔ RUNNING BOTH IS NOT AN OPTION. Either FREEZE the old (canonical for NEW decisions only, and
   list_decisions must then read BOTH) or MIGRATE as a ruled act
⭐ A.6 MIGRATION = a RECONCILIATION (the mechanism exists, 3 rows of precedent), occasioned by a named
   ruling, SUPERSEDING each old row with a canonical one carrying the same pin ⇒ old row preserved,
   lineage walkable. ⛔ NEVER an in-place UPDATE of the address
⭐ A.7 `evidence.kind='project-decision'` stays HISTORICAL PROVENANCE ONLY — ⛔ never promoted into the
   declared vocabulary, or a private vocabulary gets legitimised after the fact
⭐⭐⭐ B.0 THE ENUM DESIGN MOVE: ⛔ DON'T PARAMETERISE THE CHECK — GIVE THE **DEFINITION** A DATA FIELD.
   Encoding params in an identifier needs A PARSER INSIDE THE CHECK ID, which is how a predicate sneaks
   back in ⇒ `checks[]` stays PURE IDENTIFIERS; the values are DATA on the definition; the check is CODE
⭐⭐⭐ B.1 THE LINE THAT KEEPS DEFINITIONS FROM BECOMING CODE: *a parameter must be a FINITE LIST OF
   LITERAL VALUES compared by EQUALITY. Anything needing INTERPRETATION (a pattern, a range, an
   expression) is A NEW REGISTERED CHECK, ⛔ not a richer parameter*
⭐ B.2 immutable falls out FREE (the definition is immutable) · changing the set = new definition +
   rebind · ⭐⭐ and ruling ③ means adding a value RE-INTERPRETS NOTHING · empty set ⇒ ⛔ REFUSED
⚠️⚠️ B.3 COMPARISON POLICY IS A SEMANTIC CHOICE AND THE CORPUS ALREADY DISAGREES: values are lowercase
   but list_decisions filters `lower(value) = :want` ⇒ the reader is case-INSENSITIVE, an exact check
   would not be ⇒ ⛔ the policy must be part of the check's REGISTERED IDENTITY (two checks), ⛔ never a
   flag — a flag is a parameter that gets INTERPRETED, which B.1 forbids
✅ ALL 6 LOCKED: canonical address + namespace containment · MIGRATE (⛔ not freeze) · migration =
   RECONCILIATION with supersedes_id, per-room, reader changed first/atomically · permitted values =
   DATA on the definition · the LITERAL-VALUE boundary · comparison policy = CHECK IDENTITY
```

## ⭐⭐ THE `decisions` NAMESPACE CONTRACT — DERIVED 17:19 → `DERIVATION_SOTERA_NAMESPACE_CONTRACT`

```
⚠️⚠️ THE PRECEDENT IS WEAKER THAN IT LOOKED — 4 MEASURED FACTS:
   ① `namespace` is an OPT-IN FILTER — every read spells `...(namespace ? {namespace} : {})` ⇒ ⭐ a
     reader that does not ask GETS EVERY NAMESPACE. The default is INCLUDE
   ② the containment of `identity` is a HAND-WRITTEN JS `.filter()` after an unfiltered query, ⛔ not
     the namespace mechanism
   ③ a write into `identity` via the generic path is WARNED, ⛔ NOT REFUSED (*"warn (don't throw)"*)
   ④ ⭐⭐⭐ AND `identity` NAMES TWO DIFFERENT THINGS ON TWO AXES, DISJOINT POPULATIONS:
       kind='identity'      3 rows · namespace=default · persona_global · WHO SOTERA IS
       namespace='identity' 11 rows · kind=semantic    · room           · WHAT A PERSON IS CALLED
     ⇒ ⛔ *"do it like identity"* IS NOT AVAILABLE AS AN ANSWER — copying it produces exactly the
     "technical replacement" Ote forbade
⭐⭐⭐ AND OTE'S OWN ADOPTED DOMAIN STATEMENT ALREADY REQUIRES THIS: *"a SLOT-GOVERNED namespace"*
   presupposes a DECLARED CLASSIFICATION of namespaces — ⛔ AND NO SUCH LIST EXISTS. ⇒ deriving
   `decisions` forces into existence the thing the domain statement already depends on
⭐⭐ A NAMESPACE IS A SPACE OF ADDRESSES UNDER ONE SEMANTIC CONTRACT, declaring FOUR things:
   ① an OWNER · ② which writers may admit · ③ which gates apply · ④ THE READ DEFAULT.
   ⛔ Not a prefix, ⛔ not a filter — containment is a CONSEQUENCE
⭐⭐ THREE OWNERSHIP SHAPES MEASURED: default = OPEN · identity = a RUNTIME SUBSYSTEM · decisions = an
   OPERATOR REGISTRATION ACT, ⛔ CLOSED TO EVERY RUNTIME WRITER ⇒ a declaration must express
   OWNERSHIP, ⛔ not membership
⭐ WRITERS: only the registration writer — and it must be REFUSED, ⛔ not warned (④ + ③ are the measured
   proof that warnings and withheld offers are not boundaries)
⭐ SCOPE: room-scoped as written; ⛔ THE NAMESPACE MUST NOT DECIDE SCOPE — that rebuilds the 029 collapse
⭐ BIND/RESOLVE: namespace IS in the mst_slots unique key ⇒ part of SLOT IDENTITY ⇒ part of BIND;
   ⛔ NOT part of the question (subject-free) ⇒ RESOLVE is namespace-BLIND.
   ⚠️ ⓘ ALL 82 SLOTS ARE namespace='default' — the key column HAS NEVER VARIED
⭐ ADDRESS, ⛔ not containment — it is in the slot key, so it ADDRESSES; containment follows
⭐⭐⭐ THE READ DEFAULT MUST INVERT: a governed namespace must be EXCLUDED from generic reads and
   included ON REQUEST — ⛔ the opposite of today's spelling
⛔ THE FAILURE TEST — it is a RENAME if: a reader that doesn't ask still gets the rows · a runtime writer
   is only warned · nothing declares an owner/gates · the address still lacks its property name.
   ⭐ The FOURTH is fixed by the canonical address; ⚠️ THE FIRST THREE ARE NOT FIXED BY ADDING A
   NAMESPACE — they are fixed by DECLARING one
✅ ALL 6 LOCKED: identity collision = RECORD ⛔ don't rename · namespace declaration IS part of this
   work · ownership ⛔ not membership · governed namespaces EXCLUDED from generic reads (⚠️ audit the
   readers first) · REFUSE ⛔ not warn · decisions stays ROOM-SCOPED (namespace ≠ scope)
⭐ AND THE THREE DECLARATIONS STAY SEPARATE: NAMESPACE ("what address space?") · QUESTION ("what does
   it ask?") · BIND ("which question applies to this slot?"). ⛔ Namespace is NOT part of the
   subject-free question ⇒ RESOLVE stays NAMESPACE-BLIND and follows exactly the question_id

## ⭐⭐ NAMESPACE DECLARATION + READER AUDIT — DERIVED 17:24 → `DERIVATION_SOTERA_NAMESPACE_DECLARATION_AND_READERS`

```
⚠️⚠️ A THIRD WORD COLLISION, AND I NEARLY ASSERTED THE OPPOSITE: `withoutDecisions()` (3 read sites)
   filters `isDeclineRecord` = entity 'sotera' / attribute 'declined' ⇒ it excludes HER DECLINE RECORDS
   (class C), ⛔ NOT project decisions. "Decisions" there = *her decisions NOT to remember*
   ⇒ ⭐⭐⭐ NAMING THE NEW NAMESPACE `decisions` COLLIDES WITH A LIVE FILTER THAT MEANS SOMETHING ELSE
   ⭐ What survives: class C IS already excluded from generic reads by hand at 3 sites — a FIFTH
   containment-by-hand instance (retention-host says it aloud: *"had to be added at three read sites"*)
⭐⭐ READER AUDIT — project-decision rows TODAY reach: generic recall (search/list/listArchived) ·
   listContradicted/countContradicted · ⭐⭐⭐ AND `reconcileFact`'s findOwnLive({kind:'semantic'}) WITH NO
   NAMESPACE, which JS-filters IDENTITY ONLY ⇒ **THEY ARE SLOT CANDIDATES FOR UNRELATED WRITES**
   ⇒ ⭐ the read-default inversion CLOSES A REAL LATENT CROSS-CONTAMINATION, ⛔ not merely tidies a query
⭐ PER-CLASS READ POLICY: generic recall + internal reconciliation ⇒ EXCLUDE by default · dedicated
   readers ⇒ ASK explicitly · ⭐ AUDIT/LINT ⇒ DELIBERATELY NAMESPACE-BLIND (an audit that cannot see a
   space cannot audit it) — ⚠️ the exception that keeps "excluded by default" honest
⭐ DECLARATION SHAPE: namespace_key · means (human) · owner_kind (open | runtime-subsystem |
   registration-act) · owner · permitted_writers · ⭐⭐ slot_governed (THE DOMAIN STATEMENT'S MISSING
   LIST) · read_default · declared_by/at. ⛔ No scope, no questions, no values
⚠️⚠️ UNDECLARED MUST NOT FAIL CLOSED GLOBALLY — namespace is a STRING, ⛔ not an FK ⇒ undeclared ⇒ reads
   INCLUDE + writers OPEN (flipping either is an OUTAGE, 031's rule) but slot_governed UNKNOWN ⇒ DEFER
⚠️ ⇒ WHICH FORCES: `default` MUST BE DECLARED, or the gate governs NOTHING (all 55 slotted rows and all
   82 slots live there)
⭐⭐⭐ AND THAT IS **NOT A BACKFILL**: a namespace's contract is ALREADY WRITTEN IN CODE (*"the reserved
   identity namespace"*, *"identity is owned by the Identity Resolver"*) ⇒ declaring it TRANSCRIBES a
   stated contract. A slot QUESTION was never stated anywhere — which is exactly why that one cannot be
   backfilled and this one can
⭐ AUTHORITY = THE OPERATOR/ACCOUNT, ⛔ NOT SOTERA — a namespace is an ARCHITECTURAL fact about the
   system, ⛔ not her conceptual vocabulary. Derived from what the act asserts, ⛔ not by analogy
⚠️ IMMUTABLE, but supersession differs: a slot points at a question by FK; a row carries its namespace as
   a STRING ⇒ ⛔ nothing to repoint ⇒ ⏸ must an admitted row record the NAMESPACE CONTRACT it was
   admitted under (as ruling ③ did for the question)? RAISED, ⛔ not answered
✅ 8 LOCKED: undeclared → INCLUDE/OPEN/DEFER · default+identity MUST be declared (a TRANSCRIPTION,
   ⛔ not a backfill) · namespace authority = OPERATOR ⛔ not Sotera · governed ns EXCLUDED from
   generic + internal reads · audit/lint stays NAMESPACE-BLIND · REFUSE at the write seam ·
   namespace ∈ SLOT IDENTITY, ⛔ not the subject-free question
⭐ *"Undeclared does not mean SAFE; it means NOT GOVERNED YET."*

## ⭐⭐ NAME · PINNING · AUTHORITY — DERIVED 17:30 → `DERIVATION_SOTERA_NAMESPACE_NAME_PINNING_AUTHORITY`

```
⭐ THE NAME — 4 criteria: names the ADDRESS SPACE (⛔ not consumer/source/writer/mechanism) · ⛔ not a
   word already on another axis · one word like default/identity · generalises to everything sharing
   the four declared properties
⭐⭐ THE THREE SPACES LINE UP: identity = what a PERSON IS CALLED · default = what is known GENERALLY ·
   ??? = what is true of THE PROJECT ⇒ the missing name is at THAT level, ⛔ not at "decisions", which
   is ONE ADDRESS FAMILY inside it
⭐ CANDIDATES MEASURED in Backend/app: `project` 101 prose but as a quoted identifier ONLY
   'project-decision' ×2 — which DISAPPEARS under canonical addressing ⇒ ⭐⭐ NOT TAKEN AS AN AXIS
   ⛔ decisions (the collision) · ⛔⛔ commitment(s) 21 — M2'S OWN PRODUCT · ⛔ ledger 57 · ⛔ registry 77
   · ⛔ record 258 · ⛔ governance 0 but names the MECHANISM · ⚠️ artefact/artifact — BOTH SPELLINGS live
   ⇒ ⭐⭐ `project` is the ONLY candidate meeting all four — ⚠️ with the honest cost that it is BROAD
⭐⭐⭐ PINNING: **THE ANALOGY WITH RULING ③ FAILS, AND FOR A PRECISE REASON.**
   read_default ⇒ ⛔ MUST BE CURRENT, never pinned (a pinned read policy IS the 029 scope drift)
   slot_governed ⇒ ⭐ ALREADY RECORDED by question_id_at_admission (present = gated · NULL = not) ⇒
     pinning it would be A SECOND SPELLING OF A PINNED FACT
   permitted_writers ⇒ what matters is WHO WROTE IT (author/source/audit), ⛔ not which policy allowed it
   owner/owner_kind ⇒ descriptive, no retroactive force
   ⇒ ⭐⭐⭐ **A QUESTION CHANGES WHAT A ROW MEANS; A NAMESPACE CHANGES WHO MAY ACT AND WHAT IS VISIBLE —
   ⛔ NEITHER IS A PROPERTY OF THE ROW'S MEANING** ⇒ `memory.namespace = X` IS SUFFICIENT
   ⚠️ TRIGGER TO REVISIT: if a namespace property is ever added that changes what a row MEANS
⭐⭐ OWNER vs owner_kind vs permitted_writers = THREE JOBS, ⛔ NOT THREE AUTHORITIES: owner_kind selects
   HOW the authority is CHECKED · owner NAMES the holder · permitted_writers LISTS THE CHANNELS
⭐⭐⭐ AND OTE'S INTUITION IS DERIVED CORRECT: if permitted_writers conferred STANDING, adding a writer
   would GRANT authority — ⭐ exactly the Origin failure (*"an authority handed in as a parameter is an
   authority a caller can get wrong"*) ⇒ it is a MECHANISM list; adding a writer adds a ROUTE, ⛔ not a
   right ⇒ ⭐⭐ NECESSARY BUT NOT SUFFICIENT: a permitted writer running WITHOUT a registration act has
   NO authority. TWO preconditions at the write seam, neither substituting for the other
   ⚠️ And for owner_kind=runtime-subsystem (identity) the two COINCIDE — which is exactly why the
   distinction is INVISIBLE in the only precedent we have
⭐ RP-N11 (behavioural, ⛔ never a grep): governed ns ⇒ generic reader ABSENT · audit reader PRESENT,
   with BOTH positive controls — the generic read DOES return a default row (else "absent" only proves
   the query is broken) and the audit read DOES miss a genuinely absent row (else "present" only proves
   it returns everything unconditionally)
✅ NAMESPACE SEMANTICS **LOCKED** — ⛔ DO NOT REOPEN unless a later derivation exposes an actual
   contradiction: `project` is the namespace · ⛔ no contract pinning · authority = operator/account ·
   owner ≠ permitted_writers · undeclared = INCLUDE/OPEN/DEFER · governed ns need explicit declaration ·
   excluded from generic+internal reads · audit stays BLIND · governed writes need BOTH channel
   permission AND actual authority · namespace ∈ slot identity, ⛔ not question semantics
   ⭐ CANONICAL: namespace=project · entity=okf-export · attribute=status · value=deferred
   ⇒ "decisions" is an ADDRESS FAMILY inside `project`, ⛔ not the namespace

## ⭐⭐ CLAIM-KIND · BIND AUDIT · WHAT IS BLOCKING — DERIVED 17:45 → `DERIVATION_SOTERA_CLAIM_KIND_AND_BIND_AUDIT`

```
⭐⭐⭐ ONLY **TWO** OF THE SIX OPEN ITEMS ARE ON THE M2 PATH: claim-kind validation · the BIND audit home.
   The other FOUR (enum check · class-C · seed repair · legacy migration) are ONE STRAND — the
   `project-decision` cleanup — ⛔ and gate nothing. ⭐ The open list is CONVERGING, not branching
⚠️ A CORRECTION TO MY OWN CLAIM: "no kind" and "an undeclared kind" do NOT collapse into one message —
   checkKind already returns DIFFERENT messages. ⭐ They share the OUTCOME (DEFER), which is correct
⭐⭐ BUT A REAL DISTINCTION IS LOST: claim `person-name` vs slot `preferred-name` (TWO REAL QUESTIONS
   THAT DISAGREE ⇒ rebind) and claim `blorp` (THE MODEL INVENTED A KIND ⇒ the proposal is nonsense)
   produce the SAME message — and the remedies are unrelated
⭐⭐⭐ AND THE SYSTEM IS ALREADY SAFE: slotKind = question_key, so a claim kind that MATCHES is
   necessarily a DECLARED key BY CONSTRUCTION ⇒ ⛔ validation adds NO SAFETY. ⭐ It adds DIAGNOSIS —
   justified because ⓘ 100% of slots DEFER today ⇒ **the entire near-term value of the gate is its
   REFUSAL MESSAGES**
⭐⭐ AND IT BELONGS OUTSIDE checkKind — the gate is PURE; the vocabulary check needs a lookup ⇒ put it at
   the RESOLVE layer, which already reads mst_slot_questions. ⛔ Do not make the pure gate impure
⭐⭐ BIND AUDIT — ⛔ log_memory_changes (memory_id NOT NULL; relaxing it lets a memory-change row exist
   with NO memory) · ⛔ mst_slots.evidence (an audit INSIDE the mutable object it audits) · ⛔ wrong-
   subject logs ⇒ ⭐ a dedicated log is the only honest option
⭐⭐⭐ BUT NOT A GENERAL SLOT-CHANGE LOG — the guarantee differs: BIND changes WHAT MAY BE ADMITTED ⇒ must
   be audited; recordAlias changes only RESOLUTION and is ALREADY self-audited inline
   ({phrase,by,confidence,at}, ⓘ 5 slots); touch is a counter ⇒ ⭐ AUDIT THE BINDING, leave aliases
   ⚠️ Honest note: that makes a THIRD change log — justified ONLY because the SUBJECT differs each time
   (a memory · a warrant · a binding), ⛔ never by convenience
⭐ RP-NQ1/2/3 (namespace ≠ question), each with a control, because every one asserts *"X did not change
   Y"* — the assertion that passes when the probe cannot see Y at all
✅ ALL 4 RULED: claim-kind validation at RESOLVE (diagnosis ⛔ not safety, checkKind stays PURE) ·
   a DEDICATED BINDING log (⛔ not slot_changes; a 3rd change log is fine — the SUBJECTS differ) ·
   RP-NQ1/2/3 · ⭐ THE PROJECT-DECISION STRAND IS SEQUENCED **AFTER M2**

## ⭐⭐⭐ THE M2 CRITICAL PATH — CONSOLIDATED 17:51 → `CONTRACT_SOTERA_M2_CRITICAL_PATH`
## ⛔ SCOPE IS CLOSED. Read that doc first; it consolidates and does NOT extend.

```
DECLARE → BIND → RESOLVE → ADMISSION → question_id_at_admission → red-proofs → isolated E2E → M2 commit
⏸ AFTER M2: enumeration check · class-C representation · seed-decisions repair · legacy migration
⭐⭐ AND A FURTHER REDUCTION: creating the `project` namespace, the READ-DEFAULT INVERSION and
   RP-N1/N10/N11 are ALL POST-M2 ⇒ **exactly ONE namespace declaration is on the path: `default`**
   (all 82 slots + all 55 slotted rows live there; undeclared ⇒ slot_governed UNKNOWN ⇒ DEFER ⇒ the
   gate would govern NOTHING)

⏸⏸ AND SAID PLAINLY — THE CONTRACTS ARE **NOT** ALL FINISHED. THREE SHAPE DECISIONS REMAIN ON THE PATH:
   ① THE OCCASION FIELD — the self-authorisation rule needs the DECLARE and BIND occasions recorded;
     ⓘ 047 has declared_by + declared_at and NO occasion column. The BIND audit carries one by design;
     DECLARE does not
   ② THE NOT-PRESENT DISCIPLINE FOR BIND — ruled in PRINCIPLE, shape NOT derived. ⭐ person-service has
     the pattern (pending map · TTL · *"a confirm is only honoured in a LATER turn"* · ⚠️ a re-proposal
     must NOT reset the clock). ⏸ Reuse or derive a variant?
   ③ DECLARING `default` — ruled required and ruled a TRANSCRIPTION; the declaration object's SHAPE is
     derived but ⛔ not ratified as schema
   ⇒ ⭐ THREE SHAPE DECISIONS, ⛔ NO NEW SEMANTICS. Everything else on the path is ratified

⭐⭐⭐ THE DEFINITION OF DONE, KEPT SEPARATE (Ote's requirement):
   ✅ "semantic contract complete enough to IMPLEMENT"  ⇒ §2, with §3 honest about the gaps
   ⛔ "behaviour DEMONSTRATED by positive-control red-proofs" ⇒ §4, and NONE of it has run
   ⇒ **M2 IS NOT DONE UNTIL THE SECOND IS TRUE**, and ⛔ the two must never be reported as one
⚠️ A GREEN SUITE PROVES NOTHING UNTIL RP-D0 AND RP-W0 HAVE PASSED — the warrant register passes
   VACUOUSLY on 0 rows, the kind register passes VACUOUSLY on 100% DEFER
```

## ⭐⭐⭐ THE THREE REMAINING SHAPES — DERIVED 17:55 → `CONTRACT_SOTERA_M2_THREE_SHAPES`
## ⏸ RATIFY THESE THREE, THEN CROSS THE IMPLEMENTATION BOUNDARY AND BUILD.

```
① DECLARE OCCASION — the invariant is an EQUALITY TEST and nothing more ⇒ ⛔ no FK (occasions live in
   DIFFERENT tables and the rule never RESOLVES one) · ⛔ no type discriminator · ⛔ no timestamp
   (`declared_at` exists and is NOT what the rule needs — "same occasion" is IDENTITY, not ordering)
   ⚠️⚠️ NULLABILITY IS THE WHOLE SAFETY QUESTION: a bypassing run that OMITS it yields NULL (or the
   DEFAULT) and ⛔ THE CHECK PASSES EITHER WAY ⇒ ⭐⭐⭐ A DEFAULT DOES NOT HELP; OMISSION MUST BE
   IMPOSSIBLE
   ⭐ And there is NO "no occasion" case — an operator act's occasion is THE ACT (the reconcile:
   precedent) ⇒ ⛔ no sentinel needed
   ⇒ ⭐ SHAPE: `declared_in_occasion text NOT NULL` ⛔ NO DEFAULT · system-derived · a writer that
   supplies nothing FAILS LOUDLY. ⚠️ Consumer with no occasion ⇒ DEFER (fail closed)

② BIND NOT-PRESENT DISCIPLINE — ⭐ first SEPARATE two rules I had conflated: (a) self-authorisation is
   just shape ① applied to the bind record · (b) the not-present discipline is the one needing a mechanism
   ⛔ person-service's shape is NOT automatically right: its in-memory map + 30-min TTL + 500 cap +
   "a re-proposal must not reset the clock" exist because its proposal is EPHEMERAL CONVERSATIONAL STATE
   ⭐⭐⭐ BIND ALREADY HAS A DURABLE RECORD — the binding audit log ⇒ the pending state should be DURABLE
   AND AUDITABLE, ⛔ not in-memory
   ⭐⭐ AND TWO OF THE THREE MECHANISMS DISSOLVE: ⛔ the TTL (person-service needs one because it has NO
   compare-and-set; BIND HAS `expected-current` ⇒ freshness comes from CAS, ⛔ not a clock) and ⛔ the
   re-proposal rule (there IS no clock). ✅ Only the LATER-OCCASION requirement survives
   ⇒ ⭐ SHAPE: PROPOSE = a binding-log row, ⛔ NO effect on mst_slots · CONFIRM = a row REFERENCING it,
   REFUSED if it shares the proposal's occasion or if expected-current no longer matches. TWO ROWS FOR
   ONE BIND — and that IS the evidence. ⛔ No in-memory state, no TTL, no cap, no clock rule

③ `default` NAMESPACE DECLARATION — transcribing: owner OPEN · writers ALL · ⭐ SLOT-GOVERNED (all 82
   slots + 55 slotted rows) · reads INCLUDE
   ⚠️ THE SMALLEST SHAPE FOR `default` ALONE WOULD DROP THE OWNERSHIP COLUMNS — ⛔ but that builds a
   table that cannot express the NEXT namespace, and Ote ruled ownership is required ⇒ keep them with a
   CHECK making them present exactly when meaningful
   ⇒ namespace_key PK (⛔ NO FK — undeclared must stay permissive) · means · owner_kind CHECK(open |
   runtime-subsystem | registration-act) · owner NULL · permitted_writers text[] NULL · slot_governed
   bool · read_default CHECK(include | exclude-unless-requested) · declared_by/at
   + CHECK( (owner_kind='open') = (owner IS NULL AND permitted_writers IS NULL) )
   ⭐⭐ permitted_writers is NULL for OPEN — ⛔ not an empty array (which would read "nobody may write",
   the OPPOSITE of the truth) and ⛔ not a wildcard
   ⛔ ONE TABLE, ONE ROW: `default`. No scope, no `project`, no `identity`, no read-behaviour change
```

## ⭐⭐⭐ M2 IS BEING BUILT — CROSSED THE IMPLEMENTATION BOUNDARY 18:17

```
✅ MIGRATION 048 APPLIED — 6 violations refused
   · mst_slot_questions.declared_in_occasion text NOT NULL, ⛔ NO DEFAULT
   · mst_namespace_declarations + ONE transcribed row (`default`: open · slot-governed · include)
   · log_slot_bindings (propose/confirm, with the first-bind/rebind CHECKs)
   · txn_memories.question_id_at_admission (landed EMPTY)
✅ BUILT: `memory-bind-rules.js` (PURE) · `memory-declaration-host.js` (declare · propose · confirm ·
   resolve · claim-kind validation) · the admission pin at the store seam
   ⭐ confirmBind is ONE STATEMENT: the UPDATE is a CTE and the audit INSERT SELECTs FROM it, so a failed
   compare-and-set writes NO audit row => exactly one row for a real change, zero for a non-event,
   with ⛔ no caller transaction needed
✅ RP-D0 GREEN — 24 assertions. ⭐⭐⭐ DECLARE -> BIND -> RESOLVE -> checkKind = ALLOW. ALLOW IS REACHABLE
   (+ rides along: RP-D4 unregistered check refused · RP-D6 prototype member refused · the occasion rule
   both ways · DECLARE alone makes NOTHING operative · propose changes nothing · a refused confirm
   writes no audit row · teardown ASSERTED)
✅ RP-T1 GREEN — declare A -> bind -> admit M -> declare B -> rebind => M STILL reads A, new reads B
   ⭐⭐⭐ CONTROL 3 PROVES IT IS DOING WORK: a reader FOLLOWING THE SLOT reports B while the pinned
   reader reports A — so "it used the pinned value" is NOT indistinguishable from "both paths agree"
✅ SUITE 63/63 (grepped for the pass line, ⛔ not the last line)

⚠️⚠️ THE POSITIVE CONTROL EARNED ITS KEEP IMMEDIATELY — A REAL DEFECT, CAUGHT:
   The gate RESOLVED correctly and checkKind returned ALLOW, and the value STILL never reached the
   INSERT. Sequelize silently dropped `question_id_at_admission` because the MODEL did not declare it —
   the identical failure that file already documents for `subject_person_id`, "which cost seven
   memories". ⛔ NO error, NO warning.
   ⭐⭐ RP-T1's control 2 was the ONLY thing that caught it: the two assertions expecting NULL were
   PASSING. A 100%-NULL suite is exactly as vacuous as a 100%-DEFER one
   => ⭐ FIXED by declaring the field in `txn_memories.model.js` · AND the swallow in
   `admittingQuestionFor` now falls back to console.warn when no logger is wired

✅ THE WHOLE REGISTER IS GREEN — RP-D1/D2/D3/D5/D8/D9/D10 · RP-NQ1/2/3 · RP-N8 · isolated E2E
   ⭐ RP-W0 ran FIRST inside it: a warrant is ISSUED and the snapshot CHANGES, before any "no warrant
     moved" assertion — on an empty table that assertion is free
   ⭐ RP-D9: a slot bound to a SUPERSEDED definition still resolves to THAT definition ⇒ supersession
     alone changes NOTHING operative; only a rebind makes a new definition live
   ⭐ RP-N8: a slot in an UNDECLARED namespace admits with NO pin · CONTROL: the same write in `default`
     IS pinned ⇒ N8 is not passing because pinning is broken
   ⭐ RP-D3 is BEHAVIOURAL — recall exercised per account, ⛔ never a source grep · CONTROL: a real new
     memory DOES change what an account recalls
   ⭐⭐ E2E: the whole chain runs and the LIVE CORPUS IS BYTE-IDENTICAL — and the fingerprint was proved
     SENSITIVE FIRST, and proved to RETURN to baseline (⛔ not merely monotonic)
⚠️ ONE ASSERTION OF MINE WAS OVER-SPECIFIC: RP-D2 asserted WHICH gate refuses a figurative row and went
   red on OWNERSHIP_BOUNDARY. The write WAS refused — by admissibleToSlot, which runs BEFORE
   slotViolation. ⇒ ⭐ assert the STATE (a non-kind gate refused), report the code as detail; naming the
   door made the test fix an implementation ORDER it has no business fixing
⭐ THE ADMISSION SEMANTIC, as built: checkKind's ALLOW earns the PIN; it ⛔ does NOT refuse any write.
   M2-10 already ruled DEFER "a consumer-side restriction, ⛔ not a slot-level disablement", and no
   writer declares a claim kind today, so refusing here would refuse EVERY existing writer — 031's rule:
   not a protection, an OUTAGE. Enforcement of replacement is M2's, and M2 is disabled
⚠️ `claimKind` is TRANSPORT, stripped like semanticTarget/sourceText — ⛔ NOT `row.kind`, which is the
   namespace-ish axis (semantic|identity) and a different fact entirely
```

## ⏸⏸ AWAITING OTE — THE FIRST GOVERNED SLOT → `PROPOSAL_SOTERA_FIRST_GOVERNED_SLOT` (19:44)

```
⭐ RECOMMENDED: `user / build tag for this cycle` in **agent_dev's** room · 1 live row `CANARY-653912` ·
  write_count 1 · quiet since 2026-08-26 · never superseded · writer = model-tool
⭐⭐⭐ WHY: it is the ONLY candidate BOTH well-formed (entity=SUBJECT, attribute=PROPERTY) AND
  SEMANTICALLY DISPOSABLE — a build tag is INSTRUMENTATION, so it asserts nothing about a person and a
  wrong or refused update costs nothing. That is a property of the DATA, ⛔ not convenience
⛔ REJECTED, with reasons: the gaming cluster is Ote's REAL personal data in HIS room · `physical state`
  is sensitive · `Thai name spelling`/`alias`/`account identity`/`nature/origin` are identity-adjacent
  real facts · `occupation`/`work schedule` are real person-facts
⭐ QUESTION: `build-tag` · "which build tag is current for this cycle?" · checks nonempty · single-line ·
  no-trailing-ellipsis — ⭐⭐ ALL THREE REGISTERED and all three TRUE of the answer shape (only 4 checks
  exist, and there is NO enumeration check — which is why a status-shaped slot would be worse)
⚠️⚠️ FINDING — **THE FIRST BIND IS A ONE-WAY DOOR.** The ratified acts are first-bind and rebind; there
  is NO UNBIND (checkBindRequest requires a question id) ⇒ a bound slot is REPOINTABLE, ⛔ NOT REMOVABLE.
  ⛔ Not a defect — unbinding would be *contradicting a claim with a non-claim* — ⭐ but it argues for
  disposable data over real personal data
⚠️ WRITER PATH: `commitToMemory` is a SECOND closed field list ({entity, attribute, value}+optionals),
  Sotera-side, and an OBSERVATION carries no claim kind ⇒ ⛔ THE MODEL CANNOT SUPPLY ONE TODAY.
  ⇒ the first governed UPDATE is an OPERATOR act through reconcileFact — the exact shape the transport
  control already proved. ⭐ And after the bind the model-tool path REFUSES on that slot until taught,
  which on a canary slot is THE DESIRED OBSERVABLE, not a defect
⏸ 4 approvals needed — see the doc's §6
```

## ⏸ ALSO OPEN, EXPLICITLY HELD

| **the declaration VERB** | ⭐⭐⭐ **047 built the NOUN; nothing built the VERB.** 0 of 82 slots declared ⇒ `checkKind` DEFERs on every slot ⇒ **M2 cannot commit to anything.** ⭐ Excluded by derivation: migration (*"a migration knows nothing"*) · the slot store (ENSUREs, must never fail a write) · reflection/dreaming (inference + **self-authorising**). ⭐ Three precedents agree: **authored artefact + explicit act → durable record PINNED to something immutable** (`persona.lock.json` sha256 · `doc:<path>@<sha>` ×34 · `reconcile:rome-2026-09-02`) |
| --- | --- |
| **gap ⑤** | claim subject ≠ slot subject, BOTH KNOWN. ⏸ Held for a **real** divergent case, ⛔ not the constructed fixture. ⚠️ The refusal is a **representation gap, ⛔ NOT a ruling that third-party info is invalid** — *"Ote can tell Sotera about Hermes"* |
| **M2-1 build** | locked, unbuilt: needs 6f + a product axis (migration) |
| **the D2 residual** | ⚠️ **a definition-shaped claim still passes M2-8** — RP14 pins it GREEN on purpose. ⛔ M2-6 must never become an aboutness detector. ⭐ **Wait for ORIGIN**: a definition-shaped claim is one with no first-hand origin, so origin may dissolve it rather than needing a rule |
| **admission-predicate identity** | ⏸ the pass row records the boundary STATE but not the PREDICATE's identity — separate hardening item |

## ⭐ DEPENDENCY ORDER (ruled 2026-09-03, full reasoning in `DERIVATION_SOTERA_ORIGIN_CONTRACT` §7)

```
  ORIGIN vocabulary → schema        ── blocks M2-6 WIRING and the D2 residual
  the declaration VERB              ── ⭐ THE ONLY HARD BLOCKER on M2 committing anything
  M2-1 (6f + product axis)          ── independent, may run any time
  admission-predicate identity      ── independent, may run any time
  gap ⑤                             ── blocked on DATA (a real divergent case), ⛔ not on design
```

⚠️ ⛔ **Do NOT wire M2-6 before origin** — `resolveFormationContext()` returns the **DELIVERY** room by
construction, and wiring it first bakes that in.

---

# 4 · ⭐ WHAT IS BUILT — AND HOW TO RUN IT

```
M1        test/pipeline/dreaming-pass.mjs [--limit N] [--series]      writes ONE pass row
M1-F      test/pipeline/dreaming-candidates.mjs [--full] [--save]     counts only, persists NOTHING
12b       test/pipeline/dreaming-12b-proposal-only.mjs --slots 4      proposal-only + state proof
12c       test/pipeline/dreaming-12c-isolated-persona.mjs             ⭐ create → inspect → TEAR DOWN
12b.1/.2  dreaming-12b1-reasoner-contract · dreaming-12b2-d1-d2-separation
12b.3     dreaming-12b3-selector-discriminator                        5 classes × candidate rules
```

**Checks:** `dreaming-m1-check` (124) · `dreaming-m1f-check` · `dreaming-m2-semantics-check` (the
characterization register — ⛔ NOT a red wishlist) · `dreaming-m2-6-check` (RP1–RP14 + RP3b) ·
`dreaming-m2-7-check` · `dense-admission-check` · `dreaming-baseline-check` · `dreaming-pass-ledger-check`.

⚠️ **12c MUST tear down.** A resident second persona turns two suites red **and both are right**:
authorship must be earned through an occasion, and `self-history` relies on **exactly one persona**.
Lineage is dumped to `test/results/m2-12c-lineage.json` first.

---

# 5 · ▶ BACKGROUND (observation only)

**P1** — window `tool_generation=2 AND dispatch_generation=2 AND trigger_source='cron' AND
outcome='completed'`, minus `5d5ca7c5`. **N = 7.** ⛔ Four boundaries, no stage inferred from another.
⛔ `log_retention_decisions` records EMISSIONS, ⛔ never decisions. Surface a Decision→Emission→
Persistence failure or genuine retention-rationale loss **immediately**; otherwise do not block on it.

**ROME** — closed, observation only. `node test/pipeline/rome-observation.mjs`. ⛔ Silence is no
observation, ⛔ not a failure.

**⚠️ `56425175`** — the dense-arm REGRESSION FIXTURE. Still excluded; its **8 embedding rows are still in
the index and must NOT be deleted** (exclusion is reversible; deleting them makes a release
un-restorable). ⓘ `dense_nonevidential = 8` is the expected value.

---

# 6 · ⭐ THE RETRIEVAL SUBSTRATE — `txn_messages` ⊕ `txn_message_embeddings`

**Read 2026-09-03 14:20 against live `persona_sotera` @ `:54322`.** ⓘ Recorded because §2's O-iii.a rule
and §5's `56425175` fixture both live in this pair, and nothing else in the doc says how it actually works.

## 6.1 · THE SHAPE

| **`txn_messages`** 2,204 rows · 13 MB | `content_tsv` is a **generated stored** `tsvector` (`'english'`) + GIN ⇒ **that IS the lexical arm**. FK → `txn_conversations` **ON DELETE CASCADE** |
| --- | --- |
| **`txn_message_embeddings`** 1,926 rows · 85 MB | PK `message_id`. ⛔ **No Sequelize model — raw SQL only**; the name is a literal in exactly **two** places in `conversation-search.js`, pinned by `table-names.test.mjs` because getting it wrong **fails soft** (no evidence, no error) |
| `embedding` `jsonb` | the raw array as the embedder returned it |
| `embedding_hv` `halfvec(2048)` | **generated stored**, converted **only if `jsonb_array_length = 2048`**, else NULL ⇒ a wrong-dimension vector becomes invisible rather than wrong |
| `conversation_id` · `role` · `room_user_id` | **018's denormalised scope copy** — `conversation_id`/`role` NOT NULL so a forgetful writer fails loudly |

**Two HNSW indexes** on `embedding_hv` (`halfvec_cosine_ops`): general, plus a **partial one
`WHERE role='assistant'`** — that one is pre-filtered by construction and is what makes `recall_own_history`
cheap. ⓘ One embedding model live: `ollama/qwen3-embedding:4b@2048`.

## 6.2 · WRITE — nightly, idempotent, scope read back from source

`cron → drainPendingEmbeddings → embedPendingMessages`, gated `memory.embedMessagesEnabled` (default ON).
Candidates: `role ∈ (user,assistant)` **AND** `length(content) >= 50` **AND** `evidentialSql(c)` **AND** no
row yet. ⭐ The INSERT `SELECT`s the three scope columns **back out of `txn_messages`/`txn_conversations` in
the same statement**, ⛔ never from the candidate row — so the copy cannot disagree with its source.
`ON CONFLICT (message_id) DO UPDATE` ⇒ re-runnable. ⓘ Its own window `memory.messageEmbeddingNumCtx` = 8192,
deliberately **not** `memory.embeddingNumCtx` (2048, sized for memory content, which had silently truncated
21 long messages).

## 6.3 · READ — the two arms and where the boundary is applied

```
query ─┬─ lexical  content_tsv @@ plainto_tsquery('english', q)     → pool = limit × 4
       └─ dense    embedding_hv <=> qvec · score = 1 − distance     → pool, then score >= 0.5
                   ↓ RRF-fuse the two ranked id lists → filterEvidence → limit
mode = hybrid | lexical+empty-dense | lexical | none
```

⭐ **`SCOPE`** (messages/conversations) serves the lexical arm; **`VECTOR_SCOPE`** (the embedding table's own
columns) serves the dense arm, so room/role is applied **AT** the index scan, ⛔ not by a join above it.
⭐⭐ **The one asymmetry is §2's rule in force:** `excluded_from_evidence_at` is **REVERSIBLE**, so it is
**NOT** denormalised — the dense query carries `AND evidentialSql('c')` as a read-time post-filter against
the live conversation row. That clause is what closed the 7-of-8 leak.

## 6.4 · ⭐ OBSERVED STATE — clean, and the gap is fully explained

```
embedding NULL 0 · embedding_hv NULL where embedding present 0 · ORPHAN embeddings 0
messages without an embedding 278 — ⭐ ALL of them < 50 chars ⇒ eligible-but-unembedded = 0
```

⇒ **no backlog and no stuck row.** ⓘ That last figure matters: the embed loop's `catch {}` is silent, so a
permanently-failing message would retry nightly forever with nothing surfacing it — **a zero eligible
backlog is the only thing currently proving that is not happening.**

## 6.5 · ⚠️ THREE LATENT SHAPES — ⛔ OBSERVATIONS, NOT DEFECTS, NOT REQUIREMENTS

⛔ **None of these has occurred; none has repeated.** Recorded so a later reader does not re-derive them.

| **no FK on `message_id`** | `txn_message_embeddings.message_id` has **no** FK to `txn_messages.id`, and Backend has **no runtime DELETE path** — the only two DELETEs are inside 018's one-time incognito cleanup. Since messages cascade-delete with their conversation, a hard-deleted conversation **would** leave its embedding rows behind. ⓘ **Measured 0 orphans today** ⇒ latent shape, ⛔ not a live defect. Same class as the `txn_responses` hard-delete gap the EAP fork found in OLS |
| --- | --- |
| **the `jsonb` is a second copy** | **61 MB of the table's 85 MB is TOAST for `embedding`**, serving 1,926 rows; only `embedding_hv` is ever queried. ⛔ Not a finding — deliberate if it is kept for re-derivation on a model change. ⏸ Ask before touching: deleting it makes a re-embed un-derivable |
| **`content_tsv` is `'english'`** | consistent with the standing position that **the lexical arm is dead for Thai** (one clause = one token) and the dense arm IS the arm. ⛔ Nothing to fix here; noted so the `'english'` literal is not mistaken for an oversight |

---

# 7 · ⭐⭐⭐ THE ONE LESSON THAT KEEPS PAYING

> **"I could not establish X" must never silently become "X is established."**

Ote ratified it as **the standard red-proof question** for all M2 work — ask it *wherever nullable/unknown
state crosses a safety boundary*. ⓘ **Four mechanisms in this arc alone:** a `CHECK` passing on NULL ·
a red-proof that never attempted the null route · a prompt/verifier label mismatch discarding **every**
citation · a `&&` short-circuiting past a divergence test.

⭐⭐ **It fails in the SHAPE OF A PLAUSIBLE RESULT** — *"could not verify"* is what a WORKING gate says —
so it confirms an expectation and nobody looks again. 🔑 **A negative that confirms what you already
suspect deserves MORE scrutiny, not less**, and **an impossible result is worth more than a plausible
one.** ⭐ The repairs that work: make the fact **explicit**, **fail closed**, **name the refusal**.

## ⚠️ Other rules that cost something in this arc

| **"suite green" is an OBSERVED CLAIM** | grep every run for its pass line — ⛔ never read the last line (a query log is not a verdict). One suite had NEVER been green and rode in a "55 of 55" report |
| --- | --- |
| ⛔ **assert the STATE, not the ANSWER** | three instances: `>= 13` rows · `persona IS NOT NULL` expecting 0 (accused 37 correct rows) · a dateless absence |
| ⛔ **a scan cannot tell code from commentary** | 4 instances — the better a module documents its boundary, the more a naive scan accuses it. **Presence and absence checks need OPPOSITE strippers** |
| ⭐ **prefer a DECLARED constant to any regex** | `RUN_ONE_PASS_DEPS` exists because a source regex matched the host's own internal line |
| ⚠️ **a sample taken DURING an operation is not a result** · ⚠️ `cd` persists between Bash calls — use `git -C` · ⚠️ heredocs eat `\n` — verify after every scripted edit · ⚠️ Sequelize `create()` drops undeclared columns · ⭐ restart by PID/port and assert **process start > module mtime** |

---

# 8 · ⭐ DOCS, IN READING ORDER

**Dreaming/M2 (current):** `CONTRACT_SOTERA_DREAMING_MINIMUM_SEMANTIC` §12 (the M2 table = live state) →
`DECISION_SOTERA_O3A_ADMISSION_IS_NOT_A_FRESHNESS_WINDOW` → `AUDIT_SOTERA_D2_EVIDENCE_SELECTOR` →
`INVESTIGATION_SOTERA_S94_SELF_CONSUMPTION` → `CONTRACT_SOTERA_M2_6_EVIDENCE_SELECTION` →
`DECISION_REQUEST_SOTERA_M2_1_OUTCOME_AXES` → `DERIVATION_SOTERA_QUANTIFIER_AND_M2_3_REFRAME` →
`DERIVATION_SOTERA_SLOT_QUESTION_DECLARATION` → `DERIVATION_SOTERA_STANDING_AND_OWNED_COGNITION`
(**supersedes** the standing section of the one before it) → ⭐⭐ **`DERIVATION_SOTERA_OWNERSHIP_FORWARDING_ACCOUNTSHELL`**
(answers its three open rulings; **supersedes** its §3.2 reading of `source:'conversation:<id>'`) →
`DERIVATION_SOTERA_ORIGIN_CONTRACT` (⚠️ read its **2.2 and 2.3 corrections**) → ⭐⭐
**`DERIVATION_SOTERA_ORIGIN_VOCABULARY_AND_AUTHORIZATION`** (the vocabulary + who may assert one;
⏸ **its §8 holds the 4 rulings blocking any origin schema**).

**Earlier arcs:** retention/P1 chain · Rome (3) · `MEASUREMENT_SOTERA_EMPTY_TURNS`.
ⓘ All in `Reference/docs/` — its own git repo, use `git -C /c/data/AI_LLMv2/Reference`.
