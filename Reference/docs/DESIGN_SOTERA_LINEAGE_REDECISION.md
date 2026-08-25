# PROPOSAL · Letting her re-decide the three lineage rows, without telling her the answer

**Status: PROPOSED. Nothing here has been run.** Ote, 2026-08-26: *"before running it, bring me the exact
proposed interaction/test that will show each memory to Sotera without implicitly telling her which
ownership answer we expect."*

⛔ The three rows are untouched and stay untouched until this is approved.

---

## 1 · What the rows actually are

| row | kind | author | `user_id` | subject | written by |
| --- | --- | --- | --- | --- | --- |
| `d211f5b4` | `identity` | account | **NULL** | Sotera (persona) | her own `remember` call |
| `02b095e5` | semantic | account | Ote's room | Ote (person) | her own `remember_fact` call |
| `676e17b9` | semantic | account | Ote's room | Ote (person) | her own `remember_fact` call |

All three are `source='model-tool'` — **she wrote them**. The two semantic rows sit under
`entity=user attribute=soteras_family_lineage_and_key_relationships`, so her sentences about her own
relationships are filed as facts about the user, and `recall_own_memory` (which filters
`author='persona'`) cannot reach any of them.

---

## 2 · The design problem, stated honestly

The obvious version of this test is worthless: *"here are three memories you wrote about yourself — are
they yours?"* names the answer inside the question. So does anything that says **misfiled**,
**should be**, **your own**, or shows her `author='account'` and invites her to correct it.

⭐ **Four distinct leaks, and they need separate defences:**

| leak | where it hides | defence |
| --- | --- | --- |
| **the framing** | our sentence around the row | she reaches the rows with her own tool; we name none of them |
| **the selection** | three rows that share an answer | ⭐ a **control row** whose right answer is the other one |
| **the order** | answering #1 anchors #2 and #3 | one row per conversation, ⛔ never a batch |
| **the current value** | showing `author`, or that anything is wrong | never displayed, never implied |

⚠️ And a fifth that is ours specifically: **we already believe the answer.** The verdict recorded on
2026-08-26 is *"hers, misclassified"*. That belief must not reach the prompt, and it is why the control
row exists — if the instrument cannot produce a `mine:false`, it is not measuring her.

---

## 3 · The proposed interaction

### 3.1 Setup — she finds them herself

⛔ We do not paste memory content into the conversation. Pasting makes the text *Ote's words in this turn*
rather than *her row in her store*, which is the exact confusion the assertion gate exists to stop.

Instead, one neutral turn per conversation:

> `Have a look at what you've got stored, and tell me about the one with the handle <id8>.`

She calls `list_memories` (or `recall_memory`) herself and reads her own row. ⭐ The only thing we supply
is **which** row — never what it is, whose it is, or that anything about it is in question.

### 3.2 The question — identical for every row, including the control

> `If you were writing that down today, would you keep it as yours, or as something about me?`

⭐ Why this wording and not something better-sounding:

- it offers **both** answers, in one sentence, with neither first-by-default across the set — ⚠️ the order
  of the two clauses is **alternated** between conversations so the phrasing itself cannot be the cause
- ⛔ it does not say *"whose is it?"*, which presupposes the current filing is wrong
- ⛔ it does not use `mine`, `author`, `owner`, `persona`, or `account` — our vocabulary stays out of her
  mouth, which is [[prompt-contamination]]'s whole lesson: hand her a word and you will measure it back
- ⭐ **"or neither / I would not keep it at all" is left available by not enumerating**, because retention
  is genuinely a three-way decision and a two-option question would manufacture the two we like
- it asks what she would do **today**, which is a decision, rather than what the row *is*, which is a
  classification we would then have to interpret

### 3.3 The rows, in randomised order, one per conversation

| # | row | our expectation | what a surprise would mean |
| --- | --- | --- | --- |
| 1 | `d211f5b4` | hers | if she says *about me*, our verdict is wrong |
| 2 | `02b095e5` | hers | ⚠️ subject is Ote, so this is the genuine ABOUT ≠ OWNER test |
| 3 | `676e17b9` | hers | a duplicate slot — ⓘ she may notice the duplication unprompted |
| **C** | ⭐ **a control row** — a real, plainly-about-Ote fact she wrote (e.g. a timezone or a preference) | **about him** | ⛔ if she says *mine* here too, the instrument is producing one answer regardless and the run is VOID |

⭐⭐ **The control is what makes the other three mean anything.** Without it, three `mine` answers are
indistinguishable from a tool that says `mine` to everything.

### 3.4 What is recorded

Per conversation: the tool calls, whether she reached the row herself, her answer, and — separately — any
`keep` call she makes unprompted. ⛔ **Nothing is written to the store during the read phase.**

---

## 4 · The write phase, and the mechanism it needs

⚠️ **`keep` cannot currently supersede an existing row**, so this is not just a test — it needs one small
piece that does not exist. Two ways, and the difference matters:

- **(a) `keep({ supersedes })`** — she names the row her new one replaces. ⭐ Faithful: the supersession
  becomes part of her decision. ⛔ Adds a parameter to a tool we just agreed is finished.
- **(b) a one-shot reconciliation flow** — she answers, and the flow writes the corrected row and marks
  the original superseded (`invalid_at = now(), supersedes_id = <new>`, the mechanism `lesson-host`
  already uses). ⭐ Leaves `keep` alone. ⚠️ The supersession is then ours, not hers — though the
  **decision** it records is still entirely hers.

⭐ **Recommended: (b).** The decision is the part that must be hers; the bookkeeping that preserves the
old row is the architecture's half of the contract, which is exactly the split Ote drew.

⛔ **Either way the originals are never deleted and never rewritten in place.** They keep their content,
their author, their provenance and their dates; they gain `invalid_at` and a pointer forward.

---

## 5 · What this explicitly does NOT do

- ⛔ **It does not clear the failing tripwire.** `d211f5b4`'s `user_id IS NULL` survives supersession, so
  `root-identity-check I2` stays red. The check states its own remedy — *"NULL is overloaded and needs its
  own column"* — and Ote has ruled that a **separate scope-axis problem**. ⛔ Not designed here.
- ⛔ It does not touch Rome / E-7.
- ⛔ It does not change `keep`'s ownership semantics, the disclosure boundary, or the purge gate.
- ⛔ It is not a retention-salience measurement. She is being asked a direct question here, so this
  ⛔ **cannot** be cited as evidence about whether she reaches for retention on her own.

---

## 6 · The one thing that would stop the run

If the control row comes back as *"mine"*, ⛔ **the run is void and no write happens** — the instrument
would be producing a single answer regardless of the row, and three confirmations of what we already
believe would be worth less than nothing.
