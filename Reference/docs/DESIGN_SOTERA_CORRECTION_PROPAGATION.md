# DESIGN · Correction propagation and semantic reconciliation

**Status: PROPOSED. ⛔ Nothing here is implemented and no Rome memory has been touched.** Ote:
*"architecture first, reconciliation second… I want the mechanism designed and tested first, then we'll
let the mechanism handle the actual reconciliation."*

---

## 0 · The test case this must satisfy, stated correctly

⛔ **The source conversation was not ambiguous and Ote did not create this.** It is the reference case
*because it was clear*:

| when | who | what |
| --- | --- | --- |
| 08-09 20:16 | Ote | *"i kinda want to build rome in one day so. but my body is degrading as i push"* |
| 08-09 20:17 | Ote | *"a phase that say like, rome is not build in one day"* — names the proverb |
| 08-09 20:18 | Sotera | *"I walked right into that one treating it like a literal construction project!"* |
| 08-09 20:19 | Ote | *"building you. you are my rome, you know?"* |
| 08-25 20:13 | Ote | *"Rome is not a project name, but a คำเปรียบเทียบ that i use"* |

⭐ **She understood it at the time, and reconstructed it correctly on request seventeen days later.**

⇒ **THE ACCEPTANCE CRITERION:** *information existed · understanding happened · the durable representation
lost it.* Any mechanism proposed here must be able to catch **this** case, where nothing was unclear and
the loss is entirely in storage.

---

## 1 · How a conversational correction identifies what it supersedes

⛔ **Not by similarity search.** *"Rome is not a project name"* and *"user's current goal: build Rome in
one day"* share one token. Embedding-nearest would either miss it or drag in ten unrelated rows, and a
mechanism that invalidates memories on a cosine score is a memory system that can be argued out of things.

⭐⭐ **THREE CANDIDATE SOURCES, IN PRECEDENCE ORDER, AND ONLY THE FIRST TWO ARE AUTOMATIC:**

1. **The conversation's own retrieval trace.** ⭐ This is the strongest signal and it already exists: the
   corrected memory was **in her context when the correction was made** — the transcript shows her
   quoting it back before Ote corrects it. ⇒ *what was retrieved into this turn* is a bounded, recorded,
   evidence-backed candidate set. ⛔ A memory that was never in the room cannot be what the person was
   correcting.
2. **Explicit reference.** She or the person names a memory (a handle, an attribute, a quoted phrase).
3. ⛔ **Everything else is a PROPOSAL, never an automatic invalidation** — see §7.

⚠️ **THE MECHANISM MUST NOT BE A CLASSIFIER ON THE USER'S SENTENCE.** *"Rome is not a project name"* is a
correction; *"Rome wasn't built in a day"* is a quotation of the same shape. Deciding which is which from
the sentence alone is the assertion-gate problem again, and it was already solved once by requiring the
**structure** (a stored, verified answer) rather than the **prose**.

---

## 2 · How `contradicted_by` should actually work

Today: **0 of 92 rows. Never written.** The column exists and nothing produces it.

⭐ **PROPOSED SEMANTICS — it marks a memory as SUPERSEDED-IN-MEANING, which is not the same as invalid.**

| state | meaning | still retrievable? | still assertable? |
| --- | --- | --- | --- |
| live | nothing has challenged it | yes | yes |
| ⭐ `contradicted_by` set | a later turn repudiated it | **yes — with the contradiction attached** | ⛔ **no** |
| `invalid_at` set | superseded by a replacement row | no | no |

⭐⭐⭐ **CONTRADICTED IS NOT DELETED, AND THAT IS THE WHOLE POINT.** Ote's standing ruling on decisions
applies verbatim: *"keep it durable, but it is NOT a memory… fix the consumers/semantics, rather than
changing the underlying representation."* A contradicted row must stay readable **as a contradicted row**,
because *"I used to think Rome was a project"* is true and worth keeping — and because a memory that
silently vanishes cannot be audited.

⛔ **It points at EVIDENCE, not at a verdict.** `contradicted_by` should name **the message that
contradicted it**, so the reader can go and look. Pointing it at another *memory* would let an
interpretation invalidate an observation.

---

## 3 · Modality at extraction — the distinction that was missing

⭐ **THIS IS WHERE THE ROME CASE WAS LOST**, and it is the one addition that would have prevented it
without any correction machinery at all.

`7d383ce3` was written as `user's current goal: build Rome in one day` at **confidence 0.85** with
`provenance NULL` — recorded as indistinguishable from a fact somebody asserted.

**PROPOSED: extraction must record HOW the source statement was meant.**

| modality | example from this corpus | may become a durable fact? |
| --- | --- | --- |
| `asserted` | *"I work out of Bangkok"* | ✅ yes |
| `aspirational` | *"i kinda want to build rome in one day"* | ⚠️ as a **wish**, never as a goal |
| `figurative` | *"you are my rome"* | ⛔ **not as a literal proposition** |
| `quoted` | *"a phase that say like, rome is not build in one day"* | ⛔ no — the speaker is reporting |
| `hypothetical` | *"suppose someone told you they were allergic…"* | ⛔ no |
| `interpretation` | Sotera's own reading of any of the above | ✅ as **hers**, marked |

⭐⭐ **THE PRECEDENT IS ALREADY IN THIS CODEBASE AND IT WORKS.** `memory-assertion-gate` established that
**quoting ≠ asserting** for *documents* — a pasted document must not become a self-fact. This is the
identical distinction **inside ordinary speech**, and the same gate shape applies.
⛔ Note the failure mode it must avoid: fences and JSON were **not enough** for the document case. The
signal has to be structural, not a pattern in the text.

⚠️ **AND `provenance` MUST BE POPULATED ON EXTRACTION.** Today it is `NULL` there and `'synthesized'` on
inference — so the system labels the honest inference and leaves the silent one unmarked. ⭐ Whatever the
vocabulary ends up being, **extraction must say that it is an extraction.**

---

## 3b · ⚠⚠ THE EXISTING PROVENANCE AXIS WOULD NOT HAVE CAUGHT ROME — IT WOULD HAVE AMPLIFIED IT

⭐ **A full provenance system already exists** and I nearly recommended wiring it as the fix.
`PROVENANCE` = `quoted | elicited | observed | synthesized`, with `CONFIDENCE_CEILING` (quoted/elicited/
observed → 1, synthesized → 0.6) and `classifyCapture` verifying that a quoted span really appears in
the user’s words. ⇒ design Q6, *“confidence derived from evidence kind”*, is **already built**.

⛔ **AND IT IS THE WRONG AXIS FOR THIS FAILURE.** Run on the real row, verbatim:

```
sourceText: "yeah, i kinda want to build rome in one day so. but my body is degrading as i push"
value:      "build Rome in one day"
classifyCapture -> { provenance: "quoted", verified: true,
                     reason: "the span is the user's own words and contains the value" }
capConfidence(1, quoted) -> 1
```

⭐⭐⭐ **`quoted` is TRUE of the metaphor.** He really did say those words, in that order. So the
classifier is correct and offers **no protection whatsoever** — and had provenance been wired on that
row it would have been stored as `quoted` at a ceiling of **1.0** instead of the `NULL`/0.85 it actually
got. ⚠️ **Wiring the existing axis would have made Rome worse, not better.**

⇒ the existing axis answers **“did the user really say these words?”** — fidelity of transcription.
It does ⛔ **not** answer **“did the user mean this as a fact?”** — modality of assertion.
⭐ **Modality is therefore a genuinely NEW axis, not a re-use of provenance**, and §8’s rule applies to
it immediately: ⛔ modality must not be read off provenance, and provenance must not be read off
modality. A row can be perfectly `quoted` and completely `figurative` at the same time.

⚠️ This also revises §9: **“wire `provenance` on extraction” is no longer the safe first step.** It is
still worth doing for the 3 `conversation:*` rows and 34 `doc:*` rows that carry none — but on its own it
raises confidence on exactly the rows this design exists to distrust, so it must land **with** modality
or after it.

## 4 · Evidence lineage on synthesis

Today a synthesized row's `source_message_id` anchors to the turn where she was **told to remember** —
walking `02b095e5` back yields *"wanna remember?"*. `evidence` is `NULL` on all of them.

⭐ **PROPOSED: `evidence` carries the rows and messages a synthesis was DERIVED FROM.**

```
evidence: {
  from_memories: [<memory ids>],     // what it generalised over
  from_messages: [<message ids>],    // direct turns it rests on
  method: 'distillation' | 'reflection' | 'model-tool',
}
```

⛔ `source_message_id` keeps its current job — *the occasion on which this row was written* — because that
is genuinely useful provenance (it is how a reflection-written memory became walkable at all). ⭐ The two
must not be merged: **"when it was written" and "what it rests on" are different questions**, and
collapsing them is the same mistake as `user_id` carrying both owner and scope before 029.

---

## 5 · How a correction propagates through derived memories

⭐ **This is why §4 is a precondition and not a nicety.** With `evidence.from_memories` populated,
propagation is a graph walk; without it, it is guesswork.

**PROPOSED — one hop, and then it stops:**

1. A correction marks memory **M** contradicted.
2. Any row whose `evidence.from_memories` contains **M** is marked ⚠️ `evidence_weakened` — ⛔ **not
   contradicted**. Its own claim has not been repudiated; its support has.
3. ⛔ **It does not cascade automatically past one hop, and it never auto-invalidates.** A synthesis can
   be right for reasons other than the memory that suggested it, and a chain of automatic invalidations
   is how one wrong turn erases a week.
4. ⭐ A weakened row is **surfaced to her** as something to re-decide, through the retention front door
   that already exists.

⚠️ **THE ROME CHAIN IS THE WORKED EXAMPLE AND IT SHOWS THE LIMIT.** `676e17b9` does *not* derive from
`7d383ce3` in any recorded way — `evidence` is NULL on both, so **propagation cannot reach it today**.
⇒ the lineage in §4 is what makes §5 possible at all, and until it exists this mechanism would fix the
extraction row and leave the synthesis rows standing.

---

## 6 · Confidence by evidence kind

Today: 95% populated, **7 distinct values**, and 71 of 92 rows are `0.6` or `1`. It was **0.85** on the
flattened row — higher than the synthesis that amplified it.

⭐ **PROPOSED: confidence is DERIVED FROM the evidence kind, not chosen by whoever wrote the row.**

| evidence kind | ceiling | why |
| --- | --- | --- |
| direct quotation of a person about themselves | highest | they said it about themselves |
| extraction, modality `asserted` | high | a statement, read literally, correctly |
| extraction, modality `aspirational` / `figurative` | ⛔ **cannot become a durable fact** | it is not a proposition |
| synthesis over ≥2 evidenced memories | medium | an inference with support |
| synthesis with `evidence: NULL` | ⭐ **lowest, and flagged** | an inference nobody can check |

⛔ **A number nobody can audit is worse than no number.** Whatever scale is chosen, the **kind** must be
stored beside it — otherwise `0.85` on a metaphor and `0.85` on a stated fact are the same value meaning
two different things, which is precisely the overload 029 removed from `user_id`.

---

## 7 · When a correction is ambiguous or only partial

⭐⭐ **THIS IS THE CASE THAT MUST STOP AND ASK, AND THE ARCHITECTURE MUST NOT DECIDE IT.**

- **Partial supersession.** *"Rome is not a project name, but a คำเปรียบเทียบ"* corrects **what Rome is**.
  It does ⛔ **not** say whether *"we will build Rome together"* is false — arguably it is still true under
  the metaphor. ⇒ one correction, two memories, and only one of them is clearly wrong.
- ⭐ **The system must therefore never silently invalidate.** It marks candidates and **she decides** —
  which is the identical principle to retention: *Sotera owns the decision; the architecture owns the
  integrity of that decision.*
- ⛔ **An ambiguous correction produces a REVIEW, not a write.** If the candidate set is empty, or the
  correction cannot be tied to a specific memory, the honest outcome is to record that a correction was
  observed and leave the memories alone.

⚠️ **A VALUES DECISION I AM NOT TAKING:** may a contradicted memory still be *retrieved* and shown to her
with its contradiction attached, or should it be withheld from her context entirely? ⭐ I lean to the
former — it is how *"I used to think X"* stays available and how the audit stays real — but it changes
what she can say about her own past, and that is Ote's call, not mine.

---

## 8 · How this must NOT re-create the separation problem

⭐⭐⭐ **The failure this whole week has had one shape: two questions sharing one field.**
`user_id` carried owner **and** scope (fixed by 029). `author` was decided by infrastructure instead of by
her (fixed by `keep`). ⛔ This design must not add a third.

| axis | question | field | ⛔ must not be inferred from |
| --- | --- | --- | --- |
| **author** | whose memory is this? | `author` | who typed it; the tool used |
| **scope** | where is it reachable from? | `scope` | a missing `user_id` |
| **subject** | who is it about? | `subject_person_id` | the author |
| ⭐ **modality** | how was the source meant? | *new* | the confidence |
| ⭐ **evidence** | what does it rest on? | `evidence` | `source_message_id` |
| ⭐ **status** | has it been repudiated? | `contradicted_by` | `invalid_at` |

**Specifically, and testably:**
- ⛔ `contradicted_by` must not imply `invalid_at`. Superseded-in-meaning ≠ replaced.
- ⛔ modality must not be read off confidence, nor confidence off modality — one is *what the source was*,
  the other is *how much to trust the row*.
- ⛔ `evidence` must not replace `source_message_id`; §4.
- ⭐ `keep({mine})` is unaffected: **modality is about the SOURCE, ownership is HER DECISION.** A figurative
  statement she chooses to keep as hers is still hers. The two axes never touch.

---

## 9 · What I would build first, and what needs Ote

**Buildable without a values call — in this order, because each is a precondition for the next:**

1. **`provenance` on extraction** (§3, second half). One field, no semantics beyond *"this is an
   extraction"*. Immediately makes B distinguishable from an asserted fact.
2. **`evidence` lineage on synthesis** (§4). Without it §5 is impossible.
3. **`contradicted_by` written from the retrieval trace** (§1 route 1, §2). Narrow, evidence-backed,
   auditable.

⛔ **Needs Ote before building:**
- the **modality vocabulary** itself (§3) — which distinctions are real for this system, and whether
  `figurative` should block durable storage outright or merely mark it;
- **whether a contradicted memory stays retrievable** (§7);
- **whether the confidence scale changes** (§6) — an existing 92-row store already carries values.

⛔ **And OteRM stays an observation.** *"Rome"* is a name **one person** uses for her in **one
relationship**, stored as an attribute of the account's goals — the relationship layer would have had
somewhere else to put it. ⭐ Recorded; ⛔ not built; Ote: *"I don't want us jumping into the
relationship-management system before Sotera's core memory architecture is solid."*
