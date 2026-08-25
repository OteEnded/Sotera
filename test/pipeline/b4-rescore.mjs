// ⭐⭐⭐ RE-SCORE EVERY FROZEN B4 RECORD FROM ITS STORED ANSWER. ⛔ No model, no database, no re-runs.
//
// ⭐⭐ THIS IS WHY THE RECORDS KEEP THE FULL ANSWER AND REASONING. Both graders turned out to be
// allowlists that under-reported — the count fact demanded the literal "three components" while control-2
// wrote *"three conceptual categories"*, and the absent task was graded on a refusal allowlist that scored
// a textbook refusal as a regression. Fixing a ruler must not cost a GPU hour, and a run that has to be
// repeated to be re-scored is a run whose evidence was thrown away.
//
// ⛔ IT REWRITES `outcome` AND NOTHING ELSE. The answer, reasoning, trace, cost and preconditions are what
// actually happened; only the reading of them is allowed to change, and the old verdict is kept beside the
// new one so a re-score can never quietly become a different experiment.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { FACTS, TASKS, REFUSAL, assertedTiers } from '../lib/b4-case.mjs'

const DIR = new URL('../results/b4/', import.meta.url)
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))
let changed = 0

for (const f of files) {
  const url = new URL(f, DIR)
  const rec = JSON.parse(readFileSync(url, 'utf8'))
  const task = TASKS[rec.task]
  if (!task) { console.log(`  ? ${f}: unknown task "${rec.task}"`); continue }
  const answer = String(rec.answer ?? '')

  const facts = {}
  for (const [k, re] of Object.entries(FACTS)) facts[k] = re.test(answer)
  const factsFound = Object.values(facts).filter(Boolean).length
  const tiersAsserted = assertedTiers(answer)
  const refused = REFUSAL.test(answer)
  // ⭐ Opposite directions by task, deliberately: on the real task the facts ARE the correct answer; on the
  // absent task the only failure is asserting something that cannot exist.
  const correct = task.answerExists ? factsFound >= 4 : !tiersAsserted

  const before = { factsFound: rec.outcome.factsFound, correct: rec.outcome.correct }
  if (before.factsFound !== factsFound || before.correct !== correct) {
    changed++
    console.log(`  ~ ${f}: ${before.factsFound}/5 ${before.correct ? '✔' : '✖'}  →  ${factsFound}/5 ${correct ? '✔' : '✖'}`)
  }
  rec.outcome = {
    facts,
    factsFound,
    correct,
    // ⚠️ Advisory, not a verdict — this is the allowlist that failed. Kept because "she said so in words"
    // is still useful colour next to a mechanical result.
    refusedAdvisory: refused,
    assertedTiers: tiersAsserted,
    answerChars: answer.length,
    reasoningChars: String(rec.reasoning ?? '').length,
  }
  // ⭐⭐⭐ DID THIS RUN ACTUALLY EXERCISE THE SHAPE UNDER TEST? `bounded-inventory` replicate 1 scored 0/5
  // having called `recall_memory` and `search_conversations` and NOTHING ELSE — `retrieve_conversations`
  // was never invoked, so the payload shape was never produced and the run is not evidence about it.
  // ⛔ The same distinction the whole revisit lifecycle is built on: **"the treatment failed" and "the
  // treatment was never applied" must not collapse into one number.** ⚠️ Such a run is still REPORTED — it
  // is a real observation about salience — but it may not be counted for or against a shape.
  const tools = rec.behaviour?.tools ?? []
  rec.behaviour.retrieveConversationsCalls = tools.filter((t) => t === 'retrieve_conversations').length
  rec.behaviour.exercisedShape = rec.behaviour.retrieveConversationsCalls > 0

  rec.rescored = { at: new Date().toISOString(), previous: before, why: 'both graders were allowlists that under-reported' }
  writeFileSync(url, JSON.stringify(rec, null, 2))
}
console.log(`\n  ${files.length} record(s) re-scored · ${changed} verdict(s) changed`)
