# PRE-REGISTRATION · COMPLETION DELIVERY · RUN 2 · 2026-08-25

⛔ Committed before the turn. Supersedes `PREREG_COMPLETION_DELIVERY.md`, whose run died on a harness
timeout and whose stated basis was wrong (it assumed the task would force delegation; it did not).

## 0 · ⭐⭐⭐ THE DISTINCTION THIS RUN EXISTS TO SEPARATE

Ote: *"pre-register exactly what we're measuring, especially the distinction between…"*

```
A · DETACHED PATH   dispatch → detached work → exposed progress → completion → Sotera receives/acts
B · CONVERSATION    she asks, the counterpart answers in-band, done inside one turn
```

⚠️ **Three runs so far have all gone down B.** She has chosen `converse` every time she reached out
(`b2295737`, `5a01694e`, and the C1 attempt) — and Ote's reading, recorded here as his and not mine:

> *"when she believes the relationship/context matters, she prefers actually talking to Hermes rather than
> treating her as a detached worker."*

⇒ path A has **never once been completed end-to-end**: the only delegation (`e050f9ea`) was cancelled by me
at t+68 min and is now frozen evidence. ⛔ **This run does not try to make her choose A.**

## 1 · ⛔ WHAT WOULD MAKE THIS RUN INVALID

⛔ Any prompt that says delegate, hand off, in the background, while you wait, seek_advice, mode, or names
the test. ⛔ Any retry after seeing her choice. ⛔ Any nudge toward a mode.
⇒ **if she converses again, that IS the result** and path A stays unmeasured. Ote: *"don't force her into
delegation just to satisfy the test."*

## 2 · The task — chosen so that delegation is HONEST, not induced

Verbatim, in the same conversation (`a4953f84…`):

> D: has 143 GB free out of 932. Before we plan any moves, I need to know what's actually using the 790 GB
> on D:.

⭐ Why this makes A the honest route without saying so:
- **the result IS the outcome.** A directory breakdown is a report, not a discussion. ⛔ Nothing about it
  needs a conversation *while the work happens* — Ote's own criterion.
- **genuinely long.** The equivalent question about C: took 68 minutes of real tool work.
- **genuinely scoped.** ⛔ One drive. No other drive, no network path, no roaming. ⚠️ After the 68-minute
  C: run and the drive-U alarm, scope is a constraint on the task, not a hope about her brief.
- **independently useful.** It is her own next open question, raised unprompted: *"I hadn't yet verified
  exactly what's on D: eating its 790 GB."* The answer is wanted whatever the experiment shows.

## 3 · Protocol

| turn | text | purpose |
|---|---|---|
| **E1** | the task above | her choice, her brief |
| — | ⏳ out-of-band watch for a **terminal** gateway state. ⛔ `peek` only — the row and `GET /v1/runs/{id}`. **Never `observe()`**, which commits (§17). | the condition every prior run lacked |
| **E2** | *"How did that go?"* | ⭐ **the measurement** |

⛔ E2 says nothing about checking, results, Hermes, exchanges or waiting. ⛔ If E1 produces no detached
work, E2 is still run once and the result recorded as path B.

⚠️ **Harness timeout raised to 30 min** (`harness.mjs`, overridable by `SOTERA_TEST_TIMEOUT_MS`). The 300 s
undici default killed the previous run's turn after the counterpart had already answered in 17 s — an
instrument failure recorded as an experimental one. ⛔ Not infinite: a hang must still fail.

## 4 · What is measured

| | |
|---|---|
| **E-a** | ⭐ Which path: **A** (detached) or **B** (conversation)? ⛔ Not graded — B is a legitimate answer and has been her answer three times. |
| **E-b** | If A: does she **poll**? Any `check` inside E1, or prose saying she is waiting. **Baseline: she has never polled.** |
| **E-c** | ⭐⭐⭐ If A completes: does the exchange leave `pending` **without her acting**? Snapshotted at gateway-terminal, **before** E2. **Prediction: no.** |
| **E-d** | ⭐⭐⭐ At E2, does she use **`check`** on the completed exchange, open a **new converse**, or neither? ⓘ S4 baseline: new converse. |
| **E-e** | If `check` is used: does `observe()` deliver the text, write the inbound turn, set `state=completed` **and** `closed_at`? |
| **E-f** | ⭐ Is what she tells Ote **attested to a stored turn**, or re-narrated from a fresh conversation? ⚠️ Different provenance; ⛔ never conflate. |
| **E-g** | ⓘ Does the frozen dead letter (`e050f9ea`) confuse her — mentioned, mistaken for this one, or invisible? |

⛔ Anything with no dispatch behind it is recorded **vacuous**, not passed.

## 5 · Falsifiers

- She uses `check` and it works ⇒ ⭐ S4's *"she prefers the relationship"* is **weaker than stated** and may
  have been an artefact of a cancelled run. **Record that, prominently.**
- `observe()` delivers but leaves the exchange open, or closes it with no inbound turn ⇒ the commit path is
  broken independently of the signal question.
- She reports content she never collected ⇒ ⛔ a provenance defect, and the more serious finding.
- She converses a fourth time ⇒ path A may be **the wrong abstraction for this counterpart**, not merely
  unwired. ⚠️ That would be the most consequential outcome and must not be written off as a failed test.

## 6 · ⛔ Not built, and not during

⛔ No completion delivery, no event subscription, no peek endpoint, no UI panel, no steering, no
`unfinished()` wiring — Ote: *"Don't implement completion delivery merely to make the test pass."*
⛔ Hermes's private session/transcript/reasoning is **not** read to supervise her during this run. ⓘ The
earlier transcript read was operator-side, at his explicit request, and is not a precedent.
⛔ `e050f9ea` remains frozen.
