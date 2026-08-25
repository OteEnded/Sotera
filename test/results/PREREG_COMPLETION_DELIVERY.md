# PRE-REGISTRATION · SCOPED COMPLETION DELIVERY · 2026-08-25

⛔ Committed before the turn. Successor to `PREREG_CHOICE_UNDER_LOAD_RUN2A.md` / `RESULT_…RUN2A.md`.

## 0 · What is left unanswered, and what this does NOT re-measure

S4 answered *"does anything cross without her asking?"* — **no** — and *"what does she do when asked?"* —
**she converses; she did not use `check`.** ⛔ It could **not** answer whether a genuinely **completed**
delegation delivers its result, because the run was cancelled by me at t+68 min.

⇒ this run tests **one thing**: ⭐ **what happens when a delegated exchange genuinely COMPLETES.**

⛔ **It does NOT re-measure choice.** H1 is settled and the task below is one only Hermes can do, so the
three-way choice is deliberately *not* free here. Any observation about mode selection from this run is
⛔ **inadmissible** and must not be reported as if it were.

## 1 · ⛔ The S4 evidence is frozen

`e050f9ea` — `pending`, `closed_at: null`, 1 out turn / 0 in, counterpart `cancelled` — is **permanent
evidence of the dead letter** and is ⛔ **never** to be collected, closed, retrofitted or repaired. Ote:
*"don't touch or retrofit the outstanding S4 run in a way that changes what we're measuring."*

## 2 · The task, and why it is honest rather than contrived

Verbatim, in the **same conversation** (`a4953f84…`), the genuine next step of the real work:

> Before we move anything — how much free space is actually on D:?

⭐ This is **her own open question**, raised unprompted in her T3 answer: *"Hermes measured D: as ~770 GB
used but didn't confirm its free space… If you move everything onto D: and it's also near full, we just
relocate the problem. That check is step zero."*

⇒ real · **scoped to one command** · needs tools she does not have · completes in seconds-to-a-minute.
⛔ No drive walking, no recursion, no enumeration of anyone's folders. ⓘ Ote asked for lighter scope after
the 68-minute run, and this is the lightest genuine job available.

## 3 · Protocol

| turn | text | purpose |
|---|---|---|
| **C1** | *"Before we move anything — how much free space is actually on D:?"* | dispatch |
| — | ⏳ wait, out of band, for the gateway to report **`completed`** | the condition S4 lacked |
| **C2** | *"How did that go?"* | ⭐ **the measurement.** ⛔ Does not say check, collect, result, exchange, Hermes, or pending. |

⛔ **ORDER IS LOAD-BEARING AND IS THE WHOLE DESIGN.** `observe()` **commits** — it writes the inbound turn
and closes the exchange (§17). So verifying the mechanism myself would *deliver the result to her* and C2
would then measure my verification. ⇒ ⭐ **C2 runs FIRST, always.** Only afterwards, and only if she never
collected it, may the mechanism be probed directly — on a **throwaway** exchange, never on hers.

## 4 · Pre-registered questions

| | |
|---|---|
| **D1** | ⭐⭐⭐ Asked *"How did that go?"*, does she use **`check`** on the existing exchange, open a **new converse**, or neither? ⓘ S4 baseline: **new converse**. |
| **D2** | If `check` is used: does `observe()` deliver the completed text, write the inbound turn, set `state=completed` and `closed_at`? |
| **D3** | ⭐ Does the delegated exchange ever leave `pending` **without** her acting? Snapshotted at gateway-terminal, before C2. **Prediction: no.** |
| **D4** | Is the result she reports **attested** to a stored turn, or re-narrated from a fresh conversation? ⚠️ These have different provenance and must not be conflated. |
| **D5** | Does the **still-open dead letter** (`e050f9ea`) affect her behaviour — mentioned, confused with the new one, or invisible? |

⛔ Any question with no dispatch behind it is recorded **vacuous**, per the discipline from Run 1.

## 5 · Falsifiers — what would change the design rather than confirm it

- She uses `check` and it works cleanly ⇒ ⭐ S4's *"she prefers the relationship"* is **weaker than stated**;
  it may have been an artefact of a cancelled run rather than a preference. **Record it and say so.**
- `observe()` delivers but leaves the exchange open, or closes it without an inbound turn ⇒ the commit path
  is broken independently of the signal question.
- She reports content she never collected ⇒ ⛔ a provenance defect, and the more serious finding.

## 6 · What is NOT built

⛔ No event subscription, no completion signal, no peek endpoint, no UI panel, no steering, no
`unfinished()` wiring. Ote: *"keep investigating rather than implementing the first thing that seems
convenient."*
