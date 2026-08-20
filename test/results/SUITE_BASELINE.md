# SUITE BASELINE — the unambiguous green run

Ote, 2026-08-20: *"capture a complete clean suite run to a file, including the previously missed
memory-lifecycle-check, so we have an unambiguous baseline."*

**Baseline run: `2026-08-20 23:58:50` (local). Exit code 0. `unit` + 25 checks, all PASS.**
`109` node:test cases and `790` check assertions, `0` failures.

Reproduce: `cd test && node pipeline/test-all.mjs`
Capture: `node pipeline/test-all.mjs > results/suite-baseline-<stamp>.log 2>&1`

## ⚠️ WHY IT MUST BE REDIRECTED AS A WHOLE RUN

`pipeline/test-all.mjs` spawns each suite with `stdio: 'inherit'`, so a failing check's output goes
straight to the terminal and **is not captured by anything the runner keeps**. That is exactly how the
one flake in this arc got away: `memory-lifecycle-check.mjs` reported FAIL inside a full run, and by the
time it was looked at, the terminal had been tailed past the assertion and the second full run was clean.
⇒ ⛔ Never diagnose a suite failure from the summary block. Redirect the **whole run** to a file.

ⓘ That check is included and green in this baseline, and it has never been seen to fail standalone, nor
when run immediately after its alphabetical predecessor (`memory-author-check`). **The flake is
unexplained, not resolved** — if it recurs, the log will have it this time.

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
| `disclosure-inspect-check` | 28 |
| `disclosure-log-check` | 31 |
| `evidence-authorization-check` | 22 |
| `intention-lifecycle-check` | 83 |
| `interaction-answer-check` | 13 |
| `memory-author-check` | 17 |
| `memory-lifecycle-check` | **12** ← the one that flaked |
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

## Preconditions (a failure here is the environment, not the code)

- Sotera answering on `127.0.0.1:8210` — the runner fails fast if not, and says so
- Postgres on `127.0.0.1:54322`, schema `persona_sotera`
- Ollama on `127.0.0.1:11434` (⛔ Ote's, always-on — never start or stop it)
- `agent_dev` / `agentdev123` exists with the **admin** role. ⛔ Never run the suite as root: root is
  Ote's own account, and test residue has appeared in his own panels before.
