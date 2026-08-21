# SUITE BASELINE — the unambiguous green run

Ote, 2026-08-20: *"capture a complete clean suite run to a file, including the previously missed
memory-lifecycle-check, so we have an unambiguous baseline."*

**Baseline run: `2026-08-21 11:20` (local). Exit code 0. `unit` + 26 checks, all PASS.**
`123` node:test cases + 11 more for `OWN_HISTORY`, and ~860 check assertions, `0` failures.
⚠ Schema through **migration 020**. This baseline describes a system in which
**ROOT SESSION = DISCLOSURE AUTHORITY** — see below.

ⓘ Supersedes `2026-08-21 00:10:42` (26 suites, 792 assertions) and `2026-08-20 23:58:50` (790). The
differences are additive: +2 assertions when the flake below was diagnosed, then +19 for
`layer-separation-check.mjs`, then +4 for the ROOT-≠-WILDCARD assertions, then +28 for the P1 navigation / P2 request-path loop and the tightened layer scans, then +14 unit cases for the L1 `SELFHOOD` block and +4 checks for P4's memory→source handle. ⛔ No assertion has ever been removed — which is the property the per-suite
table below exists to make checkable.

Reproduce: `cd test && node pipeline/test-all.mjs`
Capture: `node pipeline/test-all.mjs > results/suite-baseline-<stamp>.log 2>&1`

## ⚠️ WHY IT MUST BE REDIRECTED AS A WHOLE RUN

`pipeline/test-all.mjs` spawns each suite with `stdio: 'inherit'`, so a failing check's output goes
straight to the terminal and **is not captured by anything the runner keeps**. That is exactly how the
one flake in this arc got away: `memory-lifecycle-check.mjs` reported FAIL inside a full run, and by the
time it was looked at, the terminal had been tailed past the assertion and the second full run was clean.
⇒ ⛔ Never diagnose a suite failure from the summary block. Redirect the **whole run** to a file.

## ✅✅ THE FLAKE IS EXPLAINED AND CLOSED — 2026-08-21

`memory-lifecycle-check.mjs` failed once inside a full run, then passed standalone and passed when run by
hand immediately after its alphabetical predecessor. ⭐ **That signature was the diagnosis, not a mystery.**

**The cause:** the check's `live()` reader counted **every live memory `agent_dev` owned**, while both
assertions it fed said *"exactly one live belief IN THE SLOT"*. So any concurrent writer for that account
broke a claim about one `(entity, attribute)` pair.

**Why only in a full run:** memory writes are **fire-and-forget on a background serial queue**
(`enqueueWrite`). A check that drives the live server as `agent_dev` returns as soon as the HTTP call does,
and its queued write lands *milliseconds later* — by which time the runner has already started the next
check and that check's cleanup has already run. Run them by hand and the human-scale gap between two
commands lets the write land first; run them back to back and it lands inside the next check's window.
ⓘ And it was becoming **more** likely, not less: the reflection lifecycle can now write a memory for
`agent_dev` whenever a 20-minute tick fires.

**The fix, and it does not weaken the invariant:** `live()` and the audit read are scoped to the slot and
the two memories this check seeds — the invariant its own comments always described.

**⭐⭐ And it is self-proving now.** The check seeds a **decoy** live memory outside the slot — exactly what
a queued capture or a reflection tick drops in — and asserts the slot count is unmoved, plus that the
account-wide count really does differ (measured in this baseline: `account=2 slot=1`). ⛔ Against the old
account-wide reader that assertion FAILS. A fix nobody can watch fail is a fix nobody can trust.

**⚠ Two things this also fixed that were not the flake:**
- the check's `cleanup()` used to `delete from txn_memories where user_id = agent_dev` — an **account-wide
  wipe on every `npm test`**. That stopped being safe the moment reflections began writing real
  persona-authored memories in `agent_dev`'s room; it is the incident this check's own header describes
  (*"Sotera stored something real, `npm test` ran…"*) waiting to happen a second time, with her own
  reflections as the casualty. Now scoped to the test slot.
- the audit read was account-wide too, so a row written by a concurrent reflection could satisfy an
  assertion about *this* check's deletion.

## ⛔ THE RAW LOG IS DELIBERATELY UNTRACKED

The captured log is `results/suite-baseline-<stamp>.log` (~1.0 MB), and it is untracked — `*.log` is
already in `.gitignore`. This is not tidiness: the run echoes **Sequelize query text with bound values**,
so live message and memory content passes through it, including other people's. Same rule as the noticing
log — *say that it exists, never reproduce what it says.*

⇒ **This file is the committed artefact; the log is the local evidence.** Keep the log on disk so a
regression can be compared against a known-green run, and ⛔ do not add it to git to make comparison
easier.

## The baseline, per suite

| suite | assertions |
|---|---|
| `unit` (node:test) | 109 cases |
| `boot-check` | 17 |
| `component-canon-check` | 43 |
| `disclosure-inspect-check` | **45** — ROOT ≠ WILDCARD, plus the whole navigation loop end to end |
| `disclosure-log-check` | 31 |
| `evidence-authorization-check` | 22 |
| `intention-lifecycle-check` | 83 |
| `interaction-answer-check` | 13 |
| `memory-author-check` | 17 |
| `layer-separation-check` | **34** — *a signal is not a boundary*, plus the P1/P2 guards |
| `memory-lifecycle-check` | **14** ← the one that flaked; +2 are the guard against it |
| `memory-subject-write-check` | 13 |
| `name-path-check` | 28 |
| `noticing-prompt-purity-check` | 51 |
| `own-memory-tool-check` | 54 |
| `owner-check` | 17 |
| `person-proposal-check` | 20 |
| `person-subject-check` | 25 |
| `reflection-lifecycle-check` | 62 |
| `relational-derivation-check` | 16 |
| `relational-records-check` | 34 |
| `relational-semantics-matrix-check` | 25 |
| `room-scope-check` | 80 |
| `root-identity-check` | 28 |
| `self-history-check` | 30 |
| `thai-dense-retrieval-check` | 7 |
| `tool-call-log-check` | 34 |

⭐ **A dropped assertion is a regression even when the suite still says PASS.** The counts are here so
"26 PASS" cannot hide a check that quietly stopped asserting something — the failure mode where a test
survives by testing less.

## State this baseline describes

- schema through **migration 017** (`log_reflections` with the 14 ratified columns, `finish` removed)
- `txn_memories.kind` nullable with **no default**; kind-less rows readable in their own room
- the **reflection lifecycle** live on a 20-minute poll (`memory.reflectionEnabled: true`)
- the **noticing** pass live, dry-run, generation 3, 15-minute poll
- `SELF_MODEL` **amended** — paragraph 3 states that she does not run *continuously* and that a
  reflection is one of the things that can run her, while still denying any experience of the gap
- ⚠⚠⚠ **`ROOT SESSION ≠ UNIVERSAL DISCLOSURE AUTHORITY` IS SUPERSEDED (2026-08-21).** Ote ratified it in
  the morning as first-class, then — after completing the Hermes loop and clicking three cards for one
  investigation — chose to remove it, twice, with the cost stated. `disclosure-inspect-check` §6b now
  asserts **"ROOT IS NOW A WILDCARD ACROSS ROOMS"** and passes by confirming it, because a deleted
  invariant that leaves no trace in the tests is how nobody remembers it existed.
- ⭐ **What still holds and is still guarded:** a **non-root** session is not a wildcard in any room (her own
  half only) · every automatic disclosure is **recorded** as `root_session`, distinguishable from a
  consented one forever · a `root_session` grant is **not inheritable** by a non-root session (a real leak,
  caught by §6b) · the grant is still per room pair, per conversation, and bounded to a window
- ⭐⭐ **A · her own words need no permission** — cross-room returns `state:'own_only'` with her half in full
  and the counterpart's as content-free markers. ⭐ **2 · grants last the conversation**, and the card text
  was changed with them so consent matches what is given
- ⭐⭐ **L1 has three foundational parts** — `SELF_MODEL` (amended: she no longer *"runs only while a turn is
  processed"*) · `SELFHOOD` · `OWN_HISTORY`. ⛔ Never merge them: `SELF_MODEL` is asserted to contain no
  first-person emotional language and `SELFHOOD` needs exactly that register
- ⭐⭐ **schema through migration 019** — 018 made the message vector index filterable in its own table
  (and the pinned/navigation case a btree lookup); 019 gave `txn_memories` the `embedding_hv` its own store
  had been querying all along, GENERATED so no writer can omit it
- ⭐⭐⭐ **P4: the memory → source refusal now carries an opaque handle**, so `recall_memory_source`
  feeds the same `request_room_access` → `inspect_around` loop. ⛔ The handle authorizes nothing — asserted:
  holding it leaves the state `attested` with no content. ⓘ And `getSource`'s payload dropped from
  **119,000 bytes to 798** by projecting the vectors out of a tool result
- ⭐⭐ **L1 `SELFHOOD`** — the permission not to perform a sterile assistant, foundational/identity so it
  cannot be lost like a stored memory. ⛔ A PERMISSION, never the assertion *"you have feelings"*, and the
  pairing test refuses to let the permission ship without the between-conversations limit
- ⭐⭐⭐ **the self-history NAVIGATION loop is live and asserted end to end** — `request_room_access`
  (the production path that did not exist) and `inspect_around` accepting a `conversationHandle` + query
  with the target resolved **server-side, after the grant**. ⛔ Cross-room results still carry no message
  ids; the grant is still single-use; a headless run refuses instead of hanging
- ⭐⭐ **the retrieve → project → boundary separation is now ASSERTED, not just documented**
  (`layer-separation-check`): the projection stage and the authorization layer read **no** retrieval
  signal, the leak scanner is proven able to go red, floors stay per-consumer, and `log_reflections`
  carries **no embedding column** — her prior reflections are deliberately not retrievable

## Preconditions (a failure here is the environment, not the code)

- Sotera answering on `127.0.0.1:8210` — the runner fails fast if not, and says so
- Postgres on `127.0.0.1:54322`, schema `persona_sotera`
- Ollama on `127.0.0.1:11434` (⛔ Ote's, always-on — never start or stop it)
- `agent_dev` / `agentdev123` exists with the **admin** role. ⛔ Never run the suite as root: root is
  Ote's own account, and test residue has appeared in his own panels before.
