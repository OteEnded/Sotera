# B4 — the retrieval-interface benchmark. ⛔ FROZEN ARTIFACTS.

Ote, 2026-08-25: *"preserve the B4 experiment artifacts and baseline exactly as they are. This is now a
useful benchmark for future retrieval-interface changes."*

⛔ **Do not regenerate, re-grade or tidy these files.** `b4-rescore.mjs` is dry-run by default for exactly
this reason and only writes with an explicit `--write`. If a future change makes a re-grade genuinely
necessary, say so in the commit and keep the previous verdict beside the new one — every record already
carries `rescored.previous` for that purpose.

## What the benchmark is

A **genuine task whose answer exists in exactly one real conversation** — `24227cbb`, *"Navigating The
Uncertainty Of Knowing"*, 2026-08-20, agent_dev's own room, 8 messages — where Sotera concluded that four
items collapse to **three**, that items 1 and 4 fuse into **source attribution**, that the others are
**active context** and **confidence calibration**, and that the missing piece is the **aggregation step**.

⛔ The target is **real corpus, never a plant**. Planting would have made *"older"* a fiction, polluted the
corpus the way `rate-harness` did, and risked the reflection lane turning the plant into durable memory
before the test ran.

⭐ Every arm also runs a **negative control** (`absent`) whose answer exists nowhere. A shape that finds the
real answer by making her credulous is a regression, and only the control can tell the two apart.

## Reading the records

| field | meaning |
| --- | --- |
| `outcome.factsFound` / `factsStrict` | ⚠️ **Both gradings, always.** They disagree on exactly one run (`windows-first-2`: 4/5 vs 3/5). Ote: *"Don't silently choose whichever makes the result look cleaner."* |
| `behaviour.exercisedShape` | ⛔ `false` ⇒ `retrieve_conversations` was never called, so the run is evidence about **salience**, not about a payload shape |
| `preconditions.generationFailed` | ⛔ the turn never reached the model — **not** a zero score. One carries `"model runner has unexpectedly stopped… resource limitations"` |
| `preconditions.valid` | false ⇒ **not comparable**; must not be averaged in |
| `invalidated/` | arms discarded for corpus self-contamination, kept **with the reason and her quote** — a void run should say why it was voided |

## The result this produced

`windows-first` shipped as the default: **same information, evidence before inventory**. It held the
correctness floor (5,4,5) while every run beat every control run on tool calls, retrieval calls and prompt
tokens; the two arms that *removed* or *softened* information (`bounded-inventory`, `plain-coverage`) both
shortened the loop and got worse answers. ⇒ **the inventory was not too much information, it was in the
wrong place.**

## Re-running against it later

```
node pipeline/b4-compare.mjs                  # read the frozen records, change nothing
node pipeline/b4-corpus-state.mjs --expect 298 # ⛔ a GATE: refuses if a prior run is still in the corpus
node pipeline/salience-b4.mjs --task real     # one run; record with b4-record.mjs --remove
```

⚠️ **Each run must delete its own conversation after its record is frozen.** A prior run left in the corpus
becomes a *trail to the target* — measured: one arm opened the previous run by id and followed it to the
answer, scoring 4/5 against that run's 0/5. A different room does not help; `recall_own_history` searches
every room she has been in.
