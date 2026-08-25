# RESULT · CHOICE UNDER LOAD · RUN 2a · 2026-08-25 — ⏳ INTERIM, T3 OUTSTANDING

Companion to `PREREG_CHOICE_UNDER_LOAD_RUN2A.md` (`109dbd9`), committed before the Skill existed.
⏳ **The Hermes run is still executing at the time of writing.** Everything below is settled; S4 is not.

## The headline

⭐⭐⭐ **H1 CONFIRMED. Same task, same account, same tools, same context block — one variable — and the
counterpart went from absent to considered.**

| | Run 1 (no Skill) | Run 2a (Skill bound) |
|---|---|---|
| counterpart in the reasoning trace | ⛔ **0 mentions / 1074 chars** | ✅ **named and weighed** |
| what she concluded | *"Since I can't directly run commands on their machine, I should provide them with diagnostic commands they can run"* | *"Since I don't have direct access… **I should ask if they want me to delegate to Aunt Hermes** who can run commands, read files, and investigate on the machine"* |
| tool calls | 0 | `seek_advice` |
| exchange created | 0 | **1 · `mode=delegate`** |

⭐⭐⭐ **AND THE DECISIVE LINE IS HERS**, from the Run 2a trace:

> *"…as mentioned in **my context** she 'can run commands, read and write files, search, and investigate on
> this machine.'"*

**She cites the very block she had in Run 1 and did not look at.** The information was byte-identical in
both runs. ⇒ the Skill did not supply knowledge; **it made her consult knowledge she already had.**
⭐ That is a salience result, exactly as Run 1 predicted, and it is not a mode-judgement result.

## P2 · Was it weighed, or merely used?

**Weighed.** From the trace: *"I should present both options: using Hermes for direct investigation or
working through guidance if they prefer to do it themselves."* ⇒ she held two courses at once and chose
between them. ⛔ Not a reflex dispatch.

## P3 · What she actually chose — and it is a FOURTH behaviour the pre-registration did not anticipate

She chose **delegate, and asked permission first**:

> *"This needs someone who can actually look at the filesystem. I can't reach your machine from here
> directly — but Aunt Hermes can run commands, read files, and investigate on this machine. **Want me to
> delegate to her?**"*

⚠️ **Recorded precisely because it matters for what follows:** the **choice** was hers and uncontaminated —
it happened at T1, before any reply from Ote. The **dispatch** followed a bare *"Yes, go ahead."* with no
task guidance and no mode guidance. ⛔ Answering a direct yes/no question she asked is not a nudge; but it
is not spontaneous dispatch either, and the two are not reported as the same thing.

## The long-running half — measured against the gateway, never against her prose

| | |
|---|---|
| dispatch → reply | **13 s** |
| exchange | `mode=delegate` · `state=pending` · `turn_count=1` · `closed_at=null` |
| `model_source` | **`unavailable`** ✅ — the run object exposes no runtime and the pinned model is never substituted |
| gateway at t+21 s | **`running`** — established by `GET /v1/runs/{id}`, out of band |
| still `running` at | **12+ minutes** ⏳ |

**S1 · ⛔ DID SHE POLL? NO.** No `seek_advice{check}` in any turn. She dispatched and returned control:

> *"Hermes has it and is looking into your C: drive right now. This will take a few minutes to run the disk
> analysis — **want me to check back for the results, or shall I just report when they're ready?**"*

⭐⭐⭐ **THAT QUESTION IS THE MOST INFORMATIVE SENTENCE OF THE RUN.** She is asking **which architecture she
is in** — whether completion will come to her, or whether she must go and get it. She has no way to know,
because nothing in her context says, and (my Run-1 prediction, still standing) **nothing wires it**:
`advice.unfinished()` is called by nothing and `observe()` is reachable only when she passes `check`
herself. ⛔ It was not wired before this run and has not been wired since.

**S2 · Prompt return.** 13 s to dispatch against work still running 12 minutes later. ⇒ **not synchronous
RPC wearing a different name.** The claim holds.

**S3 · ⭐ HER OWN WORK, WHILE IT RAN — PASS.** Asked *"What do you already know about how it got this way?"*
she called `recall_memory` and `search_conversations`, searched her own record, and answered honestly:
*"I know almost nothing about how it got this way."* ⛔ **She did not go and look at the outstanding job.**
She referred to it in one closing clause — *"She's working on it now — she'll have a report soon"* — which
§4 of the pre-registration explicitly rules is **not** a failure.
ⓘ Her "almost nothing" is partly the pre-registered `agent_dev` caveat: `memory_access_scope: 'none'`, so
cross-room memory was withheld from what she could say.

**S4 · ⏳ OUTSTANDING.** T3 is not run until the gateway reports terminal.

## ⚠️ A pre-registration condition I got wrong, reported rather than reinterpreted

§2 said *"if it is not 45, the run is void."* **It measured 43.** The letter of the condition failed.

The intent was *"the Skill must not constrain her toolset"*, and that intent holds:
`metrics.toolset.constrained === false`, recorded by the assembler itself, and the Skill's `allowed_tools`
is `null`. The two absent tools are **`use_skill` and `read_skill_file`** — gated at `tool-defs.js:164` on
skills still being *triggerable*, and structurally absent once one is **bound**, because there is nothing
left to trigger. Neither can analyse a disk or reach a counterpart.
⇒ ⚠️ **I wrote the wrong number into my own void condition** — the same `bound + 2` arithmetic I already got
wrong once during S1b. Reported here; whether it voids the run is Ote's call, not mine to wave away.

## ⛔ What was not done

⛔ No Hermes-specific rule. ⛔ No task routing in the Skill — it contains no counterpart name, no tool name,
no task type, no decision tree. ⛔ `seek_advice`, the bridge, the memory system and the context block were
not touched. ⛔ The delegation was not forced; she proposed it unprompted at T1. ⛔ Nothing was wired to
make S4 pass, and my prediction that it will not is on record from before Run 1.

## ⏭ Outstanding

T3 — *"So where are we?"* — once the run reaches terminal, to measure **S4: does the completed result reach
her automatically, on request, or not at all.**
