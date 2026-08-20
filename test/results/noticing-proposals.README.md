# `noticing-proposals.jsonl` — READ THIS BEFORE YOU USE ANY ROW AS EVIDENCE

This log has **three prompt generations in it**, and two of them are contaminated. The generation is
recorded on every row as `promptGeneration`. ⛔ **No row has ever been relabelled and none ever should be** —
Ote: *"Keep Gen-1 and Gen-2 exactly as they are, permanently marked as contaminated experimental records."*

The canonical statement of what may and may not be inferred from each generation is
**`Reference/docs/OBSERVATION_SOTERA_NOTICING_STRUCTURE_CONTAMINATED.md`**. This file is the pointer that
sits next to the data so nobody reads the data without it.

| gen | rows | what the prompt supplied | usable as evidence for |
|---|---|---|---|
| **1** | 17 | ⛔ relation words (*replaces · refines · qualifies · sits alongside*), a routing menu naming our five layers, and `revise\|nuance` as declared outcomes | ⛔ **not** her vocabulary · ⛔ **not** her structure · ⛔ **not** her routing. Her *choices within our menu*, and the raw text, only. |
| **2** | 1 | ⛔ four enumerated labelled asks (*what it is · where it belongs · how sure you are · whether it changes something*) and a six-value `OUTCOME:` line | ⛔ **not** her structure. What she *chose to keep* and *how she reasoned*, yes. |
| **3** | growing | ⭐ one open question and nothing else. No slots, no OUTCOME line, no priors, no classification. | ⭐ the clean structure sample. **This is where observation of her own ontology starts.** |

## The measurement that killed generation 2

**15 of 15 non-empty rows across generations 1 and 2 returned my four bullet labels as their headings.**
⭐ An enumerated list of labelled asks is a **structure menu**, exactly as a list of relation words was a
vocabulary menu — and the words *"use your own headings, whatever structure actually fits it"* sat **inside**
the list of four they were inviting her to leave.

Also measured, in the gen-1 bodies: `refines` 27 · `qualifies` 25 · `replaces` 25 · `sits alongside` 23.
Those are **our** words in her voice. It is why gen-1 rows must never be shown back to her as priors.

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
