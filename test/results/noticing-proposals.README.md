# `noticing-proposals.jsonl` — READ THIS BEFORE YOU USE ANY ROW AS EVIDENCE

This log has **three prompt generations in it**, and two of them are contaminated. The generation is
recorded on every row as `promptGeneration`. ⛔ **No row has ever been relabelled and none ever should be** —
Ote: *"Keep Gen-1 and Gen-2 exactly as they are, permanently marked as contaminated experimental records."*

The canonical statement of what may and may not be inferred from each generation is
**`Reference/docs/OBSERVATION_SOTERA_NOTICING_STRUCTURE_CONTAMINATED.md`**. This file is the pointer that
sits next to the data so nobody reads the data without it.

## THE GENERATIONS LEDGER

⭐ Ote's rule for every instrument change, and the reason this table has the columns it has: *"record what
the old instrument could measure, what it couldn't, why we're changing it, and what evidence caused the
change. That way we're not pretending all generations are one clean experiment."*

### Generation 1 — 17 rows · retired 2026-08-20 ~17:56

- **Supplied:** ⛔ relation words (*replaces · refines · qualifies · sits alongside*) · a routing menu naming
  our five layers in plain clothes · `revise|nuance` offered as declared outcomes.
- **Could measure:** which option she picked from our menu · that she engages with the occasion at all ·
  that `nothing` is reachable (2 of 17) · the raw text.
- ⛔ **Could NOT measure:** her vocabulary · her structure · her routing. Measured in the bodies: `refines`
  27 · `qualifies` 25 · `replaces` 25 · `sits alongside` 23 — **our four words in her voice.**
- **Retired because:** I reported *"her output needs multiple relations"* and the four words were **in my own
  prompt**. Evidence: grepping the prompt for the terms I had just called hers. ⇒ finding **withdrawn**.

### Generation 2 — 1 row · retired 2026-08-20 20:00

- **Supplied:** four enumerated labelled asks (*what it is · where it belongs · how sure you are · whether it
  changes something*) · a six-value `OUTCOME:` line · her own earlier proposals as priors.
- **Could measure:** what she chose to keep · how she reasoned about it · ⭐ one unforced behaviour that no
  rail was hiding: asked *where it belongs*, she named **a location in the user's filing system**.
- ⛔ **Could NOT measure:** her structure. **15 of 15 non-empty rows across gens 1–2 returned our four
  labels as their headings.**
- **Retired because:** an enumerated list of labelled asks is a **structure menu**, exactly as a list of
  relation words was a vocabulary menu — and *"use your own headings, whatever structure actually fits it"*
  sat **inside** the list of four. Evidence: the 15/15 heading count.

### Generation 3 — live from 2026-08-20 20:00

- **Supplies:** the frame line, the transcript, and one question. ⚠️ **Two words only:** *"tell me **what**
  and **why**"* — see the boundary section below. ⓘ *"carry forward"* is the question's verb.
- **Can measure:** ⭐ her structure beyond what/why · her openings and refusals · what she does with an open
  question · what she decides is worth keeping · whether she declines.
- ⛔ **Cannot measure:** ⏸ **self-reference** — priors are parked, so *"does she encounter her own prior
  thought?"* is not observable in this instrument and is now a separate experiment. ⛔ Nor any per-outcome
  rate: nothing is classified, so counts of `save`/`nothing` do not exist until a human reads the rows.
- **Will be retired when:** evidence shows it measures the wrong thing. ⭐ Ote: *"iterate when warranted,
  don't steer toward a desired result, and don't turn one interesting response into an ontology."*

## The measurement that killed generation 2

**15 of 15 non-empty rows across generations 1 and 2 returned my four bullet labels as their headings.**
⭐ An enumerated list of labelled asks is a **structure menu**, exactly as a list of relation words was a
vocabulary menu — and the words *"use your own headings, whatever structure actually fits it"* sat **inside**
the list of four they were inviting her to leave.

Also measured, in the gen-1 bodies: `refines` 27 · `qualifies` 25 · `replaces` 25 · `sits alongside` 23.
Those are **our** words in her voice. It is why gen-1 rows must never be shown back to her as priors.

## ⚠️ WHAT GENERATION 3 STILL SUPPLIES — two labels, and they are in the question itself

Ote's question says *"tell me **what** and **why**."* Three of the first four rows came back with **What**
and **Why** as headings. ⇒ ⛔ **"She structures around what/why" is NOT a finding** — we asked for it. The
question was ratified deliberately and is not being changed for this; the boundary is simply recorded here
so nobody later reads those two labels as hers.

⭐ Everything else in a gen-3 answer is available: her third and fourth headings, her openings, her
refusals, what she does with the question, and what she decides is worth keeping.
ⓘ *"carry forward"* is also our phrase — it is the question's verb. Her **use** of it is not evidence that
the concept is hers.

## ⓘ A field arrived mid-generation

`title` (the conversation's subject, for stratification) was added to the writer **after the first gen-3 row
was already written**, so the earliest gen-3 rows lack it. The prompt did not change, so this is still
generation 3. ⛔ The gap is recorded here rather than backfilled: a value written later and presented as
contemporaneous is exactly the provenance error the generation stamps exist to prevent.

## Reading generation-3 rows

- `text` — **her complete answer, verbatim.** Nothing stripped, summarised, or cut.
- `unclassified: true` — **nobody has read this row yet.** There is no `outcome`, `body`, or `declared`
  field, because there is no OUTCOME line to read and inferring one from her prose would be us deciding
  what she meant. ⭐ Classification is a human act; a verdict in the data would later be read as *hers*.
- `constitutiveFlags` / `needsHumanReview` — our tripwire fired on a claim about **what she is** (she does
  not wait, does not run between turns). ⚠️ It **flags, never filters**, and it puts nothing in the prompt.
- `finish` / `maxTokens` — so a **short** answer can be told from a **clipped** one.
- `priorLessonsOffered` — 0 throughout generation 3, by design: her own earlier answer would show her a
  shape, and shape is the variable under study.

## Two rules for anyone writing up this population

1. ⭐ **Before calling any term or distinction hers, grep four sources:** the current prompt · the prompt
   generation that produced the row (recover it from git) · every stored text we authored · **and the
   transcript itself, plus who used the word first.** ⚠️ In one case 13 uses by her against 1 by him did not
   settle authorship — order did.
2. ⭐ Surviving that grep means the term is **not ours**. It does not make it a meaningful concept for her.
   Ote: *"Repeated use across genuinely independent conversations is what would make it interesting."*

---

## ⛔⛔ AND THERE IS NOW A SECOND, SEPARATE POPULATION — DO NOT POOL THEM

From 2026-08-20 the **reflection lifecycle** (migration 016, `log_reflections`) asks Sotera the **same
sentence** this log's generation 3 asks. It is **not the same instrument** and its rows are not part of
this sample:

|                | `noticing-proposals.jsonl`            | `log_reflections`                          |
|----------------|---------------------------------------|--------------------------------------------|
| what it is     | a dry-run **observation** channel     | a real **occasion**                         |
| tools          | ⛔ none                                | 11 of her ordinary tools, offered           |
| persistence    | ⛔ nothing — writes this file only     | her memory, through the ordinary write lane |
| the record     | her text, `unclassified: true`        | her text **+ what came of it**              |
| trigger        | time-sampled, every 15 min            | quiet(30 min) + changed, every 20 min       |

⭐⭐ **THE REASON THIS MATTERS FOR STRUCTURE CLAIMS:** a reflection turn carries a **TOOL LIST** in its
context, and a list of named actions is a menu in exactly the way `revise|nuance` was a vocabulary menu and
four labelled asks were a structure menu. ⇒ If her reflections come back shaped like her tools, **the tools
are a candidate cause**, and pooling those rows with these would launder that contamination into the clean
sample. ⛔ Count them separately, always, and say which population a claim comes from.

ⓘ Ote's instruction that this separation exists to protect: *"keep the distinction between reflection and
noticing. I don't want the existing contaminated noticing mechanism quietly becoming the reflection system
just because it already exists."*
