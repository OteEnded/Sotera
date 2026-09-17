# AI_CarryOn — Sotera

**Checkpoint 2026-09-17 (+07:00).** ⭐ Read §0-A first; §0-B..§0-E are the live state; everything below §0-F is history.

---

# 0-A · ⏸ WHAT IS OPEN. ⛔ NOTHING IS BLOCKED.

## ⓪ ⭐⭐⭐ THE CURRENT ARC — ✅ **THE ADMISSION BUILD IS ACCEPTED.** ⛔ READ THIS FIRST.

⭐⭐⭐ **THE ARC RAN: evidence → rulings → design → contract → build → ACCEPTED (Ote, 2026-09-17).**
⛔ We are no longer ruling ①–⑧ and we are no longer designing the contract. **Both are closed.**

> ⭐⭐⭐⭐ **WHAT NOW EXISTS IN PRODUCTION — the one sentence a fresh session needs:**
> ## **Grouping and competition admission are two separate acts. `reconcileFact`'s `matches` is no longer
> ## the grouped bucket — it is the ADMITTED SUBSET.** A candidate pair is not a competing pair until an
> ## independent warrant admits it.

```
A — ACCEPT, THE LOCKED PRINCIPLE (Ote):
  "An undeclared question does not prevent memory formation; it prevents mutually exclusive competition."

  observation → question ESTABLISHED  ⇒ admission may evaluate
              → question ABSENT       ⇒ ⭐ the memory IS STILL WRITTEN, ⛔ with no exclusivity
```

⚠️ **THE METHOD THAT GOT US HERE, and it still applies to the next arc:** *"Batch investigations that can
share evidence/context, but ⛔ do NOT batch the rulings."* ⇒ investigate broadly, **rule one at a time**, and
⛔ **never let an investigation's wording decide a model** (Ote had to narrow me twice for exactly that).

## ⭐⭐ WHAT IS LIVE NOW — the shipped surface

```
memory-admission-gate.js   PURE. NOT-IN-SCOPE · ADMIT · ABSTAIN · DEFER, + the receipt summary.
                           ⭐ ABSTAIN needs BOTH sides; DEFER fires when EITHER is missing.
migration 053              log_memory_admissions — ⭐ a CHECK makes ABSTAIN ≠ DEFER UNFORGEABLE
reconcileFact              grouping (`candidates`) and admission (`matches`) are two steps
question_id_at_admission   ⭐ gained its FIRST production reader (`admissionKeysFor`), BY KEY not id
the receipt                carries an admission summary on SUCCESS — ⛔ never the refusal channel,
                           ⛔ no incumbent ids (those stay in the ledger), ⛔ invisible to the model
```

⛔ **UNCHANGED, DELIBERATELY:** the matcher (⭐ grouping is ALLOWED to be wrong) · retrieval · the composer ·
winner selection · `governsReplacement` · `restore` · `lesson-host` · every existing row · the canary.

```
①  ✅ RULED          ⛔ NO single general relationship — the kinds are INHERENTLY MULTIPLE
②  ✅ RULED          membership is NOT one semantic relation; each consumer establishes its own
③  ✅ RULED BROAD    observation→question follows 047's DECLARED-ONLY authority
④  ✅ NEGATIVE ONLY  `invalid_at` is NOT a proposition-truth state ⛔ positive definition DELIBERATELY OPEN
⑤  ✅ RULED          proposition EXISTS as a representation; ⛔ proposition EQUIVALENCE does not exist
⑥  ✅ PARTIAL        transition is a layer DISTINCT from row state ⛔ taxonomy NOT finalised
⑦  ✅ RULED          durable memory is NOT inherently slot-shaped
⑧  ✅ RULED NARROW      ⭐ ATTRIBUTION IS NOT AUTHORIZATION — writer identity alone is insufficient
⑧-A ✅ RULED NARROW    ⭐ bounded · checkable · answerable · REFUSAL PRESERVED
④-A ✅ RULED NARROW    ⭐ ONE claim, and its subject is THE SYSTEM
④  ✅ RULED — the three statuses are WRITER EVIDENCE, ⛔ NOT a taxonomy
A-D4 ✅ DELIVERED — ⭐ only `entity` establishes anything; EXCLUSIVITY is established by NOTHING
A-D5 ⏸ DELIVERED — ⭐ a warrant exists for the exclusivity ACT, ⛔ NONE for the exclusivity SET
✅ D-1…D-6 ALL DECIDED · ✅ CONTRACT RATIFIED · ✅ **A — ACCEPT LOCKED** · ✅ **BUILD ACCEPTED 2026-09-17**
```

> ## ✅ **EVERY DECISION ABOVE IS RULED, AND THE BUILD THAT FOLLOWED IS ACCEPTED. ⛔ NOTHING IN THIS BOARD
> ## IS OPEN.**

## ⏸ ⭐⭐⭐ THE ONLY OPEN WORK FROM THIS ARC — carried forward, ⛔ none of it started

```
① THE LEDGER TEARDOWN SWEEP  ⭐ every check that writes memory now leaves `log_memory_admissions` rows its
                             teardown does not clean. ⛔ Ote: keep it a SEPARATE follow-up, ⛔ do not
                             expand the accepted build for it.
② THE THREE RED CHECKS       model-tool-claim-kind (9) · declaration-self-authorisation (5) ·
                             declaration-transport (4).
                             ⛔⛔ **LEAVE THEM ALONE.** Their red state is A CONSEQUENCE OF THE NEW
                             TOPOLOGY, ⛔ not a defect — and ⛔ NEVER weaken admission or M2 to green them.
                             ⭐ TWO are TRANSPORT/REACHABILITY instruments whose OBSERVABLE moved: their
                             claim is UNTESTED now, ⛔ not disproven. ⭐ The third is a RULE whose substance
                             is INTACT and MEASURED — the constructed same-occasion attack neither
                             displaces nor earns a pin.
③ `restore` / W6             ⛔ ratified OUT OF SCOPE. It still blocks on a raw {entity, attribute} arena
                             (②'s P15) ⇒ ⚠️ the two seams disagree, KNOWINGLY. ⏸ A separate decision.
                             ⚠️ AND A-ACCEPT INCREASED ITS EXPOSURE — more coexisting rows to trip over.
④ THE LESSON-HOST D1 GAP     `lesson-host.revise()` is raw SQL mutating TWO `SEMANTIC_FIELDS` outside
                             `store.update` ⇒ ⛔ neither admission NOR D1 Phase 3 reaches it.
                             ⚠️ PRE-EXISTING and LATENT (0 rows). ⏸ A separate pre-existing item.
⑤ THE EXTRACTOR VOLUME       ⭐ A — ACCEPT is in force: the extractor DEFERs and its facts COEXIST.
                             ⭐⭐ ESTABLISHED: it has NO legitimate source of `claimKind` for VOLUNTEERED
                             facts, and giving it one would VOID its own declared-coincidence warrant.
                             ⏸ ELICITATION is LEGITIMATE but UNBUILT — ⛔ its own design pass, and it
                             covers only ELICITED facts, ⛔ never volunteered ones.
⑨ ⏸ NAMED, NOT OPENED        may an arena be SYNTHESISED for a family with no established slot semantics?
```

> ## ⭐⭐⭐ **① IS RULED, AND SO IS EVERYTHING AFTER IT.**

⭐⭐⭐ **① — ✅ RULED (Ote, 2026-09-17).** *"⛔ There is **no single general semantic relationship** that
governs every interaction between an incoming durable observation and the incumbent it displaces."*

```
⛔ THE RULING DOES NOT ESTABLISH — Ote's fence, and it is NARROWER than the investigation:
   ⛔ the NUMBER of kinds · ⛔ their NAMES · ⛔ a TAXONOMY · ⛔ any REPRESENTATION
   ⛔⛔ AND NOT that no HIGHER-LEVEL FAMILY of distinct relation kinds could exist
   ⚠️ ⇒ this NARROWS §5.1 of the investigation ("no relation, no supertype … holds across all
      nine"). ⭐ THE RULING IS: **none was ESTABLISHED — ⛔ not that none COULD exist.**
      ⛔ Never cite the investigation's wording as the stronger claim.

✅ PRESERVED BY RULING:
   ⭐ "NO RELATIONSHIP" and "RELATIONSHIP CANNOT BE ESTABLISHED from available evidence"
     remain DISTINCT OUTCOMES.
   ⭐ The commonality at the seam is an OCCASION / EPISTEMIC SITUATION — ⛔ NOT a semantic
     relationship. Ote: *"useful without pretending that occasion is a relationship."*

⛔ RELATIONSHIP TAXONOMY IS **NOT OPENED.**
```

⭐ **THE INVESTIGATION BEHIND IT — `DECISION_SOTERA_01_INCUMBENT_RELATIONSHIP.md`.** Under Ote's reframe
(RELATIONSHIP incoming→incumbent held strictly apart from CONSEQUENCE incumbent→role, ⛔ the
second **not admitted as evidence** for the first):

```
⭐ THERE IS NO SINGLE GENERAL RELATIONSHIP — the kinds are INHERENTLY MULTIPLE,
  ⛔ not because the cases varied but because THE RELATA DIFFER:
  observation×observation · world-state×world-state · record×ITS-OWN-SOURCE ·
  sub-proposition×sub-proposition · ⛔ and in #8/#9 NO PAIR AT ALL.
  ⛔ A relation's attributes cannot vary its own domain.

⭐ THREE OUTCOMES MUST STAY DISTINGUISHABLE — today all three produce ONE row state:
  ✅ a relation holds · ⛔ NO relation exists (#8 #9) · ⚠️ the record CANNOT ESTABLISH one (#3)

⭐ WHAT IS COMMON IS NOT A RELATIONSHIP — it is an OCCASION: a pair was brought into
  contact and the system was required to act BEFORE the relationship was established.

⇒ EXCLUDES interpretation 1 as a RELATIONSHIP model (⚠️ it may still fit the CONSEQUENCE
  dimension — that is ④'s, and open) · ⛔ does NOT select among 2, 3 and 4.
```

⭐ **THE FULL RULINGS AND THEIR EVIDENCE:** `ADR_SOTERA_MEMORY_SEMANTIC_DECISIONS.md` (read first) ·
`SYNTHESIS_SOTERA_MEMORY_BOUNDARIES.md` (the six boundaries) · the rules in §0-B ⑱–㊻.

⚠️ **THE SIX EXPOSED CONSEQUENCES (§0-B ㊻)** — E1 **both branches of `resolveConflict` rest on inferences
⑤ forbids** · E2 collapse has **no available justification at all** (⚠️ latent, never fired) · E3 the
ephemeral arena **contradicts ⑦** · E4 ③'s absent-vs-wrong nuance **not held** · E5 `attribute` is
**load-bearing for ⑤ and forbidden by ③** · E6 the `invalid_at` docstring is **known-wrong by ruling**
(⛔ flagged, ⛔ not changed).

⭐⭐ **THE ANCHORS — evidence boundaries, ⛔ not implementation opinions. Cite them; ⛔ never weaken them:**

```
① ⭐ "The old observation became non-current without becoming false."   (Mira — the guardrail)
② membership ≠ proposition        (the 18-row `sotera|lesson` canary)
③ value ≠ proposition             (`location = Bangkok` vs `timezone = Bangkok`)
④ `supersedes_id` = LATENT, ⛔ not defective   (implementation convention ≠ corpus semantics)
⑤ `expired_at` = storage-vs-belief ambiguity in one column
⑥ `user_id` scope IS semantically meaningful ⇒ ⛔ a duplicate label is NEVER automatically suspicious
```

⛔ **STANDING FENCES FOR THIS ARC:** read-only · no implementation · no schema/migration · no historical
repair · **no canary activation** · 047 untouched · A1 shadow · **both collisions stay armed** ·
`SEMANTIC_FIELDS` untouched · no Dreaming change · no relation vocabulary · ⛔ no `invalid_at`
reinterpretation.

---

## ⓐ ✅ CLOSED ARCS — ruled, shipped, ⛔ not to be reopened

**PROVENANCE (D1–D9)** — every decision ruled. The invariant, in Ote's exact words:

> **"Every memory-SEMANTIC state mutation requires a declared writer. NON-SEMANTIC BOOKKEEPING mutations
> performed as part of READS remain permitted."**

⛔ **NEVER shorten that to "every update requires a writer"** — `W5c` exists specifically to preserve the
read/bookkeeping distinction. Writer is mandatory; **act is required only where the operation HAS an occasion**,
and ⛔ an act is never manufactured to satisfy the seam. ⛔ Historical rows stay unrepaired. The 8 unlinked
reflection rows stay **permanently unknown** (D2) — ⛔ no temporal→occasion inference, ever.

**A3 · the alias is a governed semantic operation** (09-16) · **A2 · Normalization is real** (09-16) ·
**B1/B2/B-D2/B-D4** (09-16/17). All shipped, all green. Detail in ⓒ.

## ⓑ ⏸ ATTRIBUTION — observation-only, the instrument is watching

Three corpora produced **0 human-confirmed violations**; the third stopped at its gate and the threshold was
never edited. The live instrument runs. ⛔ **The detector is ADVISORY and must never become a gate** ·
⛔ a candidate is **not** a violation until Ote confirms it (D13) · ⛔ Mr C never classifies.
⇒ **Reading: 22 scanned · 0 confirmed violations · 1 confirmed NON-violation (REQ_NOW) · ⏸ 4 AWAITING OTE.**
⛔ Never report a bare "0 violations" without its scan denominator (D14).

## ⓒ ⭐⭐ THE A/B ARC — A3 · A2 · A1(shadow) · B1/B2/B-D2/B-D4 ALL LANDED

`PLAN_SOTERA_A_B_IMPLEMENTATION.md` is the live document.

```
✅ A3   alias accountability · mig 051 `log_slot_aliases` · ONLY AN ADJUDICATED `same` MAY TEACH
        ⭐ a refused write teaches nothing and touches nothing — a CONTROL-FLOW FACT, not a rule to remember
✅ A2   `attributeShapeOf()` → head + qualifiers, threaded to the resolver, SEMANTICALLY INERT (asserted)
✅ A1   `memory-ontology.js` · RELATION{same|different|broader|narrower|sibling|unknown} · only `same` may bind
        ⛔ SHADOW ONLY — there is deliberately NO 'on' mode. Accumulating on live traffic.
✅ B1   ONE contiguous POSITIONAL centred window, both speakers, every position SHOWN or MARKED
✅ B2   `partial` = AUTHORIZATION (restored) · `incomplete` = DERIVED · ⛔ neither is a 5th cognition axis
✅ B-D2 `incomplete` covers BOTH causes; three epistemic states, three sentences, ⛔ never collapsed
✅ B-D4 mig 052 `projection_version` · `PROJECTION_VERSION='2'` declared BESIDE the projection, not the detector
```

### ⭐⭐⭐ The four findings that inverted an assumption

1. **A1 contradicted my own design doc, and it was right.** The RFC's "abbreviation" example is not one:
   `favorite language` → `favorite programming language` is **BROADER** (it could mean a spoken language).
   ⛔ The classifier was not bent to match R3. RFC §5's four-way tie breaks to **1 `same` + 3 `broader`**.
   **16 over-bindings** corpus-wide (4 real), **every one at containment exactly 1.0000** ⇒ ⛔ these are not
   threshold-edge cases; they are where containment is most confident and most wrong. **ZERO under-bindings.**
2. ⭐⭐ **B exposed a THIRD defect, worse than the one it set out to fix.** The window was `rolling_id`
   arithmetic and **`rolling_id` is ONE GLOBAL SEQUENCE**, so any interleaved conversation collapsed it —
   **33% of conversations returned FEWER than the radius promises, mean 7.36/9, worst 2/9** (one conversation:
   176 messages over 1,312 ids). The shelter conversation was contiguous, which is why it hid in plain sight.
   ⇒ B1 counts **POSITIONS**, never ids.
3. ⭐⭐ **`incomplete` reported FALSE on a view showing 9 of 170 messages** — it only asked whether the window
   filled *itself*. The shape of the contract satisfied while its semantics were violated (rule ⑯).
4. ⭐⭐⭐ **The `unknown` hypothesis INVERTED.** Not 29% of the corpus — **23 LABELS** (21.3%) amplified across
   976 pairs, ~42 each. **The extractor is the BEST-behaved writer: 1 of 27 = 3.7%.** `chat-tool` (her own
   `remember_fact`) = **11 of 26 = 42.3%**; `reflection` = 4 of 12. ⭐ **The cause is a sentence we wrote** —
   `remember_fact` promises *"it finds the existing fact for this slot — EVEN IF YOU WORD THE ATTRIBUTE
   DIFFERENTLY than before"*. She names descriptively because she was told it is safe. ⚠️ That promise is
   **false both ways**: A1 showed it over-merges; this shows it cannot relate 23 labels at all.
   ⇒ **4 of 23 genuinely MALFORMED** (coordinations — a slot cannot hold two answers) · **19 of 23 LEGITIMATE
   OBSERVATIONS wearing a descriptive title** · **0 of 23 are ONTOLOGY questions.**
   ⛔ The resolver is NOT what needs work; forcing the 19 into property names would be LOSSY.

## ⓓ ⛔⛔ DREAMING CANNOT WRITE — and it is NOT a switch

```
runOnePass() THROWS unless dryRun === true — M1 is THE INSTRUMENT, NOT THE REASONER.
⇒ there is NO write path to enable. "Enable Dreaming" is a BUILD, not a flag.
```

⭐⭐ **TWO DREAMINGS, opposite directions, ⛔ never merged:** shipped = **CONSOLIDATION** (compress, REPLACES its
inputs, `consolidateEnabled=false`, 0 cards ever) · designed = the **M-SERIES** (commit, ADDS beside its
evidence, `dreamingEnabled` unset, 5 passes / 0 memories, 6 modules with 0 production imports).

⭐⭐⭐ **AND DREAMING IS SOTERA THINKING** — see rule ⑮ and
`CONTEXT_SOTERA_DREAMING_IS_SOTERA_THINKING.md`. Same class of capable model, **lower scheduling priority**,
interruptible, **resumable from its cognitive state**. ⛔ Not a smaller brain.
⭐ And the distinction that decides what B becomes: **retrieval for an answer** (bounded) vs **exploration for
cognition** (a navigable evidence space, where *she* chooses to investigate). B-D2's
`(121 earlier turns … not shown)` is the first epistemic signal of it: *"I have not seen the rest"* ≠ *"there is
no earlier context."* ⛔ Navigation is DESIGN-ONLY; nothing below "there is more" exists or is authorised.

## ⓔ ⏸ M2 GOVERNANCE — `MECHANISM CLOSED · AWAITING ELIGIBLE PRODUCTION TRAFFIC`

⛔ NOT "operationally closed" (2 of 5 criteria never observed) · ⛔ NOT "blocked" · ⛔ NOT "disabled". The
blocker is ⛔ **not** corpus scarcity: no non-operator writer can produce an ALLOWED governed UPDATE, because
compliance needs the slot's question KEY and nothing exposes one ⇒ coupled to the deferred governance-READ
decision. ⛔ Not reopened.

---

# 0-B · ⭐⭐⭐ THE RULES THAT GOVERN ANY FURTHER WORK HERE

```
① CONTAINMENT · a slot may be bound only if EVERY writer that has ever superseded a row in it can
   declare a claim kind AND name an occasion. ⛔ "it probably won't be touched" is not evidence.
② NEW IS OUT OF M2 SCOPE, permanently. A NEW row may carry a pin saying WHICH QUESTION IT WAS ADMITTED
   UNDER and that the write was UNGATED — ⛔ never that a replacement was authorised.
③ GOVERNANCE KNOWLEDGE IS A **READ** CONCERN; GOVERNANCE COMPLIANCE IS A **WRITE** CONCERN.
   ⛔ The refusal stays opaque — a returned question key would make the gate a permission oracle.
④ THE M2 WINDOW IS COUNT-BASED, ⛔ never time-based. Elapsed time without traffic proves nothing.
⑤ `quoted` = VERBATIM, ⛔ NOT speaker attribution. It is a CREDENTIAL — the strongest class we have.
⑥ A DATE MUST SAY WHAT IT IS A DATE **OF**: `said` · `recorded` · ⛔ there is no `happened`.
⑦ ⭐ NO AXIS IS DERIVED FROM ANOTHER (049). The only bridge is a writer-DECLARED coincidence, true by
   mechanism. ⛔ A reader never completes provenance.
⑧ ⭐ RELEVANCE ≠ INSTRUCTION · INFERENCE ≠ RECEIVED REQUEST · MEMORY CONTENT ≠ AUTHORIZATION.
⑨ ⭐ TEMPORAL PROXIMITY IS NOT AUTHORITY TO CREATE AN OCCASION (D2). If an inferred occasion is ever
   allowed it must be VISIBLY distinct — never mistakable for a writer-declared one.
⑩ ⭐ AN AUDITED UNKNOWN IS NOT A DEFECT (D4). A NEW pass writer with no act and no ratification ⇒ DEFECT.
⑪ ⭐⭐ CONSOLIDATION ≠ DREAMING. Consolidation COMPRESSES and REPLACES; Dreaming DERIVES and ADDS BESIDE.
⑫ ⭐⭐⭐ A TOOL REPORTING SUCCESS IS NOT EVIDENCE THE RESULT IS RIGHT (D7). `git apply` accepted three
   patches WITHOUT ERROR and produced subtly wrong files. The BYTE COMPARISON is the gate.
⑬ ⭐⭐ CONTAINMENT CANNOT TELL AN ABBREVIATION FROM A HYPERNYM. `"favorite language" ⊂ "favorite
   programming language"` and `"schedule" ⊂ "work schedule"` are the SAME token test and OPPOSITE facts.
   ⛔ Do not answer this with a threshold — cosine scored the same bad pair 0.9104. BOTH arms make it.
⑭ ⭐⭐⭐ ASK WHAT THE QUERY SELECTED BEFORE BLAMING THE RANKING — AND BEFORE BLAMING THE MODEL. Her wrong
   answer was the CORRECT inference from an excerpt built by `ORDER BY rolling_id ASC LIMIT 2`. ⇒ a
   component that decides what she SEES is load-bearing whatever its comment says.
⑮ ⭐⭐⭐ DREAMING IS SOTERA THINKING, ⛔ NOT A BACKGROUND JOB WITH A SMALLER BRAIN. ⛔ Do not inherit the
   OLS pattern. FOREGROUND: full model, high priority. BACKGROUND: **the SAME class of model**, LOWER
   priority, INTERRUPTIBLE, RESUMABLE **from its cognitive state**. A user message PAUSES it; the model
   yields to Ote and the COGNITION does not get weaker. ⭐ EXPLORATION IS NOT AUTOMATICALLY BELIEF — a
   pass that commits nothing SUCCEEDED.
⑯ ⭐⭐⭐ A SHAPE-SATISFYING CHECK IS NOT A SEMANTIC ONE (Ote). **An implementation can satisfy the SHAPE of
   the contract while violating the SEMANTIC contract.** Instances, all one family:
     · `incomplete: false` on a view showing 9 of 170 messages — true to its definition, false to the word.
     · a source scan COUNTING `centreId`, inflated by a local named `centreIdx` (a name, not a use).
     · `\b` written as a LITERAL BACKSPACE by a shell layer — THREE times now — so a regex matched nothing.
     · a red-proof calling `recollect({ asked })` when the parameter is `text` ⇒ it never activated and
       every assertion failed VACUOUSLY. ⚠️ Red for the WRONG reason misleads as much as a green that
       tests nothing.
     · my own shape classifier matching a RAW label, misfiling 5 labels while judging someone else's naming.
   ⇒ ⭐ ASSERT BEHAVIOUR ACROSS THE ACTUAL SEAM — ⛔ not grep, not counts, not names — and assert the
   instrument ENGAGED (activation / anti-vacuity) before believing a single thing it reports.
⑰ ⭐⭐⭐ AN INSTRUMENT MUST NOT ASSUME THE THING IT IS MEASURING. Building the slot-behaviour census I
   grouped memory rows BY `canonical_label` — inside the tool investigating whether a LABEL IS AN
   IDENTITY. Two slots share the label `communication preference`, so their histories merged and the
   merged slot appeared to hold TWO LIVE ROWS: a violation of "one slot holds one answer" that does not
   exist. ⇒ ⭐ key on the IDENTITY, never on the name. And in the same file an INNER JOIN silently
   dropped every slot holding no rows — 65 slots vs 95, same corpus, same day, ⛔ one keyword apart.
   ⇒ ⭐⭐ **STATE THE EXCLUSION LADDER.** A denominator that nobody can reconstruct is one nobody can check.
⑱ ⭐⭐⭐ PROPERTY/SLOT ≠ OBSERVATION/PROPOSITION (Ote, 2026-09-17 — the gate before A-D4).
   `timezone` · `current project` are PROPERTIES: one current answer, replaced when the world moves.
   `nature of relationship` · `view of selfhood` · `metaphorical meaning of Rome` are OBSERVATIONS.
   ⭐ **A descriptive observation is not necessarily a badly named property.** Forcing one head-final so
   the resolver can read it may DESTROY what the observation was ⇒ the failure mode of "fixing" this is
   LOSS, not correction. ⛔ Do NOT design the second model. ⭐ THE INVARIANT IT DOES give us:
   **ONE SLOT HOLDS ONE ANSWER** — `occupation_and_location` is not ugly naming, it is structurally
   unable to be right, because one value cannot independently answer two propositions.
   ⚠️ And it is ⛔ NOT the naming axis: 43 WELL-NAMED slots have also never held a second answer.
   ⇒ ⭐⭐ DO NOT MAKE THE RESOLVER CARRY SEMANTICS THAT BELONG SOMEWHERE ELSE.
   → `CONTEXT_SOTERA_SLOT_VS_OBSERVATION_BOUNDARY.md`
⑲ ⭐⭐⭐ `superseded` IS NOT A SEMANTIC VERDICT — it is the residue of `norm(a) !== norm(b)`.
   ⭐ 8 of the 9 replacement events in the corpus were NOT a belief being revised: 4 RE-STATEMENTS ·
   1 MIXED · 1 REPAIR · 2 WRONG-SLOT · **1** genuine world change. ⛔ And FOUR of those semantic classes
   share ONE recorded state (`invalid_at` set, nothing else) ⇒ THE RECORD CANNOT TELL THEM APART.
   ⚠️ TWO DECLARED TIME AXES, ONE ACTUAL ONE. `valid_at` is COMMIT time — measured: 177/211 rows within
   2s of `created_at`, all 14 outliers `doc:` ingest, **0** carrying a real world "true since".
   `invalid_at` is likewise the system clock at the moment a DIFFERENT STRING arrived — so the `timezone`
   row is marked *invalid in the world* and is **still true**. `expired_at` 2/233 · `contradicted_at`
   3/233, and its ONE use in a transition was set by a HUMAN `operator`, never by the pipeline.
   ⇒ ⭐⭐⭐ THE SUBSTRATE IS **identity + LATEST ARRIVAL** + an append-only trail ⛔ no cognitive read sees
   (`LIVE = {invalid_at:null, expired_at:null}` on every recall). ⚠️ And `dreaming-candidate-host` ALSO
   filters `contradicted_at IS NULL` ⇒ ⛔ THE ONE COMPONENT MEANT TO REASON ABOUT CHANGE CANNOT SEE ANY.
   ⭐⭐ THE PRECEDENT IS OTE'S OWN, ALREADY BUILT — `lesson-host.revise()`:
   `['supersedes','refines','coexists_with','qualifies']`, only `supersedes` archives the prior.
   *"We should not force every change into a simple replacement chain."* ⛔ The FACT path still does.
   ⚠️⚠️ ⛔ BUT DO NOT ADOPT THOSE NAMES FOR FACTS. Measured: the lesson vocabulary classifies HOW THE NEW
   UNDERSTANDING RELATES; the fact evidence demands WHAT BECOMES OF THE OLD OBSERVATION. Different axes.
   → `INVESTIGATION_SOTERA_REPLACEMENT_SEMANTICS.md` · `…_REPLACEMENT_RELATION_AND_SLOT_MODEL.md`
⑳ ⭐⭐⭐ THERE IS A **THIRD** SLOT MODEL AND IT IS ALREADY DECLARED — migration 047 (M2-10/M2-11, LOCKED):
   *"Kind is the QUESTION a slot asks, ⛔ not the datatype of its value."*
     `mst_slot_questions`    a SUBJECT-FREE definition — "what does a valid answer look like?"
     `mst_slots.question_id` a ROOM-SCOPED instance   — "this room's slot asks that question"
   ⛔ *"DECLARED by something that actually knows it, ⛔ never inferred from values, ⛔ never guessed by a
   classifier, ⛔ never backfilled."* ⚠️ AND IT IS EMPTY: 1 question declared (the harness canary),
   1 of 112 slots carries a `question_id`, 35 of 233 memories are pinned to one.
   ⇒ ⚠️⚠️ THE COLLISION, ⛔ WHICH IS OTE'S TO RESOLVE: A-D4 asks the RESOLVER to decide FROM SIMILARITY
   that two labels name the same property; 047 ruled that what question a slot asks may ONLY be DECLARED.
   ⛔ NOT A RULING AND NOT A RECOMMENDATION — surfaced so that deciding A-D4 cannot silently overrule 047.
㉑ ⭐⭐⭐ 047 SCOPE — ✅ SETTLED FROM THE SOURCE (2026-09-17): it is **C — BOTH** identity AND validity.
   ⛔ "A, validity only" is REFUTED. `resolveSlotQuestion` "RETURNS TWO THINGS AND KEEPS THEM APART: the
   question IDENTITY (`slotKind` → `checkKind` — *is this the same question?*) and the declared CHECKS
   (→ `evaluate` — *is this a valid answer?*)."
   ⚠️⚠️ BUT ⛔ THAT DOES NOT SETTLE A-D4, because it is A DIFFERENT RELATION:
     047      CLAIM ↔ SLOT   both sides DECLARED · EXACT match · REPLACEMENT only
     A-D4     LABEL ↔ LABEL  INFERRED by similarity · ROUTING
   ⭐ Exercised: `checkKind('preferred-name','preferred name')` ⇒ **DEFER**. ⛔ NO SIMILARITY CAN EVER
   SATISFY THAT GATE, and it never reads a label, alias, embedding or value.
   ⭐⭐⭐ THE STRUCTURAL FACT: THE RESOLVER AND THE QUESTION LAYER NEVER MEET — 0 references to
   `question_id/slotKind/claimKind/question_key` in resolver+ontology+normalize. ⇒ routing is ungoverned
   by 047 TODAY. ⚠️ AND THE COUNTER-ARGUMENT, STATED NOT BURIED: the gate is DOWNSTREAM of routing and
   ASSUMES IT WAS CORRECT — a volunteering observation mis-routed into `work schedule` and declaring
   `claimKind='work-schedule'` is gated **ALLOW**. ⇒ 047's guarantee is conditional on exactly the
   decision A-D4 is about.
   ⏸ ⚠️ GENUINELY AMBIGUOUS whether 047's PRINCIPLE ("never guessed by a classifier") reaches routing.
   ⛔ NO BEHAVIOURAL PRECEDENT EXISTS: 1 question declared (the harness canary), 1 of 112 slots bound,
   **0 non-harness rows ever pinned** ⇒ the machinery has never run on a real memory. ⛔ OTE'S TO RULE.
   → `INVESTIGATION_SOTERA_047_SCOPE.md` · `test/checks/m2-047-scope-check.mjs`
㉒ ⭐⭐⭐ THE ROUTING ACT — the system treats it as OPERATIONAL in its CEREMONY and SEMANTIC in its
   CONSEQUENCES. ⛔ Not a hedge; both halves are structural.
     CEREMONY   `mst_slots` has ⛔ NO authorship column AT ALL (no writer/act/occasion/declared_by) ·
                `evidence={mintedBy:'reconcileFact'}` is A FUNCTION NAME, ⛔ not an actor ·
                `ensure()` is a bare `findOrCreate` — ⛔ NO ACT REQUIRED TO MINT A CONCEPT.
     CONSEQUENCE ⭐⭐⭐ 77 of 77 SUPERSESSIONS STAY INSIDE ONE SLOT ⇒ `slot_id` IS THE COMPETITION
                BOUNDARY, ⛔ not a filing label — routing decides WHICH BELIEF MAY BE INVALIDATED ·
                routing TEACHES a durable alias · ⛔ IRREVERSIBLE (no shipped path assigns `slot_id`
                after creation) · resolver's own contract: *"which conceptual slot does this observation
                BELONG TO? That is CLASSIFICATION"* · `slot_id` = *"the long-lived identity of the concept"*.
   ⚠️⚠️ THE ASYMMETRY THAT PROVES THE SYSTEM KNOWS THE DIFFERENCE: TEACHING an alias is GOVERNED (A3
   refuses without an ACT — 4 refusals ledgered); MINTING A CONCEPT IS NOT. ⛔ The cheaper act is gated.
   ⚠️ 7 slots with `question_id IS NULL` HAVE ALREADY INVALIDATED A BELIEF ⇒ undeclared slots exercise
   replacement authority, identified BY LABEL, ⛔ never by declaration.
   ⏸ ⚠️ AMBIGUOUS whether ADDRESS and DECLARE-QUESTION are independent acts. ⛔ Reported, ⛔ not chosen —
   047 says minting ≠ declaring, but ALSO defines a slot as *"a slot INSTANCE of"* a question. The label
   does a question's work while carrying none of a question's guarantees. ⛔ OTE'S TO RULE.
   → `INVESTIGATION_SOTERA_ROUTING_AS_AN_ACT.md` · `test/checks/routing-act-scope-check.mjs`
㉓ ⭐⭐⭐ `slot_id` IS THE REPLACEMENT BOUNDARY — mapped 2026-09-17. THE CHAIN:
     slot_id → buildSlotView → rowsBySlot → matches → primary → resolveConflict → invalidate/supersede
   ⛔ NOTHING ELSE SELECTS THE INCUMBENT. ⚠️ And the DB read is NOT slot-scoped (`findOwnLive` fetches all
   live semantic rows) ⇒ the authority is exercised entirely in `buildSlotView`.
   ⭐ CORPUS: **75 of 75** slotted supersessions stay inside one slot · 0 crossed · 0 one-sided.
   ⛔⛔ MY EARLIER "77/77" WAS WRONG — `IS NOT DISTINCT FROM` counted 2 NULL/NULL pairs as "the same slot".
   ⭐⭐⭐ MEMBERSHIP IS **NOT** ESTABLISHED BY ROUTING ALONE. `buildSlotView` has THREE mechanisms:
     ① `row.slot_id`  ② ⭐ **BY PHRASE** — label OR LEARNED ALIAS, *"identity, not resolution… no resolver
     judgement is needed"*  ③ an ephemeral group. ⇒ ⚠️ TEACHING AN ALIAS RETROACTIVELY CHANGES WHICH
     PRE-EXISTING ROWS ARE CLAIMED.
   ⭐⭐⭐ AND THE CLAIM IS MADE PERMANENT — `store.update(orphans, { slot_id: slot.id })`, the ONLY
   post-creation `slot_id` mutation. ⛔ UNGOVERNED (outside `finalizeSlot`, so A3's ACT rule misses it) ·
   ⛔ NOT TRANSACTIONAL (line 571 vs `create` at 659, no transaction anywhere) ⇒ **A REFUSED WRITE STILL
   LEAVES THE ADOPTION IN PLACE.** ⚠️ Source calls it non-semantic: *"changes no ordering and teaches no
   equivalence"* — true, ⛔ AND IT ASSERTS MEMBERSHIP, which is the authority.
   ⭐⭐ THE GOVERNANCE INVERSION: ① SLOT EXISTENCE ⛔ ungoverned (112×) · ② QUESTION IDENTITY ✅ governed
   (actor+occasion+ledger — has run ONCE) · ③ MEMBERSHIP ⛔ ungoverned (142×). ⇒ ONLY THE ACT THAT NEVER
   RUNS IS GOVERNED.
   ⚠️ THE SEVEN undeclared slots that displaced a belief: ALL `mintedBy:reconcileFact`, ALL
   `canonical_label === evidence.firstAttribute` ⇒ IDENTITY FROM THE FIRST ATTRIBUTE STRING THAT ARRIVED,
   and ⛔ ZERO bindings ever logged for any of them.
   ⚠️ ⛔ CANNOT ESTABLISH how often adoption has occurred — only a row OLDER THAN ITS SLOT is provable (0),
   and that is a LOWER BOUND. ⓘ 53 slotless live rows sit in the candidate set; 0 claimable by phrase TODAY
   — ⚠️ one matching alias would change that.
   → `INVESTIGATION_SOTERA_SLOT_ID_AS_AUTHORITY.md` · `test/checks/slot-authority-map.mjs`
㉔ ⭐⭐⭐ MEMBERSHIP IS AN ACT, AND IT IS UNRECORDED. Census 2026-09-17 over 142 memberships:
   ⛔⛔ THE MECHANISM IS NOT RECOVERABLE FOR A SINGLE ONE OF THEM. The audit vocabulary is
   `supersede·collapse·forget·archive·revive·delete` — ⭐ EVERY ONE A DESTRUCTIVE TRANSITION, and
   ⛔ MEMBERSHIP IS NOT AMONG THEM. ⇒ `slot_id` states THAT a memory belongs to a slot, ⛔ never HOW.
   ⛔ MECHANISM C DOES NOT EXIST — exactly two assignment sites, pinned by inventory.
     A · EXPLICIT AT ADMISSION   act? ⚠️ the ROW has one, the MEMBERSHIP declares none · reversible? ⛔ NO
     B · PHRASE/ALIAS ADOPTION   act? ⛔ NONE · writer? ⛔ NONE · ⭐ AFTER the write, ⛔ not transactional
   ⭐⭐ B'S TWO PROPERTIES, MECHANICALLY VERIFIED: it is declared BEFORE `finalizeSlot` (⇒ A3's ACT rule
   never reaches it) and the service opens NO TRANSACTION (⇒ ⭐ A REFUSED WRITE LEAVES THE ADOPTION).
   ⭐⭐⭐ THE ALIAS EFFECT: alias learning → `claimedBy` changes → a previously slotless memory becomes
   claimable → `slot_id` persisted → IT ENTERS THE COMPETITION SET. ⇒ ⚠️ AN ALIAS DOES NOT ONLY TEACH THE
   RESOLVER HOW TO READ FUTURE OBSERVATIONS — IT CAN ALTER THE MEMBERSHIP OF EXISTING HISTORICAL ROWS.
   And A3 already ruled aliases memory-semantic ⇒ one memory-semantic op silently produces another.
   ⭐ THE 53 SLOTLESS LIVE ROWS ARE NOT ACCIDENTALLY SLOTLESS: 34 `project-decision` (doc ingest) +
   19 `sotera` (lessons/decline). ⛔ `lesson-host` NEVER calls `reconcileFact` ⇒ never routed, never
   refused — written by paths that DO NOT USE SLOTS. ⭐ Converges with ⑱ from an independent direction.
   ⚠️⚠️ SHARED-KEY EXPOSURE: **18 live rows share `sotera | lesson`.** One mint under that key claims ALL
   18 in one step, adopts them permanently, and puts them in ONE competition set — 17 collapse/supersede.
   ⛔ NOT ARMED (no slot under any slotless key; the writing path cannot mint one) · ⛔ NOT TESTED.
   ⭐ LANGUAGE CORRECTION, ADOPTED: ⛔ STOP SAYING "routing establishes membership". Say:
   **routing is ONE mechanism; phrase/alias adoption is ANOTHER** · **membership establishes the
   competition boundary used for replacement.**
   ⛔⛔ THE ADOPTION PATH IS NOT REPAIRED — not moved into `finalizeSlot`, no ACT, no transaction, no audit.
   *"First establish WHAT IS A SLOT MEMBERSHIP CLAIM. Only then decide who is authorized to make it."*
   → `INVESTIGATION_SOTERA_MEMBERSHIP_SEMANTICS.md` · `test/checks/membership-semantics-census.mjs`
㉕ ⭐⭐⭐ WHAT MEMBERSHIP MEANS — traced 2026-09-17 by CONSEQUENCE, ⛔ not by the column name.
   ⭐ IF ONLY `slot_id` CHANGED: which belief may be DISPLACED · what a forget REVIVES · whether M2 can
   GATE. ⛔ AND NOTHING ELSE. ZERO references to `slot_id` in reflection-host · reflection-lifecycle ·
   context-composer · memory-cognition-host · retention-host · dreaming-host · dreaming-candidate-host ·
   and the RETRIEVAL path. ⇒ ⭐⭐ WHAT SHE RECALLS DOES NOT DEPEND ON WHICH SLOT A ROW IS IN.
   ⇒ ⭐⭐⭐ MEMBERSHIP IS **C · REPLACEMENT COMPETITION GROUPING**. ⛔ NOT A (conceptual identity — the
   docstring says so, ⛔ nothing downstream READS it as one) · ⛔ NOT D (retrieval never consults it) ·
   ⚠️ B is an EFFECT of the competition rule, ⛔ not an implementation.
   ⚠️ NAMING HAZARD: `dreaming-candidate-host` returns `slot:{attribute,value}` — ⛔ A DIFFERENT "SLOT".
   ⭐⭐⭐ AND THE SYSTEM HAS ALREADY CLASSIFIED MEMBERSHIP — AS **NOT SEMANTIC**. D1 Phase 3's
   `SEMANTIC_FIELDS` EXCLUDES `slot_id` explicitly: *"deliberately NOT here … they are PLACEMENT AND INDEX
   STATE."* ⇒ ⛔ THE ORPHAN ADOPTION IS NOT AN OVERSIGHT, IT IS A CLASSIFICATION — it patches ONLY
   `slot_id`, so `isSemantic` is false and no writer is required.
   ⚠️⚠️ THE TENSION IN THE SYSTEM'S OWN WORDS: the one gate built to enforce *"every memory-SEMANTIC state
   mutation requires a declared writer"* calls PLACEMENT the field that decides WHICH BELIEF IS DESTROYED.
   ⭐⭐⭐ SAME SLOT ≠ SAME PROPOSITION — MEASURED. 18 live `sotera|lesson` rows: **18 distinct CONTENT,
   18 NULL `value`**. ⚠️ AND THAT GAP IS THE MECHANISM — `resolveConflict` compares `norm(value)`, `''` on
   all 18 ⇒ IT WOULD SEE 18 IDENTICAL ANSWERS WHERE THERE ARE 18 DIFFERENT LESSONS. The PURE plan
   (computed + DISCARDED): `update` · supersedes 1 · collapse 17 ⇒ all 18 invalidated.
   ⇒ ⭐ BOTH HALVES TRUE: a Slot is ⛔ NOT a proposition identity, AND sharing one makes rows MUTUALLY
   EXCLUSIVE. ⇒ THE QUESTION UNDER A-D4: **what makes multiple memories legitimate members of one Slot?**
   ⛔ COLLISION LEFT UNARMED + UNTESTED · ⛔ NO AUDIT ROW ADDED — *"first we need to know what semantic
   event we would be recording."*
   → `INVESTIGATION_SOTERA_MEMBERSHIP_CONSEQUENCES.md` · `test/checks/membership-consequence-census.mjs`
㉖ ⭐⭐⭐ THE WORDING, RULED BY OTE 2026-09-17 — ⛔ NEVER SAY "Slot membership is semantic." SAY:
   **"Slot membership is classified as PLACEMENT/INDEX STATE, but it currently CONTROLS REPLACEMENT
   COMPETITION."** ⭐ D1's classification is INTERNALLY CONSISTENT; the tension is that placement state
   controls a semantic consequence. ⛔ DO NOT MODIFY `SEMANTIC_FIELDS` — *"semantic consequence"* and
   *"semantic object"* are ⛔ NOT logically identical, and that is the open question.
㉗ ⭐⭐⭐ WHAT MAKES TWO MEMORIES COMPETE — 14 predicates, and ⭐ ONLY ONE TESTS WHAT A MEMORY SAYS.
     P2  LIVE only                      CURRENT-STATE EXCLUSIVITY
     P7  `row.slot_id`                  ⚠️ STORAGE GROUPING (D1 calls it placement)
     P8  entity|attribute == label      ⛔ LABEL equivalence, ⛔ NOT proposition
     P9  entity|alias.phrase            LEARNED equivalence (A3-governed)
     P11 `resolution.slotId`            IDENTITY CLAIM BY SIMILARITY — selects the ARENA
     P12 `matches[0]` newest-first      ⚠️⚠️ RECENCY, ⛔ NOT SEMANTICS — decides WHO gets tested
     P13 `norm(primary.value)===norm(v)` ⭐ PROPOSITION EQUIVALENCE — ⛔ RUNS EXACTLY ONCE
     P14 `matches.slice(1)` → extras    ⛔⛔ NONE — **MEMBERSHIP ALONE** ⇒ COLLAPSED UNCONDITIONALLY
   ⛔ `content` NEVER APPEARS ⇒ ⭐ WHAT A MEMORY SAYS PLAYS NO PART IN WHETHER IT IS REPLACED.
   ⭐⭐ PROVEN PURELY (plans computed + DISCARDED): matches=[X,Y,Z], incoming "X" ⇒ duplicate, collapse
   [Y,Z] — ⚠️ TWO DISTINCT PROPOSITIONS INVALIDATED UNCOMPARED. And matches=[W,X] incoming "X" ⇒ UPDATE
   superseding W ⇒ ⚠️ THE ROW WHOSE VALUE MATCHES IS SUPERSEDED BECAUSE IT IS NOT NEWEST.
   ⚠️ 19 of 118 live candidates have EMPTY `value` with populated `content` ⇒ compared as '' vs ''.
   ⭐⭐⭐ THE THREE LAYERS, NOW EVIDENCE-BACKED — QUESTION (047, 1 of 112) · PROPOSITION (`content`,
   unread) · COMPETITION MEMBERSHIP (P7–P11, and it is what ACTS). ⇒ **A-D4 IS NOT "what labels are
   similar enough?" IT IS: WHAT JUSTIFIES COMPETITION MEMBERSHIP?**
   ⭐ THE CANARY IS NOW PERMANENTLY GUARDED — `evidence-baseline-check.mjs` §8 fails BOTH ways: if the
   18 rows are DESTROYED, and if the key becomes ARMED (a slot or alias under `sotera | lesson`).
   → `INVESTIGATION_SOTERA_COMPETITION_MEMBERSHIP.md` · `test/checks/competition-membership-census.mjs`
㉘ ⭐⭐⭐ P15 — A **SECOND** MEMBERSHIP PREDICATE, AND IT NEEDS NO SLOT (found 2026-09-17; the previous
   census MISSED it). `forget`/`revive` key on the SAME dual key as `buildSlotView`:
     `slotKey = row.slot_id ? {slotId} : {entity, attribute}`
     `reviveSuperseded: if (findLiveInSlot(slotKey).length > 0) return null`   ⇒ ⭐ A VETO
     `restore: holder = findLiveInSlot(...)` ⇒ the restored row returns SUPERSEDED, ⛔ not live
   ⇒ ⭐⭐⭐ **17 LESSONS ALREADY SHARE ONE `findLiveInSlot` KEY — TODAY, WITH NO SLOT.** ⇒ THE CANARY'S
   STATUS IS TWO-PART: ⛔ UNARMED for reconcile (no slot ⇒ no `matches`) · ⚠️ ALREADY LIVE for
   forget/revive. ⛔ P15 DESTROYS NOTHING — it WITHHOLDS RESTORATION. A veto, ⛔ not an invalidation.
㉙ ⭐⭐⭐ CAN MEMBERSHIP BE WRONG? FALSE POSITIVE ✅ CONFIRMED (the canary · the shipped `work schedule`
   defect). FALSE NEGATIVE ⚠️ **NOT ESTABLISHED** — 0 groups split across slots; ⛔ reported as
   not-established, ⛔ NEVER as "none exists" (the instrument tests structural proxies only).
   ⭐⭐ THE MIRROR: `location = Bangkok` and `timezone = Bangkok` — ONE VALUE, TWO PROPOSITIONS, correctly
   in different slots. ⇒ canary says ONE MEMBERSHIP ≠ ONE PROPOSITION; Bangkok says ONE VALUE ≠ ONE
   PROPOSITION. ⇒ ⛔ **P13 IS A PROPOSITION TEST ONLY *CONDITIONAL ON MEMBERSHIP BEING RIGHT*** — where
   membership is wrong it compares ANSWERS TO DIFFERENT QUESTIONS, which is what `work schedule` did.
   ⭐⭐⭐ MEMBERSHIP ALONE UNLOCKS TWO OPERATIONS, BOTH ACTING ON A ROW WHOSE CONTENT WAS NEVER READ:
   ⛔ COLLAPSE AS AN EXTRA (P14 — invalidates) · ⚠️ VETO A REVIVAL (P15 — withholds, no slot needed).
   ⇒ ⭐ ON THE EVIDENCE THE THIRD LAYER IS AN **OPERATIONAL GROUPING**: 1 of 11 predicates claims anything
   about what a memory SAYS · the most destructive one (P14) claims NOTHING (it is the ABSENCE of a
   predicate — "not newest") · the one selecting the arena (P11) is a GUESS.
   ⛔ BUT THAT IS A DESCRIPTION OF THE IMPLEMENTATION, ⛔ NOT a finding that the grouping is ILLEGITIMATE,
   and the false-negative direction was NOT established. ⛔ OTE'S TO RULE.
   → `INVESTIGATION_SOTERA_COMPETITION_PREDICATES.md` · `test/checks/competition-predicate-trace.mjs`
㉚ ⭐⭐⭐ MEMBERSHIP IS AN **AUTHORIZATION BOUNDARY FOR STATE TRANSITIONS** (Ote, 2026-09-17), ⛔ not merely
   a comparison set. P14 INVALIDATES on membership alone · P15 VETOES A RESTORATION on membership alone ·
   ⛔ NEITHER establishes that the member represents the same proposition.
   ⭐⭐⭐ AND THERE IS NO SINGLE COMPETITION CONCEPT — ⭐ AT LEAST THREE RELATION SHAPES, ONE KEY:
     DESIGNATED HOLDER   reconcile/replace · revive/restore
     PAIRWISE            collapse
     CLAIM↔QUESTION      M2 admission gating   (⛔ not a memory-to-memory relation at all)
     NONE                forget  (⭐ the ONLY operation whose requirement and code agree)
   ⚠️⚠️ COLLAPSE AND REVIVE FIRE ON THE SAME TEST AND NEED **OPPOSITE** THINGS: collapse needs the other
   member to be THE SAME PROPOSITION (sameness); revive needs it to OCCUPY A ROLE (occupancy).
   ⭐⭐⭐ COLLAPSE IS THE WORST-MATCHED PAIR — it requires PAIRWISE PROPOSITION EQUIVALENCE and is
   authorized by BARE SET MEMBERSHIP. THE STRONGEST RELATION REQUIRED, THE WEAKEST EVIDENCE SUPPLIED.
   ⇒ ⛔ AND THERE IS NO SINGLE FIX SHAPE: collapse has an EVIDENCE gap · revive a PRECISION gap ·
   replace a PROXY gap (recency stands in for role) · M2 an INHERITED gap · forget NO gap.
   ⭐⭐ P13 CANNOT BE EVALUATED IN ISOLATION ⇒ **THE `work schedule` INCIDENT WAS NOT A P13 FAILURE** —
   P13 faithfully compared two values AFTER THE WRONG ARENA HAD ALREADY BEEN SELECTED.
   ⭐ EXPOSURE TODAY: P14 ⛔ DORMANT (0 slots hold >1 live row — ⚠️ THE INVARIANT, NOT A PREDICATE, IS
   WHAT PROTECTS IT) · P15 ⚠️ ACTIVE, and its ONLY live grouping is the canary (17 rows).
   ⭐ BOUNDARY CASE TO KEEP: duplicate LABELS are ⛔ NOT automatically suspicious — `user|communication
   preference` ×2 and `user|current activity` ×2 are separated by `user_id`: DIFFERENT PEOPLE, and P3 is
   right. ⛔ SCOPE IS NOT ANOTHER LABEL DIMENSION — the owner is part of what the question is ABOUT.
   → `INVESTIGATION_SOTERA_COMPETITION_UNIT.md` · `test/checks/competition-unit-trace.mjs`
㉛ ⭐⭐⭐ WHAT A STATE CHANGE ACTUALLY CLAIMS (2026-09-17). ⛔ WORDING, CORRECTED BY OTE: ⛔ NOT "membership
   is an authorization boundary"; ✅ **"IN THE CURRENT IMPLEMENTATION, membership is an INPUT that
   AUTHORIZES OR VETOES certain state transitions."** ⇒ keeps the observation apart from whether it SHOULD.
   ⭐⭐⭐ `invalid_at` HAS **SIX** WRITERS AND ⛔ NOT ONE CLAIMS THE PROPOSITION BECAME FALSE:
     supersede · collapse · identity rename · consolidation · lesson revise · ⭐ RESTORE-WHILE-BLOCKED.
   ⭐ THE DECISIVE ONE: `restore` on an occupied slot sets `invalid_at = row.invalid_at ?? now()` ⇒ a row
   FORGOTTEN WHILE LIVE gets `invalid_at` = THE RESTORE TIMESTAMP. ⛔ Nothing about the world changed —
   it literally records *"the moment we decided not to make it live."*
   ⭐⭐ AND THE DESIGN ALREADY KNOWS THE DISTINCTION — `markContradicted`: *"⛔ It does NOT set
   `invalid_at`. 'Somebody said this is wrong' and 'this was replaced' are two [different things]."*
   ⚠️ ⛔ AND DO **NOT** SAY "`invalid_at` MEANS REPLACED" (Ote corrected me 2026-09-17) — ⛔ TOO BROAD, and
   asserting it REPEATS THE VERY ERROR THIS ARC AVOIDS: collapsing several different transitions into one
   meaning because they share a column. ✅ SAY INSTEAD: **"EVERY CURRENT WRITER OF `invalid_at` IS MAKING A
   NON-WORLD-TRUTH CLAIM ABOUT THE MEMORY'S OR OBSERVATION'S STATUS, ROLE, OR HISTORY."** ⇒ what IS
   established is the NEGATIVE: *"the proposition became false"* is ⛔ NOT a valid common reading.
   It is the MODEL DOCSTRING ("expired IN THE WORLD") that OVERREACHES, ⛔ not the writers.
   `contradicted_at` = the ONE truth-shaped state, used on 3 of 233.
   ⚠️ `supersedes_id` HAS TWO INCOMPATIBLE CONVENTIONS: the FACT path points BACK ("the row I replaced"),
   the LESSON path sets it on the PRIOR row pointing FORWARD ("the row that replaced me"). Corpus: 77
   backward · **0 forward** ⇒ ⛔ THE COLLISION IS **LATENT, NOT MANIFEST**. ⚠️ Know it before reading the
   chain generically.
   ⚠️ `expired_at` = TWO ACTS IN ONE COLUMN: a DELIBERATE archive (`forget`) and ABSORPTION into a card
   (consolidation). ⛔ Only the first matches the declared meaning.
   ⭐ THE SORT: TRUTH OF THE PROPOSITION → `contradicted_at` ONLY (3/233) · CURRENT ROLE → `invalid_at`,
   all six writers · OBSERVATION HISTORY → `supersedes_id` · STORAGE → `expired_at` (partly), `tier`,
   ⛔ and `valid_at` despite its name (177/211 within 2s of `created_at`).
   ⇒ ⭐⭐⭐ THERE IS NO STATE THAT SAYS *"this proposition is no longer true"* AND IS ACTUALLY USED.
   ⭐ THE MIRA COUNTER-EXAMPLE STANDS: the displaced row was NEVER FALSE — she DID train in Chiang Mai.
   ⛔ NOTHING RE-CLASSIFIED · ⛔ NO RELATION VOCABULARY INTRODUCED · ⛔ the nine keep their recorded fates.
   → `INVESTIGATION_SOTERA_STATE_TRANSITION_SEMANTICS.md` · `test/checks/state-transition-semantics.mjs`
㉜ ⭐⭐⭐ THE SIX `invalid_at` WRITERS ARE **SIX DIFFERENT EVENTS** (traced 2026-09-17). ⭐ ROLE CHANGES IN
   ALL SIX · ⛔ THE PROPOSITION CHANGES IN NONE. ⚠️ W2 (collapse) is the ONLY one asserting anything
   propositional — *"duplicate"* — and it VERIFIES NOTHING.
     W1 supersede          ROLE                      ⛔ doesn't establish the old is false, or same-question
     W2 collapse           ROLE + a ? PROPOSITION    ⛔⛔ doesn't establish they ARE duplicates (P14)
     W3 identity rename    OBSERVATION + ROLE        *"what she used to call me"* — ⛔ not "wrong"
     W4 consolidation      OBS + ROLE + STORAGE      members ABSORBED, ⛔ not doubted
     W5 lesson revise      OBS + ROLE                ⭐ THE ONLY WRITER WHOSE RELATION IS **DECLARED** BY AN
                                                     ACTOR (she picks 1 of 4) — ⚠️ and it has never run
     W6 restore-blocked    ROLE + STORAGE            ⭐⭐ MOVES THEM IN **OPPOSITE DIRECTIONS IN ONE PATCH**
                                                     — un-archives (storage) while marking invalid (role)
   ⭐⭐⭐ THE CLEANEST PROOF, AND IT NEEDS NO DOCSTRING: `reviveSuperseded` does
   `update([prior.id], {invalid_at: null})` — FIRED WHEN **THE ROW THAT DISPLACED IT IS FORGOTTEN**.
   ⇒ **A TRUTH CLAIM CANNOT BE UNDONE BY DELETING A DIFFERENT ROW. A ROLE VACANCY CAN.** The field's own
   REVERSIBILITY and its TRIGGER settle what it tracks.
   ⇒ ⚠️ SIX EVENTS, ONE FIELD, ⛔ NO WAY TO TELL THEM APART AFTER THE FACT — the nine-transition finding
   again, now traced to the WRITERS rather than the READERS. ⛔ NO VOCABULARY PROPOSED.
   ⭐ KEEP AS EXAMPLES: `supersedes_id` = IMPLEMENTATION CONVENTION ≠ ESTABLISHED CORPUS SEMANTICS
   (fact=backward, lesson=FORWARD, 0/77 forward ⇒ LATENT, ⛔ not defective) · `expired_at` = a STORAGE
   event and a BELIEF event sharing one column without being the same act.
   → `INVESTIGATION_SOTERA_TRANSITION_EVENTS.md` · `test/checks/transition-event-trace.mjs`
㉝ ⭐⭐⭐ THE SYNTHESIS — ⭐ READ THIS ONE FIRST: `SYNTHESIS_SOTERA_MEMORY_BOUNDARIES.md`.
   ⭐⭐⭐ TWO COMPRESSION POINTS, ON EITHER SIDE OF THE ACT (Ote's framing):
     ① BEFORE the transition — different RELATIONSHIPS compressed into MEMBERSHIP
     ② AFTER  the transition — different EVENTS compressed into ROW STATE
   THE CHAIN: OBSERVATION → PROPOSITION → QUESTION → MEMBERSHIP → TRANSITION EVENT → ROW STATE.
   ⭐ HEALTHIEST BOUNDARY: **OBSERVATION** — D1 Phase 3 made provenance DECLARED AND REFUSABLE, and it holds.
   ⭐⭐ THE ONLY BOUNDARY BUILT TO THE STANDARD THE REST NEEDS IS **QUESTION** (047) — ⚠️ AND IT IS EMPTY.
   ⭐⭐⭐ SIX QUESTIONS MUST BE ANSWERABLE FOR A TRANSITION TO BE JUSTIFIED:
     ① which question is at stake?            ⚠️ guessed · declared on 1 of 112
     ② does this observation answer it?        ⛔ NOT ASKED — membership substitutes
     ③ what does the incumbent assert?         ⚠️ read from `value`, EMPTY on 19 of 118
     ④ what relation does the incoming bear?   ⚠️ string inequality, FOR ONE ROW ONLY
     ⑤ what is happening to the incumbent, why? ⛔ compressed into `invalid_at`
     ⑥ who is accountable?                     ⚠️ the ROW has a writer; membership + transition DO NOT
   ⇒ ⭐⭐⭐ **EVERY ONE IS ANSWERABLE AT THE MOMENT THE TRANSITION RUNS. NONE IS PRESERVED.**
   ⇒ ⭐ THE RECURRING FAILURE ACROSS THE WHOLE ARC IS ⛔ NOT IGNORANCE — **IT IS DISCARD.** The system
   computes the semantics and persists only the artifact.
   ⚠️ ⛔ AND DO NOT SAY "recovering it means carrying forward what is already known" (Ote corrected me
   2026-09-17) — ⛔ THAT OVERCLAIMS RECOVERABILITY. Established: the information EXISTS AT THE SEAM AND IS
   DISCARDED, and surviving source material OFTEN makes reconstruction possible (9/9 turns reachable).
   ⛔ NOT established: that EVERY discarded runtime distinction is recoverable later. ✅ SAY INSTEAD:
   **"The next design should CARRY FORWARD the semantic information already established at the seam,
   rather than requiring later components to RECONSTRUCT it from artifacts."**
   ⛔ THE SYNTHESIS PROPOSES **NO** COLUMN, TABLE, FIELD, ENUM OR VOCABULARY — "what must be answerable" is
   stated as A QUESTION THAT MUST HAVE AN ANSWER AT THE SEAM, ⛔ not a place to store one.
   ⏸ 7 DECISIONS REMAIN GENUINELY OPEN (synthesis §4) + the FALSE-NEGATIVE direction still unmeasured.
㉞ ✅⛔ **THE EVIDENCE PHASE IS CLOSED (Ote, 2026-09-17). THE NEXT PHASE IS SEMANTIC DECISIONS, ⛔ NOT CODE.**
   → `ADR_SOTERA_MEMORY_SEMANTIC_DECISIONS.md` — 7 decisions IN DEPENDENCY ORDER, each as
   `question → evidence → constraints → interpretations → would require → unresolved choice`.
   ⛔ NO PREFERRED ANSWER · ⛔ NO SCORING · ⛔ NO IMPLEMENTATION HIDDEN INSIDE AN INTERPRETATION.
     ① REPLACEMENT SEMANTICS   what does each kind of transition MEAN?
     ② COMPETITION MEMBERSHIP  what justifies putting two observations in one arena?
     ③ ROUTING ↔ 047           does "never inferred" reach ROUTING, or only declaration/admission?
     ④ `invalid_at` POSITIVE   ⏸ HELD OPEN ON PURPOSE — deciding it first would FORECLOSE ① and ②
     ⑤ NON-SLOT-SHAPED MEMORY  what are the 53, architecturally?
     ⑥ B-D1 (radius) / B-D3 (may `incomplete` claim `attestedBySource`?)
     ⑦ A1 AUTHORITY            ⏸ LAST BY CONSTRUCTION — blocked on ①②③, ⛔ not because it matters least
   ⭐ THE SIX ANCHORS ARE NOW **EVIDENCE BOUNDARIES, ⛔ NOT IMPLEMENTATION OPINIONS** — cite them in any
   decision: ① Mira *"non-current without becoming false"* · ② membership ≠ proposition · ③ value ≠
   proposition · ④ `supersedes_id` LATENT not defective · ⑤ `expired_at` storage-vs-belief · ⑥ `user_id`
   scope IS semantically meaningful (⛔ a duplicate label is NEVER automatically suspicious).
   ⛔ TREE FROZEN AT THE CLOSE: 753/753 · evidence baseline green · canary 18 rows / 0 slots · both armed
   collisions intact · ⛔ nothing written to the database.
㉟ ⭐⭐⭐ DECISION ① ANALYSIS (2026-09-17) — ⛔ ANALYSIS, NOT A SOLUTION. The nine, one level down.
   ⭐⭐⭐ WHAT THE SEAM KNEW: **EVERY ONE OF THE NINE WAS `lexical 1.000`** — one arm, one confidence,
   ⚠️ INCLUDING BOTH DEFECTS. ⇒ ⛔ THE NUMBER IS A TRUE STATEMENT ABOUT THE PHRASE AND A FALSE STATEMENT
   ABOUT THE QUESTION. Confidence carries NO information about correctness here — ⇒ ⛔ no threshold could
   have separated them, and that is now settled for this corpus.
   ⭐⭐ THE DISCARDED DISTINCTION: THE **MATCHED PHRASE**. Both defects matched an ALIAS, ⛔ not the label
   (`"schedule"` · `"volunteer_schedule_and_location"` → `work schedule`) — and it survives ONLY inside a
   FREE-TEXT `reason`. ⚠️⛔ BUT IT IS **A SIGNAL, NOT A TEST**: two CORRECT transitions also matched an
   alias (`"preference"` → `"communication preference"`).
   ⚠️ 8 of 9 carry a supersede audit row. ⭐ THE EXCEPTION IS `current goal` — THE ONE WHOSE REASON *IS* IN
   THE RECORD (`contradicted_at`, set by a HUMAN). ⇒ the audited path records everything EXCEPT the reason.
   ⭐ ACROSS ALL NINE: `OBSERVATION +` and `ROLE ✎` — ⛔ `PROPOSITION ✎` IN ONLY TWO (#4 partly, #6 the
   repudiation). ⇒ in SEVEN of nine, ⛔ NOTHING ABOUT WHAT IS TRUE CHANGED.
   ⭐⭐⭐ THE ADR'S FOUR INTERPRETATIONS ARE **NOT EXHAUSTIVE**. Sorting by WHAT OCCURRED:
     1 a replacement in any ordinary sense (Mira) · 1 a repudiation (current goal) · **4 re-statements where
     NOTHING WAS REPLACED** · 1 a partial change inside a coordinated value · **2 ARTIFACTS OF A ROUTING
     FAILURE** ⇒ ⭐ AT MOST **1 OF 9** IS A REPLACEMENT.
   ⇒ TWO READINGS EXPOSED BY THE EVIDENCE, ⛔ ADDED TO THE MATRIX, ⛔ NOT RECOMMENDED:
     ⑤ **"REPLACEMENT" IS NOT A NATURAL KIND** — the word is THE MECHANISM'S NAME FOR ITS OWN ACTION, ⛔ not
       a description of what occurred. Asking *"what does a replacement mean?"* PRESUPPOSES THE CATEGORY.
     ⑥ **THE LOCUS MAY BE THE ARENA, ⛔ NOT EITHER ROW** — in #8/#9 NEITHER ROW CHANGED; what changed is
       WHICH ARENA the incoming was placed in. ⓘ Would also explain why `invalid_at` is reversible by an
       event on a DIFFERENT row.
   ⭐ THE GUARDRAIL HOLDS, and #7 sharpens it FROM THE OTHER SIDE: ⛔ **NO STATE CAN SAY "TRUE, BUT NO
   LONGER CURRENT."** Not that `invalid_at` says too much — that NOTHING says the right thing.
   ⏸ ⛔ AWAITING OTE'S READING. ⛔ ② NOT OPENED · ③–⑦ FROZEN · ⛔ no implementation between decisions.
   → `ANALYSIS_SOTERA_NINE_TRANSITIONS_SEMANTIC.md` · `test/checks/nine-transition-semantic-analysis.mjs`
㊱ ⭐⭐⭐ DECISION ① FINAL PASS — reframed BY OTE: ⛔ NOT "replacement events" but **NINE CHANGES OF
   INCUMBENT STATUS**. ⇒ ⭐ his reframed question: *"When the competition machinery causes one observation
   to cease being the current holder, WHAT SEMANTIC OCCURRENCE, **IF ANY**, has actually happened?"*
   ⭐ **"IF ANY" IS LOAD-BEARING** — in #8/#9 the answer is **NONE**.
   ⭐⭐⭐ THE CAUSAL SORT — **PROPOSITION-LEVEL SEMANTICS CAUSED 1 OF 9**:
     3  OBSERVATION-LEVEL (a new observation of an UNCHANGED proposition)   #1 #2 #5
     2  ⭐ ARENA MEMBERSHIP ALONE — ⛔ NEITHER ROW CHANGED IN ANY WAY        #8 #9
     1  ⚠️ UNDETERMINED (left contested)                                    #3
     1  PROPOSITION-LEVEL + QUESTION IDENTITY                               #4
     1  OBSERVATION-LEVEL + EXTERNAL JUDGEMENT                              #6
     1  ⭐ PROPOSITION-LEVEL — THE ONLY ONE                                  #7
   ⇒ ⚠️ THE COMPETITION MACHINERY FIRES PREDOMINANTLY ON EVENTS THAT ARE NOT ABOUT WHAT IS TRUE.
   ⭐⭐⭐ AND ⛔ ONE OF THE NINE WAS NOT THE COMPETITION MACHINERY: #6 is `writer=operator`,
   `act_id=reconcile:rome-2026-09-02`, ⛔ ZERO supersede audit rows. ⇒ the framing is true of **EIGHT**.
   ⇒ ⭐ THE PATTERN: **THE ONLY CASE THAT PRESERVED ITS SEMANTIC FACT IS THE ONLY ONE THE MACHINERY DID NOT
   PERFORM.** ⛔ An observation about these nine, ⛔ NOT a law.
   ⭐⭐ #4, LOCALISED: the change is REAL and it is **INSIDE THE VALUE** (Claude: Builder/BROTHER →
   UNCLE/Builder). ⇒ **THE GRANULARITY OF THE CHANGE IS THE SUB-PROPOSITION; THE GRANULARITY OF THE
   MECHANISM IS THE WHOLE VALUE** — ⛔ no level exists at which to say so. ⚠️ And QUESTION IDENTITY is
   UPSTREAM: the three share one arena ONLY because ONE LABEL NAMED THEM.
   ⭐⭐⭐ #8/#9, LOCALISED: ⛔ **NO SEMANTIC CHANGE OCCURRED AT ALL.** Both propositions true before and
   after; neither observation changed. The ONLY event is THE ARENA PLACEMENT (via the `schedule` and
   `volunteer_schedule_and_location` aliases). ⇒ ⭐ THE ARENA ASSIGNMENT IS CAUSALLY UPSTREAM OF EVERYTHING
   THE ROWS LATER REPORT, and **THE ROW STATE DESCRIBES A CHANGE THAT NEVER HAPPENED.**
   ⏸ ⛔ AWAITING OTE'S RULING ON ①. ⛔ ② NOT OPENED · ③–⑦ FROZEN.
   → `ANALYSIS_SOTERA_INCUMBENT_STATUS_CHANGES.md` · `test/checks/incumbent-status-change-trace.mjs`
㊲ ⭐⭐⭐ DECISION ② OPENED (Ote, 2026-09-17) — *"Is membership merely an INDEX used after semantic identity
   has already been established, or is membership itself MAKING A SEMANTIC CLAIM?"*
   ⇒ ⭐⭐⭐ THE ANSWER IS **NEITHER, UNIFORMLY**. Ordered by the STRENGTH each consumer requires of the
   SAME key, while ⛔ THE EVIDENCE BEHIND IT NEVER CHANGES:
     M2 ADMISSION  needs NOTHING — it SCOPES, then asks its OWN declared question   ⇒ read as an INDEX
     REVIVE        "this arena has a holder"                                        ⇒ a ROLE claim
     REPLACE       "these answer the same question"                                 ⇒ a QUESTION claim
     COLLAPSE      "these are the same proposition"                                 ⇒ a PROPOSITION claim
   ⇒ ⭐⭐ MEMBERSHIP IS AN **INDEX** WHERE THE CONSUMER SUPPLIES ITS OWN EVIDENCE (M2), AND A **CLAIM**
   WHERE IT SUPPLIES NONE (collapse). ⛔ THAT IS NOT A PROPERTY OF MEMBERSHIP — IT IS A PROPERTY OF EACH
   CONSUMER. ⇒ ⭐⭐⭐ **"COMPETITION MEMBERSHIP" IS NOT ONE SEMANTIC CONCEPT — IT IS ONE OPERATIONAL KEY
   BEARING FOUR DIFFERENT LOADS, AND ONLY ONE CONSUMER PAYS FOR WHAT IT TAKES.**
   ⭐ ONLY M2 SUPPLIES ITS OWN EVIDENCE — and it is the ONLY consumer that PERSISTS ITS REASON.
   ⭐ ONLY COLLAPSE SUPPLIES NONE — and it makes the STRONGEST claim.
   ⛔ NO TWO CONSUMERS REQUIRE THE SAME RELATION. ⚠️ REPLACE and REVIVE share a SHAPE (designated holder)
   but ⛔ NOT a relation: "same question" vs "the role is occupied".
   ⭐ IF MEMBERSHIP IS **WRONG**: replace + collapse DESTROY · revive WITHHOLDS · M2 mislabels but REFUSES
   NO WRITE · forget unaffected. IF **MISSING**: safe for replace/collapse/M2 · ⛔ IMPOSSIBLE for revive.
   ⭐⭐⭐ ABSTENTION IS ASYMMETRIC — the INCOMING may be unplaced (`slotId: null` ⇒ NEW), ⛔ an EXISTING
   live row NEVER is: `buildSlotView` synthesises an EPHEMERAL arena keyed `entity|attribute`.
   ⇒ ⚠️ **53 of 118 live candidates sit in an arena nobody established** — permanently potential
   competitors, ⛔ including rows no resolver ever examined. ⚠️ Read against ①: arena assignment CAN cause
   a false incumbent-status change, and for existing rows THE ASSIGNMENT IS MANDATORY.
   ⏸ ⛔ AWAITING OTE. ⛔ ③–⑦ FROZEN · ⛔ canary untouched · ⛔ both armed collisions STILL ARMED.
   → `INVESTIGATION_SOTERA_COMPETITION_SEMANTIC_BOUNDARY.md` · `test/checks/competition-consumer-trace.mjs`
㊳ ✅⭐⭐⭐ **DECISION ② IS RULED (Ote, 2026-09-17).** ⛔ NOT a finding — A RULING, and it binds everything after.
   > **"Competition membership is not a single semantic concept. An operational arena/key may be used to
   > NARROW CANDIDATES, but membership in that arena does not, by itself, establish ANY particular semantic
   > relationship between the observations within it. THE CONSUMER MUST ESTABLISH WHATEVER RELATIONSHIP IT
   > NEEDS FOR ITS OWN OPERATION."**
   ⛔ MEMBERSHIP DOES NOT ESTABLISH: same proposition · same question · role occupancy · equivalence.
   ✅ MEMBERSHIP MAY STILL BE A USEFUL INDEX / SCOPING MECHANISM.
   ⇒ ⭐ **P14 IS ESPECIALLY PROBLEMATIC — collapse currently treats membership AS IF it were proposition
   equivalence.** ⇒ ⭐ AND REPLACE CANNOT TREAT MEMBERSHIP AS PROOF OF QUESTION IDENTITY.
   ⭐⭐⭐ THE NEW CONSTRAINT, CARRIED FORWARD (his words):
   > **"Being REACHABLE BY an arena key must not be confused with HAVING BEEN SEMANTICALLY ESTABLISHED as a
   > member of that arena."**
   ⚠️ Made concrete by the asymmetric abstention: an EXISTING row can become a potential competitor WITHOUT
   EVER HAVING UNDERGONE A SEMANTIC ROUTING DECISION — **53 of 118**. ⛔ Not to be solved yet; carried.
㊴ ⭐⭐⭐ DECISION ③ OPENED — *"If membership carries no semantic authority, WHERE DOES THE SYSTEM OBTAIN THE
   AUTHORITY to say an observation belongs to a particular question?"*
   ⇒ ⭐⭐⭐ **IT DOES NOT OBTAIN IT. IT COMPOSES IT.**
     `(observation → slot)` ⚠️ INFERRED, UNGOVERNED   ∘   `(slot → question)` ⭐ DECLARED, GOVERNED
   ⇒ **THE OBSERVATION↔QUESTION RELATION IS NEVER DIRECTLY ESTABLISHED.** The composition INHERITS THE
   WEAKER LINK, and ⛔ THE COMPOSITION ITSELF IS NEVER DECLARED, NEVER CHECKED, NEVER RECORDED AS ONE.
   ⚠️ THE ROUTING DECISION (resolver, step 3) HAPPENS **BEFORE** THE QUESTION LAYER IS REACHED (step 6) —
   and step 6 reaches it THROUGH THE SLOT STEP 3 CHOSE.
   ⭐⭐ `claimKind` IS THE ONE DECLARED OBSERVATION→QUESTION CHANNEL, and it ALREADY CARRIES 047'S
   DISCIPLINE VERBATIM: *"WHICH DECLARED QUESTION THIS CLAIM ANSWERS … its absence is an ANSWER rather than
   a gap … ⛔⛔ NEVER INFERRED AND NEVER DEFAULTED."* ⛔ **AND IT IS PURE TRANSPORT — STRIPPED AT
   `store.create` (`claimKind: _ck, ...persistable`), ZERO `%claim%` COLUMNS.** ⇒ ⭐ EVEN WHEN A WRITER
   DOES SAY, **THE SAYING DOES NOT SURVIVE.**
   ⭐⭐⭐ **NOTHING IN THE SYSTEM EVER CHECKS AN OBSERVATION AGAINST A QUESTION.** `checkKind` asks whether
   TWO DECLARATIONS AGREE (and the writer is agreeing about a slot IT DID NOT CHOOSE); the declared
   `checks` test only the ANSWER'S FORM (nonempty · single-line · no-trailing-ellipsis · is-iso-date).
   ⛔ THERE IS **NO ACT** ESTABLISHING observation → slot. Minting is `findOrCreate`.
   ⛔⛔ **ZERO ORGANIC PRECEDENT**: 0 bind acts · 0 pinned rows outside the harness canary. Every artifact of
   the declared question layer was made BY AN OPERATOR, ON A TEST FIXTURE, ON ONE DAY (`canary-bind-
   2026-09-03-*`). ⇒ ⛔ THERE IS NO PRODUCTION BEHAVIOUR FROM WHICH TO READ AN INTENT.
   → `INVESTIGATION_SOTERA_ROUTING_AUTHORITY.md` · `test/checks/routing-authority-trace.mjs`
㊵ ✅⭐⭐⭐ **DECISION ③ IS RULED: BROAD** (Ote, 2026-09-17).
   > **"Routing an observation to a question is DECIDING WHICH QUESTION THAT OBSERVATION ANSWERS, therefore
   > the 047 'declared, never inferred, never defaulted' principle APPLIES TO THAT RELATIONSHIP."**
   ⭐ THE REASON IS ⛔ NOT "047 sounds like it should apply" — it is that ROUTING IS NOT CHOOSING A STORAGE
   ADDRESS: it DETERMINES THE QUESTION under which the observation later participates in ADMISSION and
   REPLACEMENT. And ② already ruled membership carries no semantic authority. ⇒ therefore:
     inferred (observation → slot)  +  declared (slot → question)  ⛔ ≠  authoritative (observation → question)
   ⭐⭐⭐ **A STORAGE/ROUTING KEY CANNOT MANUFACTURE SEMANTIC QUESTION IDENTITY.**
   ⚠️ THE ARCHITECTURE IS SEMANTICALLY BACKWARDS AT THIS SEAM:
     CURRENT   observation → infer slot → declared question → admission
     REQUIRED  observation ──────────────→ question, with DECLARED AUTHORITY
   ⛔ HOW to implement that is NOT ruled. ⛔ AND IT IS **NOT** RULED THAT EVERY OBSERVATION MUST CARRY A
   QUESTION — `claimKind` already establishes that ABSENCE CAN LEGITIMATELY MEAN *"the writer did not
   declare which question this answers."*
   ⇒ ⭐⭐ **"NOT DECLARED" AND "INCORRECTLY INFERRED" MUST REMAIN DISTINGUISHABLE.**
㊶ ⭐⭐⭐ DECISION ④ ANALYSIS — *"What claim, if any, is a writer making when it sets `invalid_at`?"*
   ⇒ ⭐⭐⭐ **THERE IS NO COMMON SEMANTIC CLAIM.** 5 distinct dimension signatures across 6 writers.
   ⭐ The ONLY shared content is *"this row no longer holds a role"* — ⛔ a fact about THE SYSTEM'S
   ARRANGEMENT, ⛔ NOT a claim about the memory. ⚠️ Everything the six DISAGREE about is the semantics.
   ⭐⭐⭐ THE DECISIVE PROOF — **THE SYSTEM'S OWN REVERSAL RULES ALREADY SEPARATE THEM**:
     4 of 6 reversible by the ordinary un-supersede path (W1 supersede · W3 rename · W4 card · W6 restore)
     ⛔ W2 COLLAPSE — DELIBERATELY IRREVERSIBLE, and the source NAMES THE DISTINCTION IT IS DRAWING:
        *"they were removed for being **REDUNDANT**, not for being **WRONG**."*
     ⚠️ W5 LESSON — irreversible ACCIDENTALLY: the FORWARD `supersedes_id` leaves the revival path nothing
        to follow. ⛔ LATENT (0 rows).
   ⇒ ⭐⭐ **THE SYSTEM ALREADY TREATS THESE AS DIFFERENT CLAIMS — IT SIMPLY STORES THEM IDENTICALLY.**
   ⭐ THE DISTINCTION LIVES IN THE REVERSAL RULE, ⛔ NOT IN THE FIELD.
   ⭐⭐ WHAT ③ ADDS: **W1 AND W2 SET `invalid_at` ON THE STRENGTH OF AN UNDECLARED QUESTION RELATION** —
   exactly what ③ says may not be inferred. ⚠️ The other four make NO question claim at all (W5 never even
   enters the slot layer). ⇒ ⛔ `invalid_at` IS NOT EVEN UNIFORM ABOUT WHETHER A QUESTION IS INVOLVED.
   ⭐ THREE STATEMENTS, STORED IDENTICALLY: W1 *"true but no longer current"* · W2 *"redundant, not wrong"* ·
   W6 *"something else holds the arena"*.
   ⛔ NO POSITIVE DEFINITION PROPOSED — ④ stays open until ① is settled, per the ADR. This pass establishes
   ONLY that a single positive definition IS NOT AVAILABLE from the writers as they stand.
   → `INVESTIGATION_SOTERA_INVALID_AT_CLAIM.md` · `test/checks/invalid-at-claim-trace.mjs`
㊷ ⚠️ INSTRUMENT DEFECT #22 — **#14 RECURRING IN A NEW FILE.** Two whole-sentence source anchors FAILED on
   sentences plainly present: the normaliser collapsed whitespace but left the **`//` COMMENT MARKER INSIDE
   THE PHRASE** where the comment wrapped mid-sentence. ⛔ THE TEMPTING FIX — SHORTENING THE ANCHOR — WOULD
   HAVE MADE IT PASS **AND** VACUOUS. ⇒ ⭐ STRIP LINE-LEADING `//` AND `*` **BEFORE** COLLAPSING, and keep
   the anchor a WHOLE SENTENCE. ⚠️ Same family as #17 (a Postgres `::` cast read as an object-key colon).
㊸ ⭐⭐⭐ **METHOD CHANGE (Ote, 2026-09-17): BATCH THE INVESTIGATIONS, ⛔ NEVER BATCH THE RULINGS.**
   ⇒ ④⑤⑥⑦ investigated together → `INVESTIGATION_SOTERA_BATCH_4567.md` ·
   `test/checks/memory-semantics-batch.mjs`. ⛔ FOUR RULINGS STILL OUTSTANDING, to be made SEPARATELY.
   ④ ⭐⭐⭐ **REVERSIBILITY IS STRUCTURAL, ⛔ NOT SEMANTIC.** 81 dead rows · 77 pointed at by a
     `supersedes_id` · **4 POINTED AT BY NOTHING ⇒ STRUCTURALLY UNREACHABLE.** `reviveSuperseded` can only
     reach a row VIA `supersedes_id` ⇒ ⭐ A ROW IS RECOVERABLE IFF SOMETHING HAPPENED TO POINT AT IT — a
     DIFFERENT FIELD. ⇒ ⚠️ two writers meaning different things get the SAME reversibility; ONE writer can
     produce BOTH outcomes in one act. ⚠️ AND THE AUDIT DISAGREES WITH THE ROW STATE on `user|location`
     (audit says `supersede`, nothing points at it) — ⛔ THE RECORD DOES NOT EXPLAIN IT; no story invented.
   ⑤ ⭐⭐⭐ **THE PROPOSITION *IS* IN THE ROW — CONSTRUCTED AT WRITE TIME INTO `content`** from
     `(entity + attribute + value)`: 147/147 live semantic rows have `content`, **0 have content===value**,
     83 have `value` NESTED INSIDE `content` (`"<entity>'s <attribute>: <value>"`).
     ⇒ ⭐⭐ **TWO FIELDS, TWO CONSUMERS: RETRIEVAL RETURNS `content`; THE CONFLICT RULE READS `value`.**
     ⇒ WHAT SHE RECALLS AND WHAT COMPETES ARE DIFFERENT STRINGS ON THE SAME ROW.
     ⚠️⚠️ AND THE CONSTRUCTED PROPOSITION IS BUILT FROM `attribute` — ⛔ EXACTLY THE LABEL ③ RULED CANNOT
     CARRY QUESTION IDENTITY ⇒ **THE PROPOSITION INHERITS THAT DEFECT.** ⚠️ 42 rows have a proposition and
     NO value ⇒ invisible to the conflict rule. ⚠️ Mira's `content` is STILL TENSELESS ⇒ "true but not
     current" remains unstatable. ⭐ Counterexample in BOTH directions: Bangkok (same value, 2 propositions)
     and the 18 lessons (18 propositions, same empty value).
   ⑥ ⭐ **FIVE EVENT KINDS EVIDENCED; TWO HAVE NEVER FIRED.** re-statement 4 · world change 1 · operator
     repair 1 · **MIS-ROUTING 2** · partial-coordinated 1 · ⛔ COLLAPSE **0** (zero `collapse` audit rows
     EVER) · ⛔ LESSON REVISE **0**. ⇒ ⚠️ THE TWO THAT NEVER FIRED ARE THE ONE WITH THE STRONGEST CLAIM
     (collapse asserts equivalence) AND THE ONLY ACTOR-DECLARED ONE (lesson revise).
   ⑦ ⭐⭐⭐ **SLOT PARTICIPATION IS ALL-OR-NOTHING PER FAMILY AND TRACKS THE WRITER'S CODE PATH, ⛔ NOT THE
     NATURE OF THE MEMORY.** 5 families route (ALL completely), 8 do not. `lesson-host` and `ingest` never
     call `reconcileFact`. ⚠️ CUTS BOTH WAYS: a `project-decision` arguably HAS a current answer and is
     excluded; a `lesson` arguably does NOT need one and is excluded BY THE SAME ACCIDENT.
     ⛔ **NEITHER EXCLUSION WAS A SEMANTIC DECISION.**
   ⭐⭐⭐ THE DEPENDENCY EDGES, **TESTED ⛔ NOT ASSUMED** — 2 of 5 FAIL AND 1 IS **INVERTED**:
     observation→proposition ✅ · proposition→question ⛔ (runs through `attribute`) ·
     **question→membership ⛔ REVERSED — membership is chosen FIRST, the question is reached THROUGH the
     slot** · membership→transition ⚠️ holds TOO STRONGLY · transition→row-state ⚠️ holds but LOSSILY.
   ⇒ ⭐ **THE PIPELINE IS NOT A PIPELINE.**
㊹ ⭐⭐⭐ BATCH · THE THREE SEAMS (2026-09-17) → `INVESTIGATION_SOTERA_BATCH_SEAMS.md` ·
   `test/checks/semantic-seam-batch.mjs`. ⛔ EVIDENCE ONLY — no rulings requested or made.
   ⭐⭐⭐ **`attribute` IS ONE FIELD WITH EIGHT PRODUCTION ROLES**: the PROPOSITION shown on recall ·
   the VECTOR INDEX input · the ROUTING similarity key · the MEMBERSHIP claim key · the EPHEMERAL ARENA
   identity · the SLOT IDENTITY seed · the REVIVAL ARENA key · the DREAMING RECURRENCE key. AND it is a
   `SEMANTIC_FIELD`. ⇒ ⚠️ CHANGING IT CHANGES WHAT SHE RECALLS, HOW IT RANKS, WHAT COMPETES, WHAT REVIVES
   AND WHAT DREAMING COUNTS AS RECURRENCE — ⛔ ALL AT ONCE. ⚠️ AND ③ RULED IT CANNOT CARRY QUESTION
   IDENTITY, ⛔ YET IT IS THE SLOT'S IDENTITY SEED.
   ⭐⭐⭐ **`claimKind` EXISTS AT t0, BEFORE SLOT SELECTION AT t1 — AND IS NOT PASSED TO THE RESOLVER.**
   `resolve({owner, attribute, attributeCandidate?, attributeShape?}, {slots, rowsBySlot})` ⇒ ⭐⭐ **THE
   BLOCKER IS AN INTERFACE BOUNDARY, ⛔ NOT MISSING INFORMATION** — it is a live local 3 lines above.
   ⚠️⚠️ AND ③'s NUANCE IS **NOT CURRENTLY HELD**: on a GOVERNED slot, `claimKind` ABSENT and `claimKind`
   WRONG both give checkKind=DEFER and gate=**REFUSE**. ⇒ ⛔ "NOT DECLARED" AND "SAID SOMETHING ELSE" ARE
   DISTINGUISHABLE **ONLY IN THE `why` STRING**, ⛔ NOT IN THE BEHAVIOUR. (slot UNDECLARED → NOT-IN-SCOPE,
   which IS a distinct scope.)
   ⭐⭐ THE EIGHT "SAMES" — **5 of 8 EXIST**: value · entity · attribute · question · slot.
   ⛔ **CONTENT, PROPOSITION AND OBSERVATION DO NOT.** ⇒ ⭐⭐⭐ `norm(value)` IS SUBSTITUTED FOR PROPOSITION
   EQUIVALENCE, and the corpus falsifies it IN BOTH DIRECTIONS: Bangkok (⛔ not sufficient) · the 18 lessons
   (⛔ not necessary) · work-schedule ×2 (⛔ not about the question) · Mira (⚠️ not about truth).
   ⭐ `content` IS NEVER COMPARED — the proposition plays no part in ANY equivalence.
   ⭐⭐⭐ THE MATRIX'S SHARPEST COLUMN — **CAN IT BE WRONG WITHOUT DETECTION?** observation ⚠️YES ·
   proposition ⛔YES · **question ⭐NO (it is LEDGERED)** · membership ⛔YES · competition ⛔YES ·
   transition ⛔YES · row state ⛔YES. ⇒ ⭐ **EXACTLY ONE CONCEPT CAN BE WRONG DETECTABLY, AND IT IS THE
   EMPTY ONE.**
   ⭐⭐⭐ PRODUCTION EXECUTION ORDER IS **membership → slot → proposition → question** — the conceptual
   order REVERSED AT TWO EDGES, and the one input that could invert it (`claimKind`) ARRIVES FIRST AND IS
   THROWN AWAY.
   ⚠️ INSTRUMENT NOTE #23: the check caught MY OWN ARITHMETIC — I wrote "six of eight" and asserted
   `missing.length === 2`; three do not exist. ⭐ A declared count that the assertion can falsify.
㊺ ✅⭐⭐⭐ **FOUR RULINGS RECORDED (Ote, 2026-09-17)** → `ADR_SOTERA_MEMORY_SEMANTIC_DECISIONS.md`.
   ⑤ ✅ **RULED** — *"A proposition is a distinct semantic object represented today by the constructed
     `content` sentence, BUT PROPOSITION IDENTITY/EQUIVALENCE DOES NOT EXIST AS A SEMANTIC OPERATION."*
     ✅ proposition EXISTS as a representation · ⛔ proposition EQUIVALENCE does not exist ·
     ⚠️ `norm(value)` is ONLY the current competition proxy ·
     ⛔⛔ **SAME VALUE MUST NOT BE TREATED AS SAME PROPOSITION** ·
     ⛔⛔ **DIFFERENT VALUE MUST NOT BE TREATED AS DIFFERENT PROPOSITION**
     ⭐ THE 4 COUNTEREXAMPLES PRESERVED. ⛔ Proposition representation NOT redesigned.
   ⑦ ✅ **RULED** — *"DURABLE MEMORY IS NOT INHERENTLY SLOT-SHAPED. Slot participation currently follows
     WRITER/CODE PATH, ⛔ not an established semantic property of memory."*
     ⛔ slotless ≠ deficient · ⛔ not a universal invariant · ⭐ question/slot/competition apply ONLY where
     their requirements are ESTABLISHED · ⛔ the lesson + project-decision exclusions are NOT semantic
     decisions. ⛔ ROUTING NOT CHANGED.
   ④ ✅ **NEGATIVE RULING ONLY** — *"`invalid_at` IS NOT A PROPOSITION-TRUTH STATE."* ⛔ NO positive
     replacement definition; ⏸ THE POSITIVE DEFINITION STAYS OPEN. ⭐ Mira remains the anchor for *"true
     but no longer current."* ⭐ AND: reversibility is STRUCTURAL through `supersedes_id`, ⛔ not determined
     by event semantics.
   ⑥ ✅ **PARTIAL** — *"TRANSITION IS A SEMANTIC/EVENT LAYER DISTINCT FROM ROW STATE."* Different events
     produce the SAME row-state field; RECOVERABILITY is a SEPARATE STRUCTURAL PROPERTY set by pointers.
     ⛔ TAXONOMY NOT FINALISED — the five evidenced events remain EVIDENCE; collapse + lesson-revise have
     NOT fired organically.
㊻ ⭐⭐⭐ **WHAT THE RULINGS EXPOSE** (⛔ observations, ⛔ not rulings) — ADR §"What the rulings expose":
   E1 ⭐⭐⭐ **BOTH BRANCHES OF `resolveConflict` REST ON INFERENCES ⑤ FORBIDS** — noop assumes *same value
      ⇒ same proposition*; update assumes *different value ⇒ different proposition*. ⛔ NOT ONE BRANCH — BOTH.
   E2 ⭐⭐ **COLLAPSE NOW HAS NO AVAILABLE JUSTIFICATION AT ALL** — ② says membership establishes nothing,
      ⑤ says proposition equivalence does not exist, and collapse REQUIRES pairwise equivalence.
      ⚠️ LATENT — collapse has never fired organically.
   E3 ⭐⭐ **THE EPHEMERAL ARENA CONTRADICTS ⑦** — `buildSlotView` synthesises an arena for EVERY slotless
      live row (53 of 118) and P15 does the same with no slot ⇒ competition semantics applied where ⑦ says
      they do not apply, ⛔ BY CONSTRUCTION, with ⛔ NO ABSTENTION for an existing row.
   E4 ⚠️ ③'s NUANCE STILL NOT HELD — absent vs wrong `claimKind` both REFUSE.
   E5 ⚠️ **`attribute` IS LOAD-BEARING FOR ⑤ AND FORBIDDEN BY ③** — the proposition is built from it; it
      may not carry question identity. ⛔ UNRESOLVED.
   E6 ⚠️ THE `invalid_at` DOCSTRING IS NOW KNOWN-WRONG BY RULING (*"expired IN THE WORLD"*). ⛔ FLAGGED,
      ⛔ NOT CHANGED.
   ⏸ NEXT DECISIONS EXPOSED, ⛔ NAMED ONLY: **⑧** what may `resolveConflict` do (blocked on ①) ·
   **⑨** may an arena be SYNTHESISED for a family with no established slot semantics (⑦+② don't answer it).
   ⇒ ⭐⭐⭐ **THE CRITICAL PATH IS NOW ① → ⑧.**

㊼ ⭐⭐⭐ **DECISION ①, ANSWERED (2026-09-17) — ⛔ DELIVERED, NOT RULED.**
   `DECISION_SOTERA_01_INCUMBENT_RELATIONSHIP.md`. Ote's reframe + his method rule for the whole pass:
   ⭐⭐ **TWO DIMENSIONS, HELD APART — and the second is ⛔ NOT EVIDENCE FOR THE FIRST:**
      RELATIONSHIP  incoming observation → incumbent observation
      CONSEQUENCE   incumbent → new role / row state
   ⚠️ THIS IS EXPENSIVE AND THAT IS THE POINT: **most of what the arc measured is CONSEQUENCE-side**
   (`invalid_at` · `supersedes_id` · reversibility · `slot_id` · row state · the audit verbs). ⛔ Under the
   rule NONE of them may testify about what held BETWEEN the two.
   ⭐ `supersedes_id` keeps exactly ONE relationship-side function: it records **WHICH PAIR**. ⛔ PAIRING IS
   NOT A RELATION — it is a precondition of one.
   ⭐⭐⭐ **THE ANSWER: INHERENTLY MULTIPLE — because THE RELATA DIFFER**, ⛔ NOT because the cases varied
   (variety alone is consistent with one relation carrying attributes):
      #1 #2 #5  observation × observation          (same proposition, differently informative)
      #7 Mira   world-at-t₁ × world-at-t₂          (the records are only witnesses)
      #6 repair incumbent × ITS OWN SOURCE TURN    ⭐ the incoming is barely a relatum
      #4 family sub-proposition × sub-proposition  ⛔ a level that does not exist
      #3        ⚠️ UNDETERMINED · #8 #9 ⛔ NO PAIR AT ALL
   ⛔ **A relation's attributes cannot vary its own domain.** ⇒ interpretation 1 is EXCLUDED **as a
   RELATIONSHIP model** (⚠️ it may still fit the CONSEQUENCE dimension — that is ④'s, and OPEN).
   ⛔ AND IT DOES NOT SELECT AMONG 2, 3, 4 — all three are compatible with multiplicity; they differ only in
   WHERE the multiplicity is placed (② in the events · ③ pushed out into separate propositional acts ·
   ④ entirely into the observations, with no transition at all).
   ⭐⭐ **THREE OUTCOMES MUST STAY DISTINGUISHABLE — ⛔ today all three produce ONE row state:**
      ✅ a relation holds · ⛔ NO relation exists (#8 #9) · ⚠️ the record CANNOT ESTABLISH one (#3)
   ⛔ Collapsing "no relation" into "cannot establish a relation" repeats, ONE LAYER DOWN, exactly the loss
   ③ ruled against ("not declared" ≠ "incorrectly inferred").
   ⭐⭐⭐ **WHAT IS COMMON IS ⛔ NOT A RELATIONSHIP — IT IS AN OCCASION:** *a pair of durable observations was
   brought into contact by the system, and the system was required to act BEFORE the relationship between
   them had been established.* ⭐ True of all nine INCLUDING the two where no relationship existed — which is
   precisely why it is the common thing and the relation is not.
   ⚠️ CONSEQUENCE-SIDE, RECORDED SEPARATELY SO IT IS NOT READ INTO THE ANSWER: in **8 of 9** something true
   at the seam was not preserved, and ⭐ **what was not preserved differs every time**. The exception is #6 —
   ⭐ the one the competition machinery did not perform.
   ⛔ NO NAMES · NO VOCABULARY · NO SCHEMA · NO TAXONOMY · NO COUNT OF KINDS (⑥ left that open).
   ⛔ The two never-fired mechanisms were used ONLY as latent machinery constraining interpretation, ⛔ never
   as production evidence — and both point the same way: ⭐ *"removed for being REDUNDANT, not for being
   WRONG"* is the design ALREADY refusing to treat two relations as one.

㊽ ⭐⭐⭐ **DECISION ⑧ — ✅ RULED NARROW (Ote, 2026-09-17):** *"A named writer establishes ATTRIBUTION,
   ⛔ NOT AUTHORIZATION. Writer identity alone does not establish authority to make an incumbent cease being
   current."* ⇒ ⛔ **NEITHER WRITER IDENTITY NOR ROUTING SIMILARITY IS SUFFICIENT AUTHORITY.**
   ⭐⭐⭐ THREE THINGS KEPT SEPARATE, BY RULING — ⛔ never collapse them:
      ATTRIBUTION              who PERFORMED the act
      EPISTEMIC RESPONSIBILITY who is responsible for ESTABLISHING the relevant semantic fact
      AUTHORITY                who is ENTITLED to cause the semantic transition
   ⭐ THE IDENTITY RESOLVER PRECEDENT IS **ADMISSIBLE** — as evidence of an existing designed
      REFUSAL/AUTHORITY distinction, ⛔ NOT as evidence about relationship semantics. ⇒ the §9 judgement
      call is resolved in the investigation's favour, NARROWLY.
   ⛔ NOT YET DEFINED: the positive authority model · vocabulary · schema · transition behaviour.
   ⭐ THE INVESTIGATION BEHIND IT:
   **DECISION ⑧ — AUTHORITY UNDER UNRESOLVED SEMANTICS (opened by Ote 2026-09-17, once ① was ruled).**
   `INVESTIGATION_SOTERA_08_TRANSITION_AUTHORITY.md` · `test/checks/current-holder-authority-census.mjs`
   (21 checks green, ⭐ incl. a POSITIVE CONTROL for the never-emitted scan). ⛔ INVESTIGATION ONLY — ⛔ no
   ruling proposed, ⛔ and NOT YET *"what should `resolveConflict` do?"*
   ⭐ THE QUESTION: *"what semantic authority must a component possess before it may cause an incumbent to
   cease being the current holder, when the relationship is (a) ESTABLISHED, (b) ABSENT, or (c) NOT
   ESTABLISHABLE from available evidence?"* ⇒ **what must be established, AND BY WHOM.**
   ⛔⛔ OTE'S EVIDENCE FENCE — ⛔ NOT admissible AS EVIDENCE OF SEMANTIC AUTHORITY:
      `invalid_at` · `supersedes_id` · `slot_id` · row state · reversibility · recency · resolver behaviour
   ⭐ THE FIVE CONDITIONS, HELD APART: K1 they ARE related · K2 WHAT the relation is · K3 NO relation
      exists · K4 UNABLE to establish it · K5 AUTHORITY to act despite any of them.
   ⭐⭐⭐ **THE SYSTEM ALREADY HAS AN AUTHORITY DOCTRINE** — *"authorship is a DECISION the caller is
      entitled to make; **authority is a FACT the caller is not**"* · *"⛔ An authority that can be
      satisfied by an absence is not an authority"* · DERIVED, NEVER CLAIMED, FAILING CLOSED.
      ⛔ AND IT HAS NEVER BEEN APPLIED TO THIS ACT.
   ⭐⭐ **THE TRANSITION IS THE LEAST-GOVERNED SEMANTIC ACT IN THE SYSTEM** — a declared writer, nothing
      else. 047 bind: declared actor + intent + propose/confirm. A3 alias: `declared` + REFUSES (4 of 4).
      030 contradiction: ⭐ NAMED EVIDENCE (*"a contradiction that cannot name its opponent is a feeling"*).
      ⇒ ⭐ the system demands EVIDENCE before recording *"somebody said this is wrong"*, and demands
        NOTHING BUT A NAME before making an incumbent stop being current.
   ⭐⭐⭐ **THE ONLY RECORDED WARRANT IS A ROUTING SIMILARITY SCORE** — 412 of 412 audit rows, **0** whose
      reason is not a measurement, `actor=system` on 409. ⚠️ AND ③ ALREADY DISQUALIFIED ROUTING as a way to
      establish observation→question. ⇒ the only warrant on record is one the rulings have already voided.
   ⭐⭐⭐ **AND IT IS BLIND, ⛔ NOT WEAK:** #8 and #9 — ⛔ WHERE NO RELATIONSHIP EXISTS — carry `lexical`
      **1.000**, ⭐ IDENTICAL TO MIRA. ⇒ ⚠️ A CONFIDENCE BAR CANNOT SEPARATE THEM, at any threshold.
   ⭐⭐ **K1–K4 ARE UNRECORDABLE AT THIS SEAM** — `log_memory_changes` has no `relation`/`declared` column
      and no refusal outcome. ⛔ `log_slot_aliases` HAS BOTH and refuses on them — one seam over.
   ⭐⭐⭐ **AN ANSWER ALREADY EXISTS IN SHIPPED CODE, FOR ONE FAMILY** — the Identity Resolver:
      *"the ONE CASE IT MUST NOT DECIDE ALONE"* · *"DEFER, never to assume"* · *"ASKING IS NOT ADOPTING —
      a broken ask must land where 'no answer' lands, never where 'yes' does"* · *"they are the only
      authority on their own name"*. ⭐ `declined` and `deferred` ARE ALREADY DISTINCT ⇒ the K3/K4
      separation, built before the question was asked. ⭐ ABSTENTION IS THE DEFAULT; it FAILS CLOSED; it
      will HOLD A COMMIT FIVE MINUTES for a human.
   ⭐ `CONFLICT.DEFER` and `CONFLICT.ASK` were DECLARED IN PHASE 4 AND HAVE NEVER FIRED — ⭐ measured
      against a POSITIVE CONTROL (`CONFLICT.IGNORE` IS emitted, by Dreaming). ⚠️ LATENT, ⛔ not evidence.
   ⭐⭐⭐ **K1–K4 WERE ESTABLISHED IN ZERO OF THE NINE.** The entire precondition satisfied was: A WRITER WAS
      NAMED. ⭐ #6 ALONE carried a named human (`writer=operator`) and met the system's ONE justification
      requirement — and ⛔ is the only one the machinery did not perform.
   ⭐⭐ **NAMING THE WRITER MAKES AN ACT ATTRIBUTABLE, ⛔ NOT AUTHORIZED.** Two requirements; only the
      first is enforced here. ⇒ ⭐ AND ② GAVE THE CONSUMER THE **EPISTEMIC** BURDEN — ⛔ NOT AUTHORITY.
      Who must KNOW and who may ACT are two questions, and ⑧ is the second.
   ⛔ NOT ESTABLISHED: what the authority SHOULD be · that a human must be involved (#6 and the Identity
      Resolver are EXISTENCE PROOFS that a non-component authority is possible, ⛔ not that it is required) ·
      that any writer is wrong · ⚠️ the FALSE-NEGATIVE direction, still.
   ⚠️ THE ONE JUDGEMENT CALL, NAMED SO OTE CAN STRIKE IT: the Identity Resolver IS a resolver, and Ote
      fenced resolver behaviour. It is cited as an explicit DESIGNED REFUSAL to act on its own authority —
      ⛔ the opposite of inferring authority from behaviour. ⭐ If Ote reads it as inside the fence, that
      section falls and the rest stands. ✅ OTE RULED IT **ADMISSIBLE**, narrowly — see the ruling above.

㊾ ⭐⭐⭐ **DECISION ⑧-A — POSITIVE AUTHORITY (opened by Ote 2026-09-17, on ruling ⑧).**
   `INVESTIGATION_SOTERA_08A_POSITIVE_AUTHORITY.md` · `test/checks/positive-authority-trace.mjs` (16 green).
   ⛔ INVESTIGATION ONLY — ⛔ NO AUTHORITY MODEL PROPOSED, ⛔ no vocabulary invented (every term is QUOTED
   from existing source), ⛔ no schema, ⛔ no transition behaviour.
   ⭐ THE QUESTION: *"What makes a current-holder transition AUTHORIZED rather than merely ATTRIBUTABLE?"*
   ⭐⭐⭐ **THE AUTHORITY GRAMMAR THE SYSTEM ALREADY WROTE DOWN** — ⛔ none of this is new:
      *"authority is a FACT the caller is not"* · *"an authority that can be satisfied by an absence is not
      an authority"* · *"No axis is ever derived from another"* · *"an equivalence nobody can be asked
      about"* · ⭐ *"the difference between someone editing THEIR OWN beliefs and someone editing SOMEBODY
      ELSE'S"* (`person` ≠ `admin`).
   ⭐⭐⭐ **AUTHORITY IS GRADED BY CHECKABILITY, ⛔ NOT BY RANK — AND IT IS ALREADY IMPLEMENTED:**
      *"a SPAN is a checkable claim and **is checked FIRST** — attestation vouches for a turn, ⛔ NEVER for
      words that are not in it."* ⇒ ⭐⭐ **A HUMAN'S ATTESTATION DOES NOT OVERRIDE A CHECKABLE FACT.**
      LADDER: `span-verified` 4 · `declared-coincidence` 42 · `operator-attested` 3 · `writer-cited` 34 ·
      `failed` 0 (⭐ a failed reference is KEPT WITH ITS REASON — I10). ⚠️ THE CHECKABLE RUNG IS THE RAREST.
   ⭐⭐⭐ **DELEGATION WITHOUT INFERENCE — EXACTLY ONE WORKED PRECEDENT**, the declared coincidence:
      NARROW (2 of 17 writers) · REGISTRY-HELD · ⭐ TRUE BY THE HOLDER'S **MECHANISM** (*"the extractor
      cannot read anything but the turn it was handed… ⛔ No other writer may claim that"*) · ⭐ MEASURED
      BEFORE GRANTING (*"4 of 37 rows"*) · REFUSED TO EVERYONE ELSE, who must `verify` instead.
      ⭐ ATTESTATION IS GRANTED TO **EXACTLY ONE** WRITER, BY REGISTRY. ⛔ IT IS NOT A RANK.
   ⭐⭐⭐ **HUMAN AUTHORITY IS NOT AUTOMATICALLY SUFFICIENT — ESTABLISHED TWICE, INDEPENDENTLY.** The ratified
      BIND derivation: *"THE REAL DISCRIMINATOR IS JUDGEMENT vs TESTIMONY, ⛔ NOT WHO"* · *"STANDING IS NOT
      THE BINDING CONSTRAINT — EVIDENCE IS"* · *"inference-shaped… forbidden REGARDLESS OF WHO PERFORMS
      IT"*. ⇒ ⭐ **A HUMAN PERFORMING AN INFERENCE-SHAPED ACT IS STILL INFERENCE. AUTHORITY DOES NOT
      LAUNDER AN INFERENCE.**
   ⭐⭐ **AUTHORITY TRACKS THE ORIGIN OF THE MATERIAL, ⛔ NOT THE SENIORITY OF THE ACTOR** — *"for a
      label-minted slot THE ACCOUNT'S IS THE NON-INFERENTIAL ONE: the label came from THEIR words."*
   ⭐⭐ **4 OF 13 CANDIDATES CARRY AN EXERCISED AUTHORITY TODAY** — provenance/evidence · role/question
      (propose/confirm) · operator repair (`attests: true`) · alias learning (⭐ REFUSABLE, 4 of 4 refused).
      ⛔ **NOT ONE IS WIRED TO THE CURRENT-HOLDER TRANSITION.**
   ⭐⭐ **EVERY ESTABLISHED-AUTHORITY SEAM HAS A LEDGER THAT CAN RECORD A REFUSAL. THE TRANSITION HAS NONE.**
   ⭐⭐⭐ **IN 2 OF 6 ANCHOR GROUPS NO AUTHORITY APPLIES** — #8/#9 (⛔ nothing to be authorized ABOUT ⇒ the
      correct act is ABSTENTION) and #3 (⇒ DEFER). ⚠️ ⇒ **A MODEL THAT CAN ONLY GRANT CANNOT EXPRESS THEM.**
   ⛔ CLOSED BY EXISTING RULING, ⛔ not reopened: DECLARED QUESTION OWNERSHIP (a slot HAS NO OWNER;
      `txn_memories.author` IS the ownership mechanism) · WRITER IDENTITY (⑧).
   ⛔ NOT ESTABLISHED: that checkability is SUFFICIENT here — ⚠️ it is the strongest thing the system
      grades, but ⑧ established there is **NO CHECKABLE RELATIONAL FACT** for it to grade.
   ✅⭐⭐ **⑧-A RULED NARROW (Ote, 2026-09-17):** *"Authority is distinct from attribution and epistemic
      responsibility."* ⭐ *"Existing authority mechanisms establish authority through **BOUNDED, CHECKABLE,
      ANSWERABLE FACTS** and **PRESERVE REFUSAL** where authority is not established. Delegation is
      legitimate ONLY where the relevant fact is **true by the holder's MECHANISM**, the grant is **NARROW
      and REGISTRY-HELD**, and the delegation is **REFUSED OUTSIDE ITS ESTABLISHED BOUNDARY**."*
   ⚠️⚠️ **NARROWED BY OTE — ⛔ DO NOT GENERALIZE:** *"authority tracks origin of material"* is a finding of
      the **examined BIND and evidence mechanisms**, ⛔ **NOT yet a universal authority law.** The ⑧-A doc
      states it more strongly than the ruling permits ⇒ ⛔ CITE THE RULING, not the document.

㊿ ⭐⭐⭐ **ABSTENTION ≠ DEFER — LOCKED BY RULING (Ote, 2026-09-17). ⛔ THESE MUST NEVER COLLAPSE.**
      ABSTENTION  the NULL cases (#8 #9) — ⛔ THERE IS NOTHING TO AUTHORIZE. The correct semantic
                  outcome is TO NOT ACT AT ALL.
      DEFER       the UNDETERMINED case (#3) — the record does not establish WHAT SHOULD BE ACTED UPON.
                  ⭐ `DEFER` is THE EXISTING SYSTEM'S OWN TERM for that condition (Phase 4 vocabulary).
   ⇒ ⭐ this is ①'s *"no relation exists"* vs *"the record cannot establish one"*, carried down to the
     ACT layer. ⛔ A model that can only GRANT can express neither.

51 ⭐⭐⭐ **DECISION ④-A — THE SEMANTIC CONTENT OF A TRANSITION (opened by Ote 2026-09-17).**
   `INVESTIGATION_SOTERA_04A_TRANSITION_CLAIM.md`. ⛔ **READ-ONLY AND NO CODE** — Ote scoped it as analysis
   on the established evidence base. ⛔ No instrument, no new evidence, no vocabulary, no schema.
   ⭐ THE QUESTION: *"When an incumbent ceases to be the current holder, what semantic claim — IF ANY —
   has actually been ESTABLISHED by that act?"* — across SIX targets.
   ⛔⛔ FENCE: `invalid_at` · `supersedes_id` · row state · slot membership · reversibility · resolver
      behaviour are ⛔ NOT admissible as evidence of SEMANTIC MEANING.
   ⭐ THE TEST — **INVARIANCE**: *an act that does not vary with X cannot be establishing X.*
   ⭐ THREE MODES (⛔ ordinary logical terms, ⛔ NOT proposed vocabulary): ESTABLISHES · PRESUPPOSES · IMPLIES.
      T1 INCOMING    ⛔ NOTHING — not true (unchecked) · not better (#2 is STRICTLY LESS INFORMATIVE,
                     #5 less complete) · not the answer (#8/#9). ⭐ All it carries came from THE WRITE.
      T2 INCUMBENT   ⛔ NOTHING. ⭐⭐ #6 PROVES THE RULE RATHER THAN BREAKING IT: the one claim ever made
                     about an incumbent came from a DIFFERENT ACT, a DIFFERENT ACTOR, with NAMED EVIDENCE.
      T3 WORLD       ⛔ NOTHING — ⭐ THE STRONGEST NEGATIVE, by invariance: the act in #7 (the world
                     changed) and in #1 (a rewording) is THE SAME ACT. And it fired in #8/#9, where
                     NOTHING changed at all.
      T4 QUESTION    ⛔ NOTHING ESTABLISHED; ⚠️ ONE THING **PRESUPPOSED** and never checked — ③ ruled that
                     relation may only be DECLARED. ⚠️ #8/#9 show it FALSE; #4 shows it false a second way.
                     ⭐ A PRESUPPOSITION IS NOT A CLAIM.
      T5 CURRENCY    ⭐ **THE ONE NON-EMPTY TARGET** — and CONSEQUENCE-side, established BY FIAT:
                     ⭐⭐⭐ *"the system has adopted a new DISPOSITION about which of these it will present."*
                     ⭐ ITS SUBJECT IS **THE SYSTEM** — ⛔ not either observation, the world, or the relation.
                     ⚠️ And ⑧ established it is adopted WITHOUT A WARRANT.
      T6 RELATION    ⛔ NOTHING ESTABLISHED; ⚠️ SOMETHING **IMPLIED** — ⭐ the residue IS READ AS a
                     relationship and cannot hold ①'s *none exists* vs *cannot be established* distinction.
                     ⛔ An INTERPRETATION RISK, ⛔ not a claim of the act.
   ⭐⭐⭐ **THE SHAPE OF THE RESULT: five OBJECT-side targets ALL EMPTY; the one CONSEQUENCE-side target is
      the only non-empty one.** ⇒ ⭐⭐ THE ACT IS ENTIRELY CONSEQUENCE-SIDE — Ote's separation of
      RELATIONSHIP from CONSEQUENCE is ⛔ not merely a method, ⭐ IT IS THE SHAPE OF THE THING.
   ⭐⭐ AND THE COROLLARY HIS FENCE MADE VISIBLE: every excluded artifact is a record of the DISPOSITION ⇒
      ⛔ they were never evidence of meaning, because THE DISPOSITION IS THE ONLY THING THE ACT EVER HAD
      TO RECORD. ⭐ The fence isolated the entire semantic content on the first pass.
   ⛔ NOT ESTABLISHED: that the act is MEANINGLESS or should not exist — ⭐ a disposition about what to
      present is a real thing for a memory system to have; the finding is about WHAT IT ESTABLISHES ·
      ⛔ ④'s positive definition (⚠️ constrained — a single positive meaning would have to be
      CONSEQUENCE-ONLY by construction — ⛔ but not settled) · ⛔ what the act SHOULD establish.
   ✅⭐⭐ **④-A RULED NARROW (Ote, 2026-09-17):** *"A current-holder transition establishes a claim about
      THE SYSTEM'S OWN DISPOSITION: the system has adopted a new disposition regarding which observation
      it will present as current. The transition itself establishes NOTHING about the incoming observation,
      incumbent observation, world, question/role, or relationship."* ⚠️ *"It MAY PRESUPPOSE that the
      observations answer the same question, and its resulting state MAY BE READ AS IMPLYING that a
      relationship was found, ⛔ but NEITHER IS ESTABLISHED by the transition."*
   ⛔ `establishes`/`presupposes`/`implies` are ANALYTICAL TERMS ONLY, ⛔ NOT proposed vocabulary.
   ⚠️⚠️ **PHRASING CORRECTED BY RULING:** say ⭐ **"the ESTABLISHED SEMANTIC CONTENT is consequence-side"**
      — ⛔ **NEVER** *"the act is entirely consequence-side"*, which would ERASE the presupposition and the
      interpretation residue the investigation itself identified.

52 ⭐⭐⭐ **DECISION ④ — REFRAMED BY OTE AND INVESTIGATED (2026-09-17). ⛔ DO NOT START FROM THE FIELD.**
   `INVESTIGATION_SOTERA_04_DISPLACED_STATUS.md` · `test/checks/displaced-status-trace.mjs` (13 green).
   ⭐ THE REFRAME: *"When a system disposition causes an observation to cease being the current holder,
   what semantic STATUS, if any, does that DISPLACED OBSERVATION acquire?"*
   ⛔⛔ FENCE: ⛔ do NOT infer meaning from the fact that they all write the same field · ⛔ the COLUMN NAME,
      ROW STATE, **REVERSIBILITY** and EXISTING CONSUMERS are ⛔ not admissible as evidence of meaning.
      ⚠️ REVERSIBILITY WAS THE DECISIVE EVIDENCE OF THE EARLIER ④ PASS ⇒ this one is REBUILT WITHOUT IT.
   ⭐ ④-A SETS THE BASELINE ⇒ the question is only WHAT EACH WRITER **ADDS** beyond the disposition.
      W1 SUPERSEDE      ⛔ NOTHING — its call site says nothing about the displaced observation; ⑧ showed
                        its only warrant is a LABEL score. ⭐ Mira is a W1 case, still TRUE OF THE PAST.
                        ⚠️ AND IT DOES NOT ESTABLISH *historical* EITHER — #1/#2/#5 are SIMULTANEOUS.
      W2 COLLAPSE       ⛔ NOTHING — ⭐ and it DISCLAIMS a truth claim: *"removed for being REDUNDANT, not
                        for being WRONG."* ⚠️ LATENT, 0 rows ⇒ DECLARED INTENT, ⛔ not corpus semantics.
      W3 IDENTITY       ⭐ *"the answer to WHAT DID SHE USED TO CALL ME?"* ⇒ THE NAME IS NO LONGER IN USE.
                        ⭐ Warrant: THE PERSON'S OWN DECLARATION. ⇒ ⭐ RENAMED ≠ FALSE.
      W4 CONSOLIDATION  ⭐ ITS CONTENT WAS USED to compose a successor (*"consolidation, NOT
                        reinterpretation"*). ⭐ The source calls the members ***STILL-TRUE*** ⇒ ABSORBED ≠
                        FALSE. ⛔ AND IT DOES **NOT** ESTABLISH THAT NOTHING WAS LOST.
      W5 LESSON REVISE  ⭐ WHATEVER THE ACTOR DECLARED — `supersedes · refines · coexists_with · qualifies`;
                        ⭐ THREE OF THE FOUR ARE NOT TRUTH CLAIMS AT ALL. ⚠️ LATENT, 0 rows.
      W6 RESTORE-BLOCK  ⛔ NOTHING about the observation — *"un-archived, NOT BELIEVED"*, caused by
                        OCCUPANCY. ⭐ The source REFUSES to collapse the two outcomes.
   ⭐⭐⭐ **ZERO OF SIX ESTABLISH A CLAIM ABOUT PROPOSITION TRUTH** — ⭐ measured against a POSITIVE CONTROL
      (`markContradicted` DOES make one and refuses without named evidence) ⇒ an absence that is a FINDING.
      ⭐⭐ AND THE NEGATIVE RULING IS INDEPENDENTLY REPRODUCED — ⛔ without reversibility or the dimension
      signatures ⇒ ⭐ IT IS NOT AN ARTIFACT OF THE EARLIER METHOD.
   ⭐⭐ THE THREE POSITIVE STATUSES HAVE **DIFFERENT SUBJECTS** — a NAME's use · a RECORD's content · a
      DECLARED relation ⇒ ⛔ NOT one meaning wearing three hats.
   ⭐⭐⭐ **THE CONVERGENCE WITH ⑧-A — THE FINDING, ⛔ NOT A COINCIDENCE:** the three writers that ESTABLISH
      something are EXACTLY the three with a warrant ⑧-A would accept — W3·W5 A DECLARATION BY AN
      AUTHORITY · W4 TRUE BY THE ACT'S OWN MECHANISM. W1·W2·W6 have none. ⇒ ⭐ **A WRITER WITH NO WARRANT
      ESTABLISHES NOTHING; A WRITER WITH ONE ESTABLISHES EXACTLY WHAT ITS WARRANT COVERS.**
      ⚠️ AND W1 PERFORMED 8 OF THE 9 ANCHORS.
   ⭐ THE SEVEN DISTINCTIONS ARE ALL REAL. ⚠️ THE SURPRISE: **CURRENT vs HISTORICAL** — displacement
      establishes ⛔ NEITHER side. A displaced observation is ⛔ NOT thereby "the past".
   ⛔ NOT ESTABLISHED: any positive definition of the FIELD (⭐ the reframe asked about the OBSERVATION'S
      STATUS, and that is what is answered) · that W1/W2/W6 are WRONG · that W2/W5's statements are CORPUS
      FACTS (⚠️ both latent) · ⛔ that W4's absorption is LOSSLESS.
   ✅⭐⭐ **④ RULED (Ote, 2026-09-17):** *"The three positive statuses in W3/W4/W5 are evidence about those
      INDIVIDUAL WRITERS, ⛔ not a proposed taxonomy. ⛔ Do not turn them into a new universal status
      vocabulary."*

53 ⭐⭐⭐⭐ **THE CROSS-DECISION CONVERGENCE — ✅ LOCKED BY RULING (Ote, 2026-09-17). ⛔ CITE THIS.**
   > **An act with no established warrant establishes NOTHING beyond whatever its own already-established
   > disposition constitutes; an act WITH a warrant establishes ONLY what that warrant covers.**
   ⛔ **THIS MUST REMAIN A SEMANTIC CONSTRAINT, ⛔ NOT AN IMPLEMENTATION SHORTCUT.**

54 ⭐⭐⭐ **A-D4 — COMPETITION ADMISSION (opened by Ote 2026-09-17). ⛔ READ-ONLY, ⛔ NO CODE.**
   `INVESTIGATION_SOTERA_AD4_COMPETITION_ADMISSION.md`. ⛔ `resolveConflict`'s WINNER SELECTION is
   deliberately NOT investigated — this is the boundary BEFORE it.
   ⭐ THE QUESTION: *"What semantic fact, IF ANY, must be established before two durable observations may
   legitimately COMPETE for the same current-holder disposition?"*
   ⭐ THE PATH, against Ote's seven categories:
      S1 `entity`      ⭐ **IDENTITY — THE ONLY STEP THAT ESTABLISHES ANYTHING.** Derived by the RUNTIME
                       (*"the model's label is advisory only"*) ⇒ TRUE BY ITS MECHANISM, a ⑧-A warrant
                       form. ⚠️ It establishes **WHOSE**, ⛔ NEVER **WHICH QUESTION**.
      S2 `attribute`   ⛔ routing/convenience — ⑤ makes it essential to the PROPOSITION, ③ forbids it
                       carrying QUESTION IDENTITY (E5's tension, still unresolved).
      S3 alias/lexical ⛔ nothing — ⭐⭐⭐ **A3 ALREADY CALLS IT *"a BINDING, not a verdict"* AND REFUSES TO
                       LET IT TEACH.**
      S4 `claimedBy`   ⛔ nothing — ⚠️ its own comment says *"This is IDENTITY, not resolution"*, which is
                       EXACTLY ③'s forbidden inference. ⭐⭐ **#4 REFUTES IT FROM THE CORPUS: ONE exact
                       label COORDINATING THREE QUESTIONS.** ⇒ exact string identity ≠ question identity.
      S5 `slot_id`     ⛔ storage/index — D1's OWN classification (why orphan adoption needs no writer).
      S6 EPHEMERAL     ⛔ nothing — synthesised per (owner, attribute) for EVERY slotless live row (E3/⑦).
      S7 matches/prim. ⛔ nothing — membership is "EVERYTHING IN THE BUCKET"; the incumbent is THE NEWEST.
      S8 cosine ≥0.85  ⛔ nothing — ⚠️ the file records a genuinely **DIFFERENT** pair at **0.856**, and the
                       test is `bestCos >= threshold` ⇒ **IT BINDS**. ⓘ no live override in `mst_settings`.
   ⭐⭐⭐ **THE COLUMN THAT IS EMPTY ALL THE WAY DOWN IS *CURRENT-STATE EXCLUSIVITY* — ⛔ AND THAT IS THE
      ONLY THING COMPETITION DOES.**
   ⭐⭐⭐ **THE ASYMMETRY:** the same 0.7 lexical hit is **TOO WEAK TO TEACH AN ALIAS** and **STRONG ENOUGH
      TO DISPLACE A BELIEF.** The system already holds *"strong enough to route, not strong enough to
      assert"* — ⛔ and does NOT hold it at competition. ⚠️ Fairly: an alias is PERMANENT; which
      consequence is graver is ⛔ NOT settled.
   ⭐⭐ **ABSTENTION ALREADY EXISTS AT ADMISSION** — `relation:'unknown'` ⇒ `slotId:null` ⇒ `matches=[]` ⇒
      ⭐ NO COMPETITION FORMED. ⛔ **DEFER DOES NOT.** #3 (undetermined) was admitted AT FULL STRENGTH.
   ⭐⭐⭐ **THE ANSWER: admission does NOT require an established relation in order to GROUP. It requires one
      in order for the grouping to be EXCLUSIVE — and EXCLUSIVITY IS THE ONLY THING COMPETITION DOES.**
      ⭐ Consistent with ②, ⛔ not a softening: ② ruled membership ESTABLISHES no relation; ⛔ it did not
      rule membership has no EFFECT. ⇒ the admission act has NO WARRANT ⇒ establishes nothing — ⚠️ yet it
      CONSTITUTES an exclusivity no member's evidence supports.
   ⭐ THE CASES: shelter/work-schedule + `schedule`→work-schedule ⛔ illegitimate (string equivalence, AT
      THE CEILING) · Bangkok location/timezone ⭐ correct, ⚠️ ONLY because the LABELS differ · Mira ⚠️ right
      answer, **SAME MECHANISM AS THE WRONG ONES** · 18 `sotera|lesson` ⚠️ never routed; S6 would form ONE
      arena over 18 distinct propositions · 53 slotless ⛔ arenas with nothing established · re-statements
      ⚠️ correct grouping, ⛔ and ⑤ forbids establishing they are one proposition · **#8/#9 ⭐⭐⭐ THE PROOF
      THAT COMPETITION CAN BE FORMED WITH NO SEMANTIC FACT AT ALL** · #3 ⛔ admitted although undetermined.
   ⛔ NOT ESTABLISHED: what should replace any of it · that an ADJUDICATED verdict IS sufficient (⚠️ only
      that the system ranks it above a binding) · ⛔ that retrieval grouping is useless (it asserts
      nothing and is untouched) · ⛔ anything about winner selection.
   ✅ A-D4 DELIVERED AND ACCEPTED (Ote, 2026-09-17) — ⛔ **NOT turned into a design decision.**
   ⚠️⚠️ **ONE WORDING NARROWED BY RULING — ⛔ DO NOT REPEAT THE ORIGINAL.** The investigation said 047 was
      *"the ONLY thing that could license exclusivity"*. ⛔ That decides the positive authority model
      through investigation wording. ⭐ THE RULING: **"No currently observed mechanism establishes a
      warrant for current-state exclusivity. 047 provides an established CANDIDATE FORM for such a
      warrant, ⛔ but no positive exclusivity-authority model has yet been chosen."**

55 ⭐⭐⭐ **A-D5 — THE EXCLUSIVITY WARRANT (opened by Ote 2026-09-17). ⛔ READ-ONLY, ⛔ NO CODE.**
   `INVESTIGATION_SOTERA_AD5_EXCLUSIVITY_WARRANT.md`. ⛔ No assumption that the answer is 047, an LLM
   verdict, provenance or anything else. ⛔ Winner selection still out of scope.
   ⭐⭐⭐ **THE STRUCTURAL TEST THAT DID THE SORTING: EXCLUSIVITY IS IRREDUCIBLY A CLAIM ABOUT A *PAIR*, AND
      ALMOST EVERY MECHANISM IN THIS SYSTEM PRODUCES A *UNARY* CLAIM** — provenance (one observation ← one
      turn) · attestation (one turn exists) · `markContradicted` (one proposition) · writer/act/occasion
      (one act) · entity scope (whose). ⭐ A3's adjudication is BINARY ⛔ but between **PHRASINGS**, not
      observations. ⇒ ⭐ ONLY TWO CANDIDATES SURVIVE.
   ⭐ (a) **`governsReplacement` — M2 AS THE REPLACEMENT AUTHORITY. It MEETS ⑧-A ON EVERY AXIS:**
      BOUNDED — scope is ONLY `UPDATE`; *"collapse is never gated is guaranteed by **PLACEMENT**, ⛔ not by
        a conditional"* ⇒ ⭐⭐ TRUE BY MECHANISM, ⛔ not a flag anyone can clear.
      CHECKABLE — **PURE** (no store, IO, config, model) · *"EXACT MATCH ONLY… no 'close enough': every one
        of those is an inference about what the question means"*.
      DECLARED BOTH SIDES — `slotKind` is the bound question's KEY; `claimKind` comes from the caller that
        knows ⇒ ⭐ ③'s STANDARD MET.
      ANSWERABLE — the refusal names the REMEDY and the PAIR. REFUSAL PRESERVED — ⭐ *"a refusal leaves the
        world as it found it"*. FAILS CLOSED — absent `claimKind` on a governed slot ⇒ REFUSE.
      ⭐⭐⭐ **AND ABSTENTION ≠ DEFER IS ALREADY THE RATIFIED DESIGN HERE** — `NOT-IN-SCOPE`/`ALLOW`/`REFUSE`,
        Ote's own *"don't let the implementation accidentally turn 'not in scope' into DEFER"*; and
        `checkKind` names the third state with its SEPARATE REMEDY (*"an admission that the question was
        never declared"* ⇒ declare it, vs. decide about the claim).
      ⛔ **LIMITS — DECISIVE:** its ENTIRE REACH IS ONE OPERATOR SLOT. 1 question · 1 of 112 slots bound ·
        **35 admission pins and 66 gateable replacements, ALL in `build tag for this cycle`** ⇒ ⛔ ZERO USER
        BELIEFS EVER GATED. ⭐ It is ⛔ not theoretical — it has run 66 times.
      ⭐⭐⭐ **AND IT AUTHORIZES THE *REPLACEMENT*, ⛔ NOT THE *MEMBERSHIP*** — ③ established the gate is
        DOWNSTREAM of routing and ASSUMES it. ⚠️ Two-sided: it WOULD have refused #8/#9 **if the claim
        declared its own question** — ⛔ but only because the CLAIM declared it, ⛔ never because the gate
        examined the arena. ⚠️ `claimKind` has ONE supplier (`keep`/`remember_fact`, 2026-09-04); every
        other writer would REFUSE on a governed slot — ⭐ correct and fail-closed, ⛔ and it means
        governance is NOT broadly adoptable today.
   ⭐ (b) **THE IDENTITY RESOLVER'S ASK — the ONLY OBSERVATION-TO-OBSERVATION authorization.** The specific
      PAIR put to the one answerable party. BOUNDED · ANSWERABLE (*"they are the only authority on their
      own name"*) · REFUSAL PRESERVED (`declined` ≠ `deferred`, abstention the DEFAULT) · FAILS CLOSED.
      ⚠️ CHECKABLE ONLY IN PART — ⭐ *that* it occurred is checkable; ⛔ *that it was right* is TESTIMONY.
      ⛔ Scoped to ONE attribute family; ⛔ whether that standing generalises is NOT ESTABLISHED.
   ⭐⭐ **ENFORCEMENT IS NOT WARRANT** — one-live-row convergence · `findLiveInSlot` · the collapse of
      extras all **PRESUPPOSE** exclusivity and enforce it. ⭐ Enforcing exclusivity over an unwarranted
      set is A-D4's finding from the other side.
   ⭐⭐⭐ **THE ANSWER: A-D5 FINDS A WARRANT FOR THE EXCLUSIVITY *ACT*. IT FINDS NONE FOR THE EXCLUSIVITY
      *SET*.** Both mechanisms operate on a pair ALREADY BROUGHT TOGETHER BY SOMETHING ELSE. ⇒ A-D4's gap
      is NARROWER than it appeared (a well-formed warrant FORM exists and demonstrably works) and
      ⛔ UNCHANGED IN SUBSTANCE.
   ⛔ NOT ESTABLISHED: that 047 IS the answer (⛔ and per A-D4's narrowing it must not be chosen by
      wording) · that an aux-LLM adjudication is or is not sufficient (⚠️ NOT TESTED) · that the Identity
      Resolver's standing generalises · that `claimKind` should be required of every writer.

56 ⭐⭐⭐⭐ **DESIGN UNLOCKED — THE COMPETITION LIFECYCLE CONTRACT (Ote, 2026-09-17).**
   `DESIGN_SOTERA_COMPETITION_LIFECYCLE_CONTRACT.md`. ⭐ Ote: *"the fence was for the A-D4/A-D5
   investigation passes… you are free to propose and, ONCE WE AGREE ON THE SEMANTICS, modify schema, code,
   logic, prompts."* ⛔ ⇒ DERIVE THE CONTRACT FIRST. ⛔ NOTHING IS BUILT.
   ⭐⭐⭐ **THE SEAM:** `similarity → grouping → competition → exclusivity`, with ⛔ NOTHING authorizing the
      grouping→competition transition. A-D4/A-D5 showed acts ① and ② are CONFLATED.
   ⭐⭐ **⛔ DO NOT FIX THIS BY MAKING THE MATCHER SMARTER** (Ote) — ⭐ and the derivation agrees for a
      STRONGER reason than 0.856: **THE MATCHER IS NOT BROKEN AT ITS OWN JOB. IT IS BROKEN AT A JOB IT WAS
      NEVER GIVEN.** A perfect matcher still answers *"are these alike?"* when the question is *"may these
      compete?"* ⇒ the repair is ⛔ NOT accuracy; it is to stop grouping carrying an unearned consequence.
   ⭐ THE FOUR ACTS: ① GROUPING (claims nothing, needs nothing — ⭐ **R1: no consequence beyond
      retrievability**) · ② ADMISSION (⭐⭐⭐ **THE MISSING ACT** — claims EXCLUSIVITY, needs a warrant) ·
      ③ EXCLUSIVITY ACT (④-A: a system disposition — ⭐ **R2: it must CITE its admission**) · ④ WINNER
      SELECTION (⛔ out of scope).
   ⭐⭐⭐ **THE DERIVATION THAT DOES THE WORK — FROM ①:** there is no universal incoming/incumbent
      relationship ⇒ ⛔ **ADMISSION CANNOT BE DERIVED FROM THE RELATION BETWEEN THE TWO OBSERVATIONS.**
      ⇒ it must rest on something SAME FOR BOTH and INDEPENDENT of their relation. Exactly two survive:
      (a) THE Q-ROUTE — both are established as answering THE SAME QUESTION (exclusivity then follows from
          *one question, one current answer*)
      (b) THE STANDING-ROUTE — a party with standing authorizes THIS PAIR (the Identity Resolver's ask)
      ⭐ NEITHER needs to know the relation — ⛔ which is WHY they survive ①. That is a DERIVATION, ⛔ not a
      preference for 047.
   ⭐⭐⭐ **AND THE ANSWER TO OTE'S 047 QUESTION: AS IT STANDS 047 IS *HALF A WARRANT*.**
      `governsReplacement({slotKind, claimKind})` compares the INCOMING claim against THE SLOT. ⛔ It NEVER
      asks what question the INCUMBENT answers — that is ASSUMED to be the slot's, and the incumbent got
      there through EXACTLY the routing A-D4 found unwarranted. ⇒ **membership is a TWO-SIDED fact and the
      gate checks ONE side.** ⭐ That is why A-D5 came out *"a warrant for the ACT, none for the SET"* —
      ⛔ not because 047 is weak, but because **a set is not a slot.**
   ⭐⭐⭐ **THE MISSING SIDE ALREADY EXISTS AND NOTHING READS IT:** `question_id_at_admission` — written at
      `memory-store-sequelize-host.js:1191`, ⛔ **READ BY NOTHING in production** (migrations and checks
      only). 048 built it as the row's OWN answer to *"which question?"*, pinned at admission and
      *"never looked up later."* ⇒ two-sided admission needs ⛔ NO NEW FACT — it needs the gate to compare
      against the INCUMBENT'S PIN instead of the slot's current binding.
      ⚠️ ⛔ BUT ITS NULL MEANS *"no kind gate was applied"*, ⛔ **NOT** *"no question"* ⇒ a two-sided rule
      must read NULL as NOT ESTABLISHED and DEFER. That is the cost, in full.
   ⭐⭐ **DEFER BELONGS AT THIS BOUNDARY — four outcomes:** NOT-IN-SCOPE · ADMIT · ABSTAIN (⛔ no warrant
      CAN exist — #8/#9) · DEFER (⚠️ the record cannot establish one — #3, remedy = DECLARE THE QUESTION).
      ⭐ **ABSTAIN and DEFER may share the same IMMEDIATE BEHAVIOUR (no competition) and must still be
      DIFFERENT STATES** — they differ in RECORD and REMEDY. ⇒ the lock costs a state, ⛔ not a code path.
   ⚠️ THE COSTS, STATED BEFORE THE OPTIONS: almost nothing would be admitted at first (1 question · 1 of
      112 slots · the pin NULL on ~every incumbent) · `claimKind` has ONE supplier · deferred pairs
      COEXIST so *current* becomes plural (⭐ which ⑦ and the 53 slotless rows already do) · ⛔ no backfill.
   ✅⭐⭐⭐ **D-1…D-6 ALL DECIDED (Ote, 2026-09-17):**
      D-1 ✅ admission is a **SEPARATE ACT** ⛔ not a precondition hidden inside `create`
      D-2 ✅ the **INCUMBENT PIN** is the second side ⛔ NEVER infer the incumbent's question from the slot
      D-3 ✅ the **STANDING ROUTE STAYS NARROW** ⛔ do not generalise the Identity Resolver's authority
      D-4 ✅ **"group but never compete" is LEGITIMATE** ⛔ never manufacture a question to make a row
          eligible — ⭐ not every durable memory needs a current-holder slot
      D-5 ✅ **DEFER PERMITS COEXISTENCE** ⛔ never hold or discard the observation
      D-6 ✅ **047 IS THE Q-ROUTE VEHICLE, ADAPTED** ⛔ not declared the universal authority model
   ⭐⭐⭐⭐ **AND THE LOCKED PRINCIPLE (Ote):** *"Grouping remains allowed to be wrong… **A CANDIDATE PAIR IS
      NOT A COMPETING PAIR UNTIL AN INDEPENDENT WARRANT ADMITS IT.** That means the matcher can remain
      exactly as it is."*

57 ⭐⭐⭐⭐ **THE ADMISSION CONTRACT — SPECIFIED 2026-09-17. ⛔ IMPLEMENTATION NOT AUTHORIZED.**
   `CONTRACT_SOTERA_COMPETITION_ADMISSION.md`.
   ⭐⭐⭐ **THE WHOLE REPAIR, IN ONE SUBSTITUTION:** `matches` today = EVERYTHING IN THE BUCKET;
      under the contract `matches` = **THE ADMITTED SUBSET**. ⭐ Everything else is machinery to compute it.
   ⭐ **ADMISSION IS PER-PAIR** (incoming × each candidate) — derived from A-D4's pairwise finding ⇒ three
      rows under one label with three different questions give THREE verdicts, ⛔ not one arena.
   ⭐ INPUTS: `claimKind` (incoming, declared) · the INCUMBENT'S OWN `question_id_at_admission` → key ·
      scope (a PRECONDITION, ⛔ not the warrant) · is-this-exclusivity-bearing.
      ⭐ Resolving pin uuid → `question_key` is SAFE because M2-10 makes questions immutable/repoint-not-edit.
      ⛔ This is NOT the lookup 048 forbade — 048 forbids memory→SLOT→question; the ROW'S OWN pin is
      exactly what the column was built for.
   ⭐⭐⭐ **THE FOUR OUTCOMES, AND THE DEFINITION THAT KEEPS THE LOCK HONEST:**
      NOT-IN-SCOPE  no exclusivity is created (no incumbent · NOOP · DUPLICATE · identity ns)
      ADMIT         ⭐ BOTH sides established AND EQUAL
      ABSTAIN       ⭐ BOTH sides established AND DIFFERENT — remedy: ⛔ NONE, they were never candidates
      DEFER         ⚠️ EITHER side NOT established — remedy: DECLARE THE QUESTION · ⭐ BOTH ROWS STAY LIVE
      ⇒ ⭐⭐ **ABSTAIN is a POSITIVE FINDING; DEFER is an ABSENCE.** ⚠️ **THEREFORE ABSTAIN IS CURRENTLY
      UNREACHABLE** — no incumbent carries a pin, so EVERY pair today is DEFER. ⭐ That is the contract
      being honest: it may not claim *"#8/#9 are unrelated"*, only *"I cannot establish that they are."*
   ⭐⭐⭐ **THE PIN PROPAGATES ⇒ NO BACKFILL IS NEEDED.** A row written with a declared claimKind receives
      its own pin ⇒ it is an ESTABLISHED incumbent for the next write. 1st row in a family = NOT-IN-SCOPE
      + pinned; 2nd row = a real verdict. ⇒ **the corpus becomes competition-capable FORWARD, never
      backwards** — exactly what 047's principle requires.
      ⚠️ **THE HONEST COST:** an existing live incumbent has no pin and can NEVER acquire one ⇒ it stays
      live forever beside its successors and never competes, and **RECALL MAY RETURN BOTH.** ⚠️ D-4
      licenses it in principle; ⛔ this specific user-visible form needs Ote's explicit acceptance.
   ⭐⭐⭐ **THE DESIGN DISARMS THE CANARY BY CONSTRUCTION** — if `sotera|lesson` were ever armed, admission
      runs FIRST, none of the 18 carries a pin ⇒ DEFER ⇒ ⛔ NO COMPETITION ⇒ ⛔ NO COLLAPSE. ⭐ Without
      touching a single row. ⛔ It still must not be armed deliberately.
   ⚠️ **§5 CONSEQUENCE NEEDING RATIFICATION:** under D-2 the SLOT'S BINDING STOPS GATING EXCLUSIVITY — a
      pair competes for the question THEY BOTH DECLARE, whichever slot holds them. ⇒ `governsReplacement`
      is **KEPT, ⛔ not removed**, answering its own narrower question (is this a valid ANSWER to the slot's
      question). ⚠️ So a write can be ADMITTED and still REFUSED by it. Coherent — ⛔ ratify, don't discover.
   ⭐ DEFER IS RECORDED IN A **LEDGER** (the shape `log_slot_bindings`/`log_slot_aliases` already use, both
      of which record REFUSALS): the pair, both keys (⭐ NULL stored AS NULL), outcome, why-with-REMEDY,
      route, writer/act/occasion. ⛔ NOT-IN-SCOPE is not recorded. ⚠️ VOLUME IS A REAL COST — measure it.
   ⭐ THE EXCLUSIVITY ACT MUST **CITE** ITS ADMISSION — two different citations: the PIN (semantic state for
      the NEXT admission ⇒ ⭐ it gains its FIRST PRODUCTION READER) and a LEDGER REFERENCE (the receipt).
   ⭐ NO QUESTION ⇒ **DEFER, ALWAYS**, and per D-4 that is a LEGITIMATE RESTING STATE, ⛔ not a backlog.
   ⭐ THE STANDING ROUTE is REGISTRY-HELD and NARROW: ⭐ ONE entry today (the Identity Resolver's ask,
      identity namespace, a person's own name). ⛔ NOT re-plumbed. ⛔ Adding a family is a RULING, ⛔ never
      a code change.
   ⛔ UNCHANGED: the matcher · retrieval · winner selection · `governsReplacement` · collapse (it simply
      never sees un-admitted rows) · every existing row · the canary stays unarmed.
   ✅⭐ **ALL THREE RATIFIED (Ote, 2026-09-17):** the DOUBLE GATE — *ADMITTED → REPLACEMENT_REFUSED* is
      coherent and ⛔ must NOT be read as evidence that admission was wrong · the LEGACY CONSEQUENCE —
      accepted explicitly, ⛔ **forward-only, no invented historical declarations** · LEDGER VOLUME —
      ⭐ MEASURE FIRST (candidate-set size · pairs per write · worst case · growth rate · repeats ·
      storage), ⛔ invent no threshold.

58 ⛔⛔⛔ **THE IMPLEMENTATION-IMPACT REVIEW — ⛔ NOT CLEAN. BUILD IS *NOT* AUTHORIZED.**
   `REVIEW_SOTERA_ADMISSION_IMPLEMENTATION_IMPACT.md`. ⭐ The contract is SOUND; ⛔ it does not REACH three
   paths that create exclusivity, and one path changes MORE than the contract implied.
   ⭐ THE WRITE-PATH CENSUS (traced in source): `keep`/`remember_fact` ✅ reachable and ⭐ **THE ONLY PATH
      THAT SUPPLIES `claimKind`** · extractor + followthrough ✅ reachable ⚠️ but declare NOTHING ·
      reflection ✅ **safe — it writes EPISODIC notes, not facts** · episodic ✅ **NOT-IN-SCOPE BY
      CONSTRUCTION — *"no supersede"* by design** · ingest ✅ **NO LIVE WRITER** (the 34 doc rows came
      from a maintenance seed; `WRITER.ingest` appears only in a check) · forget ✅ CLEARS `invalid_at`.
   ⛔⛔ **FINDING 4 — THE BIG ONE: THE EXTRACTOR STOPS SUPERSEDING.** Only the model's tools supply
      `claimKind`, so EVERY extractor write DEFERs ⇒ **update-not-append effectively STOPS for the
      HIGHEST-VOLUME fact writer on day one**, and ⛔ **THIS ONE DOES NOT HEAL FORWARD** (unlike the legacy
      incumbent). ⇒ 3 options, ⛔ none chosen: ACCEPT (D-4 licenses it; ⚠️ her facts stop converging and
      recall surfaces several answers where it surfaced one) · STAGE (enforce only where the incoming
      declares; ⚠️ leaves the seam open where it fires most) · LET THE EXTRACTOR DECLARE (⛔ a separate
      decision — M2-10 forbids INFERRING the question).
   ⛔ **FINDING 1 — CONSOLIDATION creates exclusivity and the contract does not reach it.** `commitCard`
      writes `supersedes_id` + invalidates the prior, ⛔ never touching `reconcileFact`, and it is
      invisible to `governsReplacement` (cards carry NO `slot_id`). ⭐⭐ BUT ④ ALREADY GAVE W4 ITS OWN
      WARRANT — *"its content was USED to compose a successor"* ⇒ TRUE BY THE ACT'S OWN CONSTRUCTION.
      ⇒ ⭐⭐ **"SUPERSEDES" IS NOT "COMPETES"**: a card's successor is BUILT FROM its predecessor — a
      version lineage, ⛔ not two independent observations contending. ⭐ PROPOSED (⛔ needs ratification):
      tighten NOT-IN-SCOPE to *"admission applies where two INDEPENDENTLY-AUTHORED observations are made
      mutually exclusive; ⛔ it does NOT apply where the successor is CONSTRUCTED FROM the incumbent."*
      ⚠️ **LEFT UNFIXED, A LITERAL IMPLEMENTATION WOULD MAKE CARDS DEFER AND CARD EVOLUTION WOULD STOP.**
   ⛔ **FINDING 2 — THE LESSON PATH BYPASSES THE STORE.** `lesson-host.revise()` is a RAW
      `UPDATE … SET invalid_at, supersedes_id` ⇒ ⛔ admission cannot reach it — ⚠️⚠️ **AND NEITHER DOES D1
      PHASE 3**, because `requireWriter` lives in `store.update` and this mutates TWO SEMANTIC_FIELDS
      outside it. ⚠️ PRE-EXISTING and LATENT (0 rows); ⛔ the contract neither creates nor widens it.
      ⭐ PROPOSED: lessons OUT OF SCOPE (D-4 licenses it) + record the D1 gap as a SEPARATE pre-existing
      item, ⛔ not folded into this build.
   ⛔ **FINDING 3 — `restore` (W6) BLOCKS ON A RAW ARENA THE CONTRACT NEVER WARRANTED** — `findLiveInSlot`
      falls back to `{entity, attribute}` WITH NO SLOT (②'s P15). ⇒ ⚠️ `reconcileFact` would stop competing
      on unwarranted arenas while `restore` keeps REFUSING on exactly such an arena — **the two seams would
      disagree.** ⭐ PROPOSED: explicitly OUT OF SCOPE (it defends the one-live-row invariant rather than
      asserting a relation) OR a later decision — ⛔ NOT SILENTLY EITHER WAY.
   ⭐ **FAILURE SEMANTICS RESOLVE CLEANLY:** the VERDICT is PURE and in-process ⇒ ⛔ cannot fail on IO; the
      LEDGER is an INSERT and can. ⭐⭐ **A LOST LEDGER ROW DOES NOT LOSE THE WARRANT** — the admitting
      question is ALSO pinned on the row ⇒ the receipt is RECONSTRUCTIBLE ⇒ the ledger may fail to a LOUD
      LOG without failing the write (the precedent the pin and `recordRefusal` already set).
      ⛔ THE VERDICT MUST NEVER FAIL OPEN — unresolvable keys ⇒ **DEFER**, safe by construction.
      ⚠️ PRE-EXISTING non-atomicity (`create` then `update(prior)`) is NAMED, ⛔ not worsened and ⛔ not
      closed. ⭐ NO NEW RACE — commits ride the SERIAL lane; identity is deliberately OFF it and uses the
      STANDING route with its own convergence.
   ⚠️ INVARIANT DELTAS: ONE-LIVE-ROW-PER-SLOT is **weakened BY DESIGN** (D-5, ratified) · UPDATE-NOT-APPEND
      is **suspended wherever admission DEFERs**. ✅ Everything else preserved, incl. A-D7, absent-stays-
      absent, the axes, collapse-never-gated, and ⭐ an armed canary becomes HARMLESS.
   ⚠️ TEST SURFACE: suites asserting a supersede on an UNDECLARED pair will legitimately change. ⭐ AND A
      NEW POSITIVE CONTROL IS REQUIRED — *"a DEFER wrote both rows and invalidated neither"* — because a
      100%-DEFER suite proves nothing (RP-D0's own lesson).
   ⏸ **THE FIVE THINGS NEEDED BEFORE BUILD:** ① the extractor ② consolidation ③ `restore` ④ the lesson D1
      gap ⑤ the DEFER positive control. ⭐ ② and ③ are CORRECTIONS TO THE CONTRACT, ⛔ not to the design.
   ✅⭐ **ALL FIVE RESOLVED (Ote, 2026-09-17), AND THE CONTRACT IS UPDATED:**
      ② CONSOLIDATION ✅ **NOT-IN-SCOPE** — NOT-IN-SCOPE is TIGHTENED to *"admission applies where two
        **INDEPENDENTLY-AUTHORED** observations are made mutually exclusive; ⛔ it does NOT apply where the
        successor is **CONSTRUCTED FROM** the incumbent."* ⇒ version lineage, ⛔ not competition.
      ③ `restore`/W6 ✅ **OUT OF SCOPE FOR THIS BUILD** — unchanged. ⚠️ The two seams WILL disagree,
        **KNOWINGLY** — ⛔ not silently. ⏸ A separate future decision.
      ④ THE LESSON D1 GAP ✅ **SEPARATE PRE-EXISTING ISSUE** — recorded, ⛔ NOT folded into this build.
      ⑤ CONTROLS ✅ **TWO ARE REQUIRED FOR DONE:** ⭐ a DEFER control (both rows live, NEITHER invalidated
        or superseded) **AND** ⭐⭐ an **ADMIT** control (a genuinely TWO-SIDED same-question pair CAN enter
        competition). ⚠️ Ote: *"today's corpus would otherwise make it possible to **'prove' the
        implementation with nothing but universal DEFER**."* ⭐ RP-D0's lesson, one layer up.
      ⛔⛔ AND THE CONTRACT NOW CARRIES **THE VACUITY-TRAP PROHIBITION**: the incoming's question may NEVER
        be derived from the incumbent's pin NOR from the resolved slot — either makes `K_in === K_inc`
        trivially true ⇒ **the gate would ALWAYS ADMIT and prove nothing.**

59 ⭐⭐⭐⭐ **THE EXTRACTOR'S `claimKind` — ⛔ NO LEGITIMATE SOURCE FOR VOLUNTEERED FACTS.**
   `DESIGN_SOTERA_EXTRACTOR_CLAIMKIND_SOURCE.md`. ⛔ The extractor prompt and the `remember_fact` tool
   description were READ ONLY, ⛔ not touched (standing constraint).
   ⭐ ITS **ENTIRE** INPUT: **ONE TURN** of text · `sourceMessageId` · scope · a `source` label ·
      `assertionGate`'s asserted text · its writer contract. Output: `{entity, attribute, value,
      importance}` + a VERIFIED provenance class. ⛔ **NO question appears in its inputs OR its outputs**
      — the prompt says *"Extract DURABLE facts about the USER from **the message below**"*.
   ⛔ EVERY CANDIDATE TESTED AND REJECTED: the TURN TEXT (⛔ contains the ANSWER, not the QUESTION) ·
      the ATTRIBUTE (⛔ ③) · the LLM's JUDGEMENT (⛔ M2-10 — *never guessed by a classifier*) ·
      A2's `attributeCandidate`/`Shape` (⛔ advisory by ruling) · the SLOT's binding (⛔ D-2) ·
      the INCUMBENT'S PIN (⛔⛔ the VACUITY TRAP).
   ⭐⭐⭐ **THE STRUCTURAL RESULT — THE BOUNDEDNESS THAT EARNS ITS WARRANT IS WHAT DENIES IT THE QUESTION.**
      Its ONE delegated grant is legitimate *because* *"the extractor **cannot read anything but the turn
      it was handed**"*. ⚠️ The only non-inferential home for a question is **THE PRECEDING ASSISTANT
      TURN** — and that is OUTSIDE its reach BY CONTRACT. ⇒ ⭐ **giving it the question would widen its
      reach from `turn` to `range` (the REFLECTION contract) and the declared coincidence would no longer
      be TRUE BY MECHANISM ⇒ THE GRANT WOULD LAPSE.** ⛔ **You cannot give the extractor question identity
      without destroying the one warrant it already has.**
   ⭐⭐ **THE ONE GENUINE ROUTE — ELICITATION**, and the provenance vocabulary ALREADY names it:
      *"**elicited** — we ASKED and they answered… shaped by **our question**"*. ⭐ When the system ASKS,
      the question is established BY THE SYSTEM, WHICH KNOWS WHAT IT ASKED — ⛔ no inference.
      ✅ Bounded · checkable · answerable · ⭐ DECLARED BEFORE THE ANSWER EXISTS, so it cannot be fitted to it.
      ⚠️ ⛔ BUT: `PROVENANCE.elicited` is set in **EXACTLY ONE SITE** (the Identity Resolver's
      `adopted-after-ask`), the extractor NEVER sets it, ⛔ no fact-elicitation path exists, and even the
      identity ask records THAT one was asked, ⛔ **never WHICH declared question.**
      ⛔ AND MOST EXTRACTED FACTS ARE **VOLUNTEERED**, not elicited ⇒ ⛔ it does NOT solve the volume problem.
   ⭐⭐⭐ **THE ANSWER: for VOLUNTEERED facts the extractor has NO legitimate source. ABSENT REMAINS ABSENT;
      DEFER REMAINS CORRECT. M2-10/M2-11 STAY LOCKED.** ⇒ ⚠️ **Ote's chosen option 1 (*"let it declare"*)
      IS NOT AVAILABLE** — ⛔ not by preference, by structure, exactly as his own instruction anticipated.
   ⏸ ⇒ THE EXTRACTOR-VOLUME QUESTION RETURNS TO OTE with one option ELIMINATED: ⚠️ ACCEPT (facts stop
      converging; recall surfaces several answers where it surfaced one) · ⚠️ STAGE (the seam stays open
      where it fires most) · ⭐ **BUILD ELICITATION** — legitimate, bounded, checkable, ⛔ a COMPLEMENT
      covering only elicited facts, ⛔ **never a replacement for choosing between the other two.**
   ⭐ AND THE PROMPT MUST **NOT** CHANGE — asking it for a question key IS the classifier M2-10 forbids.

60 ⭐⭐⭐⭐ **A — ACCEPT. THE BEHAVIOUR IS LOCKED (Ote, 2026-09-17), AND THE FINAL IMPACT PASS IS CLEAN.**
   `CONTRACT_SOTERA_COMPETITION_ADMISSION.md` §0 · `REVIEW_SOTERA_ADMISSION_IMPACT_FINAL.md`.
   ⭐⭐⭐⭐ **THE PRINCIPLE:** *"An undeclared question does not prevent memory formation; it prevents
      MUTUALLY EXCLUSIVE COMPETITION."* ⇒ observation → question established ⇒ admission may evaluate;
      question absent ⇒ ⭐ MEMORY IS STILL WRITTEN, ⛔ with no exclusivity and no competition.
   ⛔ STAGE WAS REJECTED, and the reason is recorded: it *"would knowingly preserve the exact legacy seam
      we're trying to remove — the highest-volume extractor path would continue allowing
      grouping/similarity to become competition without an independent warrant."*
   ⭐ THE CONSEQUENCE IS ACCEPTED EXPLICITLY: *"I'd rather expose that coexistence than manufacture an
      unsupported 'current answer.'"*
   ⏸ ELICITATION stays a SEPARATE FUTURE CAPABILITY — ⛔ NOT part of this build without its own pass.
   ① EXTRACTOR DEFER WRITES: grouping runs; `claimKind` absent ⇒ DEFER ⇒ ⭐ **matches = []** ⇒ plan = NEW
      ⇒ `stale = []` ⇒ ⛔ NOTHING invalidated, the prior row stays live. ⭐ The fact is FULLY FORMED (writer,
      act, reach, provenance, evidence, slot, embedding) — ⛔ it just never acquires exclusivity.
      ⚠️ AND IT RECEIVES NO PIN ⇒ **undeclared stays undeclared, FORWARD.**
   ② ⭐⭐⭐ **THE SUBSTITUTION PROVABLY COVERS `reconcileFact` — BOTH SITES:**
      `plan.supersedes ∈ matches` · `plan.collapse ⊆ matches` · `stale = [supersedes, …collapse]`
      ⇒ **every row it can invalidate comes from `matches`** ⇒ replacing `matches` with the admitted subset
      makes an un-admitted invalidation **STRUCTURALLY IMPOSSIBLE**. ⛔ No second guard; none added.
      ⭐ PRECISION: *"collapse is never gated"* STILL HOLDS — its **INPUT** narrows, ⛔ no gate is placed.
   ③ ⚠️ **TWO PATHS CAN STILL DISPLACE AN UNDECLARED OBSERVATION — both ratified out of scope:**
      `restore`/W6 (⚠️ **LIVE**) and `lesson revise` (⛔ latent, 0 rows). ⭐ EVERYTHING ELSE IS CLOSED —
      the census over production writes of `invalid_at`/`supersedes_id` is EXHAUSTIVE.
   ④ ⚠️⭐ **NEW FINDING THE FIRST PASS MISSED:** `restore`'s arena falls back to `{entity, attribute}` ⇒ it
      applies to EXACTLY the slotless families that ACCEPT will now fill with coexisting rows.
      ⇒ **ACCEPT INCREASES `restore`'s EXPOSURE.** ⛔ Does not change the ruling; ⏸ strengthens the case for
      the separate decision.
   ⑤ RETRIEVAL: ⭐⭐ **RECALL ALREADY SUPPRESSES RESTATED VALUES** — `rank the WHOLE set → dedupeByValue →
      THEN slice`, so a suppressed row costs NO recall slot. `sameValueMeaning` is STRICT (token-set
      EQUALITY + a negation guard). ⇒ SAME-VALUE restatements are **invisible — recall looks as it does
      today**; ⚠️ DIFFERING values BOTH surface — ⭐ which is exactly the intended change.
      ⚠️ TWO COSTS: recall slots are finite (limit 8) so fewer DISTINCT facts fit as coexistence grows ·
      ⚠️⭐ `dedupeByValue` rests on *same value ⇒ same thing*, **THE INFERENCE ⑤ FORBIDS** — it is a
      PRESENTATION decision claiming nothing durable, ⛔ so it does not violate ⑤'s COMPETITION ruling,
      ⚠️ but **ACCEPT PUTS MORE WEIGHT ON IT.** ⛔ Recorded, ⛔ not fixed here.
      ⭐ THE COMPOSER IS UNTOUCHED — it reasons about slots/competition/currency not at all.
   ⑥ ⭐⭐ **THE TWO CONTROLS, AND CONTROL B MUST *CONSTRUCT* BOTH SIDES** (today's corpus has none, so a
      test that merely LOOKS for one passes vacuously): A = both rows live, neither invalidated, no
      supersede/collapse audit, a DEFER ledger row, ⭐ and NO pin. B = declare `zz_q` → bind → R1 WITH
      claimKind ⇒ **ASSERT R1's PIN IS NOT NULL (the first side, PROVED)** → R2 same key ⇒ ADMIT, R1
      invalidated, R2.supersedes_id = R1, ADMIT ledger row, R2 pinned, ⭐ teardown ASSERTED.
   ⑦ ⭐⭐⭐ **SHELTER/WORK-SCHEDULE CANNOT RECUR — IN EITHER STATE.** Grouping STILL matches at lexical
      1.000 (⛔ the alias is untouched) — but the extractor declares nothing ⇒ DEFER ⇒ matches = [] ⇒
      ⭐⭐ THE INCUMBENT IS NOT TOUCHED. And if BOTH sides were declared, they declare DIFFERENT questions
      ⇒ ⭐ ABSTAIN ⇒ no competition. ⇒ **lexical/alias/cosine can no longer reach a displacement AT ALL.**
      ⚠️ THE ONE RESIDUAL ROUTE: both writers declaring the SAME WRONG key — ⭐ a DECLARATION error, ⛔ not
      an inference error: attributable, ledgered, refusable, remediable by rebinding.
   ⭐ **ACCEPT MAKES THE BUILD SMALLER:** ⛔ NO writer changes · ⛔ NO prompt changes · ⛔ NO elicitation.
```

---

# 0-C · LIVE STATE — 2026-09-17

```
:8210 (Sotera — ⭐ ON THE ACCEPTED ADMISSION BUILD, HEALTHY) · :8201 (OLS, HIS, untouched, healthy)
:54322 pg · ⭐ migrations through **053** · writer contracts 17 (+ `resolver`) · slots 112 · aliases 8 · memories 235
resolver: grayZoneMode='shadow' · ontologyMode='shadow'  ⇒ BOTH ACCUMULATING, ⛔ neither has authority
unit 753/753 · @ote/memory 123/123 · alias ledger 4 rows (all `refuse`)
⭐ 047 QUESTION LAYER: **1 question declared** (the harness canary) · 1 of 112 slots bound · 2 bind acts,
   BOTH `ote-operator` on `canary-bind-2026-09-03-*` ⇒ ⛔ **ZERO ORGANIC PRECEDENT.**
⭐⭐ 053 ADMISSION LEDGER: `log_memory_admissions` — **0 rows** · 3 CHECKs · 5 indexes.
   ⭐ `log_memory_admissions_outcome_evidence_ck` PROVED LIVE: an ABSTAIN with a NULL side is REFUSED (23514)
⭐ rows PINNED (`question_id_at_admission`) 35 — ⛔ ALL in `build tag for this cycle`, an OPERATOR slot.
   ⇒ ⛔ ZERO user beliefs are established incumbents ⇒ ⭐ EVERY organic pair today resolves to **DEFER**.
⚠️ ⭐ THE ARC IS NO LONGER READ-ONLY — the admission build SHIPPED and is ACCEPTED (migration 053 applied).
   ⛔ But NOTHING ELSE changed: no repair, no backfill, no arming, no prompt/writer change.
attribution: 23+ scans · 5 confirmed-shape candidates · ⚠️ **7 UNREVIEWED (Ote's)** — the detector fires on
   live traffic, so this number GROWS. `cb5ea911 ed08529e 3f195763 82509ae8` are the ORIGINAL four.
CRONS LIVE: noticing (15m) · reflection (20m) — reflection is PROVEN LIVE (fired unprompted 09-16, wrote 3 rows)
OFF: dreamingEnabled (unset) · consolidateEnabled · episodeDistillEnabled · reflectMode ('off', 0 note rows EVER)

⛔ EVIDENCE KEPT ON PURPOSE — `node test/checks/evidence-baseline-check.mjs` guards ALL of it:
  KNOWN-GOOD  the Mira chain (318282ac→1fd59a3b, slot 9ed7d99c; + reflection c6b415bc) = the DIRECT TOOL path
              working end to end
  THE FAILURE the shelter set: slot f792b628 chain 365e774e→baf35aa0→33926415, plus 994dd66a, 8fc8e793,
              60edebfc, 8a142ce8 = the EXTRACTOR + EXCERPT path failing
  ARMED ×2    `location` → the work-schedule slot (1.0000, sorts ahead of the real `location` slot)
              `deploy schedule` → the work-schedule slot (1.0000, NARROWER) — both from the `schedule` alias
  ⚠️ The Saturdays/Sundays contradiction is NOT live — reflection superseded it 09-16 13:40. The evidence is
     the LINEAGE (dead-but-kept + supersedes_id). ⛔ Do not describe it as a live disagreement.

⭐ THE SLOT CENSUS (`node test/checks/slot-behaviour-census.mjs` — read-only, writes nothing):
  112 slots = 16 `zz` fixtures + 30 holding NO memory row + 1 harness canary + 65 CENSUSED
  7 of 65 ever superseded (10.8%) over 38 days · ⚠️ that 89.2% is AGE-CONFOUNDED and proves nothing alone
  ⭐ the finding is the NUMERATOR: of the 7, ONE was a world-change (the Mira fixture) · 1 `operator` repair
    · 4 RE-STATEMENTS (same answer, reworded) · 1 the known `work schedule` defect ⇒ ORGANIC count ZERO
  cross-tab vs naming: READABLE 6 sup / 43 never · UNREADABLE 1 / 15 ⇒ ⛔ the boundary is NOT the label
  value form (64 live): 20.3% are 1–3 words · 28.1% are 21+ · 50% carry a sentence terminator
  ✅ INVARIANT HOLDS: no slot carries more than one LIVE row — "one slot holds one answer" is true today

⭐⭐⭐ THE CANARY — `sotera | lesson`, 18 rows / 18 DISTINCT propositions / 18 NULL values / ⛔ 0 slots.
  ⛔⛔ PRESERVED BY RULING AND GUARDED in `evidence-baseline-check.mjs` §8, which FAILS BOTH WAYS:
     if the evidence is DESTROYED, and if the key becomes ARMED (a slot OR an alias under that key).
  ⭐ It carries TWO boundaries at once: `membership ≠ proposition` AND `value ≠ proposition`.
  ⚠️ UNARMED for the reconcile path · ⚠️ ALREADY LIVE for forget/revive (P15's phrase fallback needs no slot).

✅⚠️ **RESOLVED IN PRACTICE, ROOT CAUSE STILL OPEN (2026-09-17) —
   `ISSUE_SOTERA_CHAT_EMPTY_TURNS_TTFT.md`. ⛔ NOTHING WAS CHANGED OR RESTARTED — the pass only READ.**
   ⭐⭐⭐ OTE'S REPRODUCTION, AND THE DATA MATCHES IT EXACTLY: *"the problem happen when i attach image and
      message via my phone and i close the phone and continue chat on my pc."*
      07:30:23 user img=1 (THE PHONE) → 07:32:34 assistant EMPTY `client_disconnect` (phone closed) →
      07:32:22 "test" on the PC → 07:32:41–56 GETs on BOTH conversations (switching chats) →
      07:32:56 assistant EMPTY `client_disconnect` (the switch killed it) → 07:43/07:44 ✅ fine.
      ⇒ ⭐ TWO DIFFERENT CLIENTS DISCONNECTED FOR TWO DIFFERENT REASONS. ⛔ THE SERVER FAILED NEITHER TIME.
      ⇒ ⛔ THE RECOVERY WAS NOT A FIX — the disconnecting client simply went away.
   ⚠️ ⭐ AND HIS IMAGE WAS NEVER ANSWERED: the 07:30:23 turn carries `img=1` and has ⛔ NO assistant reply —
      the reply died with the phone. The photo sits unanswered in that conversation's history.
   ⭐⭐⭐ **A MEASUREMENT THAT SHIFTED THE DIAGNOSIS:** promptTokens 16 999 → ttft 16.5s · 35 699 → 18.7s.
      ⇒ **2.1× THE TOKENS FOR 1.13× THE TIME** ⇒ ⛔ TTFT IS **NOT** PROPORTIONAL TO PROMPT SIZE; there is a
      **FIXED ~14–15s PER-TURN COST**. ⚠️ That is the signature of SOMETHING ELSE USING THE GPU BETWEEN
      TURNS — `qwen3-embedding:4b` runs for recall every turn and IS loaded alongside the chat model.
      ⭐ The codebase already names this hazard (`memory-distill-host.js`: *"GPU-placed aux model evicts
      the chat model (~29s reload on the user's next turn)"*, why the distiller runs `numGpu: 0`).
      ⛔ STILL NOT CONFIRMED — this is the thing to investigate when we come back.
   ⚠️ THE UI STILL LIES: 043 correctly gives a disconnect `error=NULL`, but the chat UI has ⛔ NO BRANCH for
      `empty_turn_cause` ⇒ it shows *"(no response — the model returned nothing)"*, which is FALSE.
   ⭐ MEASURED AND RULED OUT: Ollama's prefix cache is FINE — same 12 023-token prompt cold 3.71s ·
      identical repeat **0.07s** · different tail sharing the prefix **0.34s**. ⛔ Also not the Context
      Composer (explicitly cache-aware) and ⛔ not `numCtx` (stable per model).

⭐ THE DECISION-ARC INSTRUMENTS — all READ-ONLY, all green, ⛔ none writes:
  slot-behaviour-census · replacement-semantics-census · replacement-relation-census · m2-047-scope-check
  routing-act-scope-check · slot-authority-map · membership-semantics-census · membership-consequence-census
  competition-membership-census · competition-predicate-trace · competition-unit-trace
  state-transition-semantics · transition-event-trace · nine-transition-semantic-analysis
  incumbent-status-change-trace · invalid-at-claim-trace · memory-semantics-batch · semantic-seam-batch
  ⭐ current-holder-authority-census (⑧ — 21 checks, incl. a POSITIVE CONTROL for the never-emitted scan)
  ⭐ positive-authority-trace (⑧-A — 16 checks; the 13 candidates × 5 dimensions, every term QUOTED)
  ⭐ displaced-status-trace (④ — 13 checks) · ⭐⭐ **admission-controls-check (A/B/D/E — THE BUILD'S OWN
     PROOF: DEFER coexists · ADMIT competes · per-pair verdicts in ONE write · `forModel` SILENT ·
     ⭐⭐⭐ ADMIT → REPLACEMENT_REFUSED PROVED REACHABLE via a REBIND)**
  ⭐ displaced-status-trace (④ — 13 checks; the six writers in their OWN WORDS, + a positive control)
```

**BUILT THIS ARC:** the four provenance axes + audited backfill · D1(b) → **Phase 3 refusal** · the attribution
detector + 3 corpora + **the live instrument (050)** · D6/D7/D8/D9 · **A3 (051) · A2 · A1 shadow · B1/B2/B-D2 ·
B-D4 (052)** · the **evidence-baseline guardrail** (destruction-detecting, falsified before trusted).

---

## ⭐⭐⭐⭐ THE REPO FACT THAT COST ME A WRONG CONCLUSION — ⛔ READ BEFORE ANY `git stash` HERE

```
C:\data\AI_LLMv2                    ⛔ NOT a git repo
C:\data\AI_LLMv2\PortableComponents  ⛔ NOT a git repo
⭐ PortableComponents\Packages\Memory  ✅ IS its own repo — branch `main`, ⛔ NO REMOTE (local only)
   Personas\Sotera                    ✅ repo, pushed to origin/main
   Reference                          ✅ repo, branch `master`, ⛔ no remote
```

⚠️⚠️ **I stashed `Personas/Sotera` to test "pre-change" behaviour and the `PortableComponents` stash silently
did NOTHING** — so the service kept my edit while the host lost its port, which IS the failure mode. ⇒ I
reported three regressions as "pre-existing". ⛔ **THEY WERE MINE.** ⭐ A change to `@ote/memory` must be
committed IN ITS OWN REPO, and any before/after comparison must revert THAT file explicitly.

# 0-D · ⛔⛔ FENCES

```
⛔ NEVER test on Ote's account — agent_dev only.          ⛔ :8201 is HIS; :8210 restart is now permitted.
⛔ No historical row repair · no provenance inference · no ranking/salience change.
⛔ ATTRIBUTION: detector advisory, never a gate · never reword ATTRIBUTION_PRINCIPLE · a candidate is not a
   violation until OTE confirms · ⛔ do not touch the 22 scans or the 4 unreviewed candidates.
⛔ A1 has NO AUTHORITY and is STRUCTURALLY BLOCKED ON A-D4 — "not the same slot" falls through to MINT NEW,
   so authority-while-A-D4-is-open would decide `broader → new slot` BY DEFAULT.
⛔ The two ARMED collisions and the 8 existing aliases stay EXACTLY as they are. A-D6: audited unknown.
⛔ Dreaming: no switch change · `dryRun` untouched · no M1 change · M2 reasoner not commissioned.
⛔ `memory-contradiction.js` stays UNWIRED — its rule needs the memory to exist when the correction was made,
   and in the shelter case the row was written 2.8s AFTER the correction. ⇒ wiring it would NOT have helped.
⛔ Keep the Mira + shelter fixtures. ⛔ Keep the two `.bak` files UNTRACKED in @ote/memory.
⛔ Do NOT change the `remember_fact` tool description or the extractor prompt — model steering AND a
   behaviour change. The finding is recorded; the fix is not authorised.
⛔ No cleanup merely because a tree would look nicer.
```

---

# 0-E · ⏸ OPEN — all Ote's, none blocking

```
✅✅✅ THE ADMISSION ARC IS CLOSED AND ITS BUILD IS ACCEPTED. ⛔ Nothing below is a blocker.
⭐⭐⭐ THE FIVE CARRIED-FORWARD ITEMS ARE IN §0-A ⓪ — ⛔ read them there, ⛔ especially "LEAVE THE THREE
   RED CHECKS ALONE".
⏸ AND THE ARC-LEVEL WORK THAT WAS PARKED BEHIND IT IS NOW GENUINELY NEXT, if Ote wants it:
   A1 AUTHORITY (⑦'s ruling frees it) · B-D1 the projection radius · B-D3 `attestedBySource` ·
   Dreaming / the M-series · and ⑨ (arena synthesis).
⛔ THE RULINGS BELOW ARE HISTORY, KEPT BECAUSE THEY BIND ANY FUTURE WORK — ⛔ not because they are open.
   ① ✅ RULED 2026-09-17 —
        `DECISION_SOTERA_01_INCUMBENT_RELATIONSHIP.md`. Ote's reframe: *"when two durable observations
        interact and the incumbent ceases to be the current holder, what semantic RELATIONSHIP, IF ANY,
        must be established between them?"* ⛔ RELATIONSHIP and CONSEQUENCE held strictly apart, and
        ⛔ the consequence is NOT admitted as evidence for the relationship.
        ⇒ ⭐ **INHERENTLY MULTIPLE — because THE RELATA DIFFER**, ⛔ not because the cases varied.
        ⭐ "IF ANY" IS LOAD-BEARING TWICE: #8/#9 = ⛔ NO relation exists · #3 = ⚠️ the record CANNOT
        ESTABLISH one — ⛔ and those are NOT the same outcome.
        ⭐ Common across them is ⛔ NOT a relationship but an OCCASION (a pair brought into contact, the
        system required to act BEFORE the relationship was established).
        ⇒ EXCLUDES interpretation 1 as a RELATIONSHIP model · ⛔ does NOT select among 2, 3, 4.
   ⑧ ✅ RULED NARROW — ⭐ ATTRIBUTION IS NOT AUTHORIZATION. ⛔ Neither writer identity nor routing
        similarity is sufficient authority.
   ⑧-A ✅ RULED NARROW — authority is established through BOUNDED, CHECKABLE, ANSWERABLE facts, and
        REFUSAL IS PRESERVED where it is not established. Delegation is legitimate ONLY where the fact is
        true by the holder's MECHANISM, the grant is NARROW and REGISTRY-HELD, and it is REFUSED OUTSIDE
        ITS BOUNDARY. (§0-B ㊾) ⚠️ ⛔ "authority tracks origin of material" is NARROWED — a finding of the
        examined mechanisms, ⛔ NOT a universal law.
   ㊿ ⭐⭐ ABSTENTION ≠ DEFER — LOCKED. #8/#9 = nothing to authorize ⇒ ABSTAIN · #3 = the record does not
        establish what to act on ⇒ DEFER. ⛔ NEVER collapse them.
   ④-A ✅ RULED NARROW (§0-B 51) — ⭐ THE TRANSITION ESTABLISHES **ONE** CLAIM AND ITS SUBJECT IS THE
        SYSTEM: *"the system has adopted a new disposition about which of these it will present."*
        ⛔ About the incoming, the incumbent, the world, the question and the relation — NOTHING.
        ⚠️⚠️ SAY "the ESTABLISHED SEMANTIC CONTENT is consequence-side" — ⛔ NEVER "the act is entirely
        consequence-side", which erases the PRESUPPOSITION and the INTERPRETATION RESIDUE.
   ④  ✅ RULED (§0-B 52) — ⛔ the three statuses are evidence about W3/W4/W5 INDIVIDUALLY, ⛔ NOT a
        taxonomy, ⛔ and NOT to become a universal status vocabulary. ⛔ NOT started from the field. ⭐ THREE writers establish a
        positive status (W3 a name's use · W4 a record's content was used · W5 a declared relation),
        THREE establish nothing (W1 · W2 · W6), and ⭐⭐⭐ **ZERO of six establish a proposition-truth
        claim** — measured against a positive control. ⭐⭐ The three that establish are EXACTLY the three
        with a warrant ⑧-A would accept.
      ⏸ The original framing, kept because it is what was investigated:
        ⛔ NO LONGER "what may `resolveConflict` do?"
        *"What semantic authority must a component possess before it may cause an incumbent to cease being
        the current holder, when the relationship is (a) ESTABLISHED, (b) ABSENT, or (c) NOT ESTABLISHABLE
        from available evidence?"* ⇒ WHAT MUST BE ESTABLISHED, **AND BY WHOM**.
        ⏸ INVESTIGATION DELIVERED 2026-09-17 (§0-B ㊽) — ⛔ NO RULING PROPOSED, ⛔ no interpretations listed.
        ⛔⛔ FENCE: `invalid_at` · `supersedes_id` · `slot_id` · row state · reversibility · recency ·
        resolver behaviour are ⛔ NOT admissible as evidence of semantic authority.
   ⑨ ⏸ NAMED, NOT OPENED — may an arena be SYNTHESISED for a family with no established slot semantics?
        ⚠️ ⑦ and ② both bear on it; ⛔ NEITHER ANSWERS IT.
   ⏸ ALSO STILL OPEN: ④'s POSITIVE definition (deliberately) · ⑥'s TAXONOMY (deliberately).
   ⛔ THE FALSE-NEGATIVE DIRECTION REMAINS **NOT ESTABLISHED** — over-inclusion is demonstrated;
     under-inclusion has no ground truth to measure against. ⛔ Never report it as "none exists".
   → `ADR_SOTERA_MEMORY_SEMANTIC_DECISIONS.md` §"What the rulings expose"

   ⭐⭐⭐⭐ THE LOCKED CONVERGENCE (§0-B 53) — ⛔ CITE THIS, it now does most of the work:
        **An act with no established warrant establishes NOTHING beyond whatever its own already-established
        disposition constitutes; an act WITH a warrant establishes ONLY what that warrant covers.**
   A-D5 ⏸ INVESTIGATED (§0-B 55) — ⭐⭐⭐ **A WARRANT EXISTS FOR THE EXCLUSIVITY *ACT*; ⛔ NONE FOR THE
        EXCLUSIVITY *SET*.** `governsReplacement` meets ⑧-A on every axis (⭐ true by PLACEMENT, PURE, exact
        match, both sides DECLARED, fails closed, refusal leaves the world as it found it) — ⛔ but its
        entire reach is ONE OPERATOR SLOT (35 pins · 66 gateable replacements, all `build tag for this
        cycle`; ZERO user beliefs) and it authorizes the REPLACEMENT, ⛔ not the MEMBERSHIP.
        ⭐ The Identity Resolver's ask is the only OBSERVATION-TO-OBSERVATION authorization; ⛔ one family.
        ⭐⭐ ENFORCEMENT ≠ WARRANT. ⭐ ABSTENTION ≠ DEFER is already the ratified design at that seam.
   A-D4 ✅ DELIVERED (§0-B 54) — ⭐ ONLY `entity` establishes anything (IDENTITY, derived by the runtime),
        and it establishes WHOSE, ⛔ never WHICH QUESTION. ⭐⭐⭐ **CURRENT-STATE EXCLUSIVITY IS ESTABLISHED BY
        NO STEP — and exclusivity is the only thing competition does.** ⇒ admission does not need a relation
        to GROUP; it needs one for the grouping to be EXCLUSIVE. ⭐ ABSTENTION exists at admission
        (`unknown` ⇒ no competition); ⛔ DEFER does not.

⏸ PARKED BY THE DECISION ARC (all of these wait on ① → ⑧):
   A-D4 · A1 authority · B-D1 (radius) · B-D3 (may `incomplete` claim `attestedBySource`?) · Dreaming/M-series

⭐⭐⭐ REPLACEMENT SEMANTICS — ⛔ SUPERSEDED AS "the current blocker" by the ① → ⑧ path above, but the
       framing below is still the correct statement of the question (Ote, 2026-09-17, his words)
       Question: what semantic relationship exists between successive observations that currently appear
                 as "superseded"?
       Blocks:   ⛔ A-D4 broader-slot behaviour (⛔ ALSO BLOCKED ON 047 SCOPE — see §0-B ㉑) · ⛔ the interpretation of Slot identity / current value /
                 history · ⛔ the future Dreaming treatment of change
       ⛔ NO IMPLEMENTATION CHANGES.
       ⭐ EVIDENCE IN (`replacement-relation-census.mjs`): ⭐⭐⭐ THE RELATION WAS NEVER RECORDED — 1 of 9
       transitions is establishable from the record, and that one is the `operator` repair where a HUMAN set
       `contradicted_at`. ⚠️ `writer`/`act_kind`/`reach_kind` CANNOT help — identical provenance produced a
       RE-STATEMENT and a WRONG-SLOT. `supersedes_id` names WHICH row, ⛔ never IN WHAT SENSE.
       ⭐⭐ BUT BOTH SOURCE TURNS ARE REACHABLE 9 OF 9 ⇒ ⭐ THE SUBSTRATE IS **UNCLASSIFIED, ⛔ NOT LOSSY** —
       a materially different and more tractable problem. ⛔ And no cleverness over the stored columns can
       recover it: the answer is in the conversation, ⛔ not in the row.
       ⭐⭐ DOES THE ONTOLOGY NEED >1 RELATION? YES — ⭐ at least THREE FATES: still-true-and-better ·
       true-but-past · false. ⛔ ONE `invalid_at` EXPRESSES ALL THREE IDENTICALLY.
       ⚠️⚠️ AND THE AXIS IS NOT THE LESSON VOCABULARY'S: lesson-host asks *how does the NEW understanding
       relate?*; the evidence asks *what becomes of the OLD observation?* ⇒ ⛔ DO NOT ADOPT
       `refines/coexists_with/qualifies` BY DEFAULT — Ote's `?` was right, and they answer a different axis.
       → `INVESTIGATION_SOTERA_REPLACEMENT_RELATION_AND_SLOT_MODEL.md`
SLOT/OBS ⭐⭐⭐ THE GATE BEFORE THE GATE (Ote, 2026-09-17): *"Before A-D4, let's understand the slot/observation
       semantic boundary."* ⇒ A-D4 asks what it should MEAN to bind two phrasings into one slot, and that is
       unanswerable while *what a slot is FOR* is open:
         slot = A CURRENT ANSWER      ⇒ binding merges two questions into one answer  → must be rare + strict
         slot = AN ACCUMULATING RECORD ⇒ binding relates two observations              → cheap + reversible
       ⛔ Those imply OPPOSITE rulings on `broader`; deciding A-D4 first would silently pick one.
       ⭐ Evidence is IN (`slot-behaviour-census.mjs`, read-only): in 38 days the slot's defining act —
       replacing the answer because the world changed — fired ONCE, and that once is the Mira fixture Ote
       authored to test it. Of 7 supersessions: 1 fixture · 1 `operator` repair · 4 RE-STATEMENTS · 1 the
       known A defect. ⇒ in ORGANIC traffic, ZERO.
       ⚠️ ⛔ THAT IS NOT "SLOTS ARE WRONG". 38 days is short and stability is what a property slot is FOR.
       ⭐ The defensible claim is narrower: **we have no evidence the slot model is doing the work it was
       built to do, and the one instrument that would tell us cannot tell a CHANGED ANSWER from a REWORDED
       one** — `reconcilePlan` supersedes on `norm(a) !== norm(b)`, pure string inequality.
       ✅ FOLLOW-UP DONE (Ote asked 09-17): the 9 replacement events CLASSIFIED against his taxonomy, and the
       structural question ANSWERED — the substrate is **identity + latest arrival**, ⛔ not identity +
       current + history. 4 semantic classes share ONE recorded state. See §0-B ⑲ for the whole finding.
       ⭐⭐ And the vocabulary he wants is ALREADY BUILT on the lesson path, by his own decision 4.
       ⏸ ⛔ NOTHING AUTHORISED. Ote has the ruling. Two calls flagged FOR HIM:
         ③ `"sharp edge over comfort"` → `"friction over agreement"` — ⚠️ CONTESTED, the record cannot settle it
         ④ `soteras_family_lineage…` — MIXED: one proposition restated, one elaborated, one CHANGED
           (Claude: brother → uncle), in a single value. ⚠️ I first called it a re-statement FROM A 100-CHAR
           TRUNCATION; the full value inverted it.
       → `CONTEXT_SOTERA_SLOT_VS_OBSERVATION_BOUNDARY.md` · `INVESTIGATION_SOTERA_REPLACEMENT_SEMANTICS.md`
A-D4   ⭐⭐⭐ Durable behaviour for `broader` / `narrower` / `sibling`. ⛔ OPEN · BLOCKED ON THREE THINGS
       (Ote, 2026-09-17): ① REPLACEMENT SEMANTICS · ② COMPETITION-MEMBERSHIP SEMANTICS · ③ the unresolved
       relationship between ROUTING and 047. ⛔ HELD BEHIND SLOT/OBS ABOVE.
       ⚠️ A1's measurement made it HARDER, not easier: `broader` is NOT always an error, so "broader → mint a
       new slot" would fragment `programming_language` into a FOURTH sibling of three that already exist.
       ⇒ A1 authority is blocked on this. Shadow is safe precisely because it cannot decide it.
A1     shadow + ACCUMULATE. Next: read `memory.resolver.ontology_*` telemetry on real traffic.
B-D1   the radius. MEASURED, ⛔ NOT DECIDED — unchanged at ±4. Reach to the conversation's opening statement:
       ±4=63% · ±6=83% · ±8=85% · ±12=96%. ⭐⭐ COST IS NOT THE CONSTRAINT (±12 ≈ 3.2k of ~99k tokens) ⇒ this
       is a purely COGNITIVE question: *what must she be able to move through and see?*
B-D3   may an `incomplete` projection still claim `BASIS.attestedBySource`? ⛔ LATTICE UNTOUCHED.
UNKNOWN ✅ INVESTIGATION COMPLETE (Ote ratified 2026-09-17). ⛔ NO FIX AUTHORISED — and ⛔ do NOT clean up
       the analyser's own dishonest reasons either: *"Keep recording them until we finish establishing the
       instrument contract."* 4 malformed coordinations · 19 legitimate observations in a property-shaped
       slot · 0 ontology questions. Writers: `chat-tool` 42.3% · `reflection` 33.3% · `extractor` **3.7%**.
       ⛔⛔ THE CAVEAT THAT MUST TRAVEL WITH ANY CITATION: `"response to thank you"` / `"response to
       appreciation"` is ⛔ NOT evidence that better naming would fix the merge — *"It only proves that
       better naming would allow the ontology to CONSIDER the pair. The ontology could still correctly
       classify them as `sibling`."* ⇒ better naming buys THE QUESTION, never automatically THE MERGE.
       ⏸ It handed us the SLOT/OBS gate above.
DREAMING 5 decisions (`PLAN_SOTERA_DREAMING_PATH_AND_COGNITIVE_E2E.md` §6): ① WHICH Dreaming ② may it write
       ③ commission M2 or defer ④ milestone scope ⑤ D10 + prefill separate. ⭐ Recommendation: DEFER.
NAVIGATION design-only. `inspect → follow → compare`. ⛔ Nothing below "there is more" exists or is authorised;
       ⛔ a future session must NOT "optimise away" the elision marker — it is the load-bearing part.
D10    what makes an option SALIENT inside her deciding. ⛔ Research, not a code change.
ATTRIBUTION the READING only: `node test/checks/attribution-live-check.mjs` → `--id <uuid>` →
       `attribution-confirm.mjs <id> <CLASS> --by ote`. ⛔ Nothing is a violation until he does it.
PERF   prefill / TTFT — `INVESTIGATION_SOTERA_PREFILL_PREFIX_CACHE.md` (HIS lane). Nothing done.
LANGUAGE should a standing user language PREFERENCE override the reply-language rule?
M2     the deferred governance-READ decision (couples to ⓔ). Not urgent.
⚠️ SECURITY, FYI: `Reference/docs/SECURITY_CASE_*` is committed and marked "never share"; it is safe only
   because that repo has NO REMOTE. A convention, not a mechanism. And `:8210` stderr carries a standing
   advisory that `auth.root.password` is weak while root is network-reachable.
```

---

# 0-F · ⭐⭐⭐ THE LESSONS THIS ARC PAID FOR — read before writing any proof

```
⭐⭐⭐⭐ A BEFORE/AFTER COMPARISON IS ONLY VALID IF THE REVERT ACTUALLY REVERTED. I `git stash`-ed
      `Personas/Sotera` to test "pre-change" behaviour; `PortableComponents` IS NOT A GIT REPO, so that
      stash silently did NOTHING and the half that mattered stayed changed. ⇒ I reported three of MY OWN
      regressions as "pre-existing". ⛔ VERIFY THE REVERT LANDED (diff it) before trusting the comparison —
      a silent no-op looks exactly like a clean control. ⓘ `@ote/memory` is its OWN repo; see §0-C.
⭐⭐⭐ A CONTROL'S FIXTURES MUST NOT COLLIDE IN THE MECHANISM UNDER TEST. My "genuinely NEW" baseline came
      back with SIX candidates — the resolver's COSINE arm had grouped the check's own `zz_adm*` names —
      so the baseline was itself a DEFER and the comparison was between two deferrals. ⇒ write the
      isolated case FIRST, before any other fixture exists, and ASSERT its isolation.
⭐⭐ AN EARLY RETURN IS A SECOND CODE PATH AND NEEDS THE SAME FIELDS. `admitCandidates`' no-candidate
      branch omitted the summary, which would have re-created the exact NEW-vs-DEFER indistinguishability
      the field was added to remove. ⭐ Caught only because a control asserted the ZERO case explicitly.
⭐⭐ ASSERT ONLY WHAT YOUR CHECK OWNS. Mine asserted "the admission ledger is EMPTY" — a GLOBAL property
      it does not own, which goes red on someone else's teardown. ⇒ scope the assertion to its own act.
⭐⭐⭐ MEASURE THE THING THAT EXISTS BEFORE DERIVING ITS REPLACEMENT. I wrote a detector and a second
      gate for ④; the shipped rule already solved it AND was better. Both were deleted.
⭐⭐⭐ A "nothing changed" assertion is the one that PASSES WHEN THE INSTRUMENT IS BROKEN ⇒ positive
      control FIRST, and it must cross the PERSISTENCE boundary.
⭐⭐⭐ A GREEN CAN BE STRUCTURAL: operator labels can never equal message UUIDs, so the occasion rule
      would have passed 100% and proved nothing. CONSTRUCT THE ATTACK before taking credit.
⭐⭐  A DATE IS A LOCAL FACT. `toISOString()` is UTC; `::date` is the SESSION's zone — and psql and
      Sequelize DISAGREE. Name the zone explicitly or ship an off-by-one day.
      ⚠️ 2026-09-17: I MADE THIS EXACT MISTAKE AGAIN with the lesson already written here. `INDEX.md`
      stamped "Generated 2026-09-16" at 01:12 local on the 17th, because SEAST is UTC+7 and every run
      before 07:00 lost a day. ⇒ ⭐ a rule in a lessons file does not defend code; ⛔ the only defence
      is ONE clock per artefact — and `git log --date=short` was already local, so the file disagreed
      with itself. ⚠️ Also: a `git log` date is EMPTY for an uncommitted doc, and a blank cell reads
      as "undated" rather than "new". Fall back to mtime and MARK IT (`⁺`) — never blend two kinds.
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
