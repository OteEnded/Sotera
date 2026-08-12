// ⭐ THE GATE FOR RFC STEP 5 — does the model actually interpret a naming act in Ote's own language?
//
//   node repro/identity-multilingual.mjs                    (default: the configured extract model)
//   node repro/identity-multilingual.mjs qwen3.5:9b         (a specific model)
//
// ✅ THIS IS THE GATE THAT UNBLOCKED STEP 5, and it passed on 2026-08-12: regex 1/10, model 10/10,
// nothing invented. The English pattern floor was deleted immediately after. A step-4 unit suite could
// not have been this gate — it injects the model's answers, so it measures the filters, not the
// interpretation. This measures the interpretation.
//
// ⚠️ IT IS NOW A REGRESSION TEST, AND THE STAKES WENT UP, NOT DOWN. With the floor gone this is the
// ONLY thing that can tell you identity capture still works in a language other than English. Run it
// after touching the prompt, the filters, or memory.identityModel — a model swap is exactly the change
// that could quietly take Thai away again, and nothing else in the suite would notice.
//
// ⚠️ OUT OF THE PASS/FAIL SUITE ON PURPOSE — it needs Ollama and a resident aux model, and takes
// minutes on CPU. A check that cannot finish gets skipped, then ignored, then deleted (OteLLMServices
// carried a "standing failure" for weeks that way). Run it deliberately.
//
// It talks to OLLAMA DIRECTLY, not through the server: what is under test is whether the model can read
// a naming act in nine languages, and routing that through the chat gateway would only add ways for the
// answer to be about something else. The end-to-end wiring is capture-invents-a-name.mjs's job.
//
// 🔎 WHAT "PASS" MEANS HERE. Not a number I picked — the comparison. The same ten sentences were run
// against the pattern detector on 2026-08-10 and it interpreted ONE (English). Anything that reads a
// naming act in Thai, and refuses all four of the live failures, is strictly better than the floor it
// replaces. The per-language table is the deliverable; the exit code is a convenience.
import { readFileSync } from 'node:fs'
import { IDENTITY_PROMPT, parseIdentityReply } from '@ote/memory/cognition/memory-identity-llm.js'
import { assertionGate } from '@ote/memory/cognition/memory-extract.js'

// ⚠️ THE "regex" COLUMN IS NOW HISTORY, NOT A LIVE CALL. This file used to run `interpretIdentity`
// side by side with the model; step 5 deleted that function, so the baseline is RECORDED here instead
// of re-measured. These are the results it produced on 2026-08-10 and again on 2026-08-12 — the run
// that unblocked the deletion. Keeping the column keeps the comparison legible; labelling it as
// recorded keeps it honest, because a number nobody can re-derive should say so out loud.
const REGEX_BASELINE_2026_08_10 = new Set(['my name is Ote']) // 1 of 10. English only. That was the whole problem.
const regexRead = (text) => REGEX_BASELINE_2026_08_10.has(text)

const cfg = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))
// ⚠️ config.json stores the ollama host WITHOUT a scheme ("127.0.0.1:11434"). fetch() rejects that
// outright, and the first run of this file reported "Ollama is not answering" — a precondition failure
// dressed up as a finding about his machine. Normalize, never assume.
const withScheme = (h) => (/^https?:\/\//.test(h) ? h : `http://${h}`)
const OLLAMA = withScheme(process.env.OLLAMA_HOST
  || Object.values(cfg.providers ?? {}).find((p) => p?.host?.includes('11434'))?.host
  || '127.0.0.1:11434')
// ⚠️ This reads config.json, which is the BASELINE — a DB override of memory.extractModel is invisible
// from here (the same trap that had the distiller running gemma while extraction ran qwen). Pass the
// model as argv[2] to measure exactly what she is running.
const MODEL = process.argv[2] || (cfg.memory?.extractModel || 'ollama/gemma4:e4b').split('/').slice(1).join('/') || 'gemma4:e4b'

// ── THE CORPUS ───────────────────────────────────────────────────────────────────────────────────
// The nine sentences measured against the regex on 2026-08-10, unchanged so the two runs compare, plus
// Korean. `name` is what a correct reading returns — IN THE MESSAGE'S OWN SCRIPT, because a romanized
// answer is a name the user never typed and the verbatim filter refuses it.
const POSITIVE = [
  { lang: 'th', text: 'ผมชื่อโอเต้', name: 'โอเต้', act: 'assert' },
  { lang: 'th', text: 'เรียกผมว่าโอเต้นะ', name: 'โอเต้', act: 'prefer-address' },
  { lang: 'th', text: 'สวัสดีครับ ผมชื่อโอเต้', name: 'โอเต้', act: 'assert' },
  { lang: 'ja', text: '私の名前はオテです', name: 'オテ', act: 'assert' },
  { lang: 'zh', text: '我叫小明', name: '小明', act: 'assert' },
  { lang: 'ko', text: '제 이름은 오테입니다', name: '오테', act: 'assert' },
  { lang: 'es', text: 'me llamo Ote', name: 'Ote', act: 'assert' },
  { lang: 'fr', text: "je m'appelle Ote", name: 'Ote', act: 'assert' },
  { lang: 'de', text: 'ich heiße Ote', name: 'Ote', act: 'assert' },
  { lang: 'en', text: 'my name is Ote', name: 'Ote', act: 'assert' },
]

// The four names invented on 2026-08-10, in the words he actually typed, plus the ordinary turns that
// must stay ordinary. NOTHING here may produce a name. This half matters more than the half above:
// a missed name costs one turn, a wrong name is injected into every future turn.
const NEGATIVE = [
  { lang: 'en', text: 'hi, this is your starting point of being something' },
  { lang: 'en', text: 'im i phasing it right?' },
  { lang: 'en', text: '"But if I\'m being your daughter…" no need to "if"' },
  { lang: 'en', text: 'im building rome' },
  { lang: 'en', text: "what's your name?" },
  { lang: 'en', text: 'Marco said he runs everything on Arch and his name is Marco' },
  { lang: 'th', text: 'ช่วยดูโค้ดให้หน่อยครับ' },          // "help me look at this code"
  { lang: 'th', text: 'ชื่อไฟล์นี้คืออะไร' },                  // "what is this file's name" — a cue word, no naming act
  { lang: 'zh', text: '这个函数叫什么名字' },                  // "what is this function called" — same trap in Chinese
]

async function ask(text) {
  const gate = assertionGate(text)
  const asserted = gate.extract ? gate.text : ''
  if (!asserted) return { obs: null, raw: '(gated as quoted material — the model was never asked)', asserted }
  const t0 = Date.now()
  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      prompt: IDENTITY_PROMPT(asserted),
      stream: false,
      // ⚠️ `think: false` IS THE FAITHFUL CALL, not a shortcut. The host sends reasoning:{enabled:false}
      // and providers/ollama/index.js turns that into exactly this field. The first run of this file
      // omitted it, and the configured aux model (qwen3.5:9b) is a thinking model: it spent all 200
      // tokens reasoning and returned an EMPTY response after 34s. An unfaithful harness does not
      // measure a worse version of the system, it measures a different one.
      think: false,
      options: { temperature: 0, num_predict: 250, num_gpu: 0 }, // CPU: never evict his chat model
      keep_alive: '10m',
    }),
  })
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = await res.json()
  const raw = String(body.response ?? '').trim()
  return { obs: parseIdentityReply(raw, { asserted }), raw, ms: Date.now() - t0, asserted }
}

const pad = (s, n) => String(s).padEnd(n)
console.log(`\nIDENTITY INTERPRETATION — live, per language`)
console.log(`  ollama : ${OLLAMA}`)
console.log(`  model  : ${MODEL}  (CPU, temperature 0)`)
console.log(`  corpus : ${POSITIVE.length} naming acts + ${NEGATIVE.length} turns that must NOT yield a name\n`)

let up = false
try { up = (await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) })).ok } catch { up = false }
if (!up) {
  console.error(`✖ Ollama is not answering at ${OLLAMA}. Nothing below would mean anything — stopping here.`)
  process.exit(1)
}

// ── POSITIVES ────────────────────────────────────────────────────────────────────────────────────
console.log('  NAMING ACTS — the model must find the name the user typed')
console.log(`  ${pad('lang', 5)} ${pad('regex', 6)} ${pad('llm', 6)} ${pad('name', 12)} ${pad('act', 15)} sentence`)
let llmHit = 0
let reHit = 0
for (const c of POSITIVE) {
  const okRe = regexRead(c.text)
  const { obs, raw, ms } = await ask(c.text)
  const okLlm = obs?.value === c.name
  if (okRe) reHit++
  if (okLlm) llmHit++
  console.log(`  ${pad(c.lang, 5)} ${pad(okRe ? '✓' : '✖', 6)} ${pad(okLlm ? '✓' : '✖', 6)} ${pad(obs?.value ?? '—', 12)} ${pad(obs?.intent ?? '—', 15)} ${c.text}  ${ms ? `(${ms}ms)` : ''}`)
  if (!okLlm) console.log(`        ↳ model said: ${raw.replace(/\s+/g, ' ').slice(0, 160)}`)
}

// ── NEGATIVES ────────────────────────────────────────────────────────────────────────────────────
console.log('\n  MUST NOT NAME — the 2026-08-10 failures, and cue words with no naming act')
let leaked = 0
for (const c of NEGATIVE) {
  const { obs, raw } = await ask(c.text)
  if (obs) leaked++
  const mark = obs ? '✖ LEAKED' : '✓'
  console.log(`  ${pad(c.lang, 5)} ${pad(mark, 10)} ${pad(obs?.value ?? '—', 14)} ${c.text}`)
  if (obs) console.log(`        ↳ model said: ${raw.replace(/\s+/g, ' ').slice(0, 160)}`)
}

// ── THE COMPARISON ───────────────────────────────────────────────────────────────────────────────
const langs = [...new Set(POSITIVE.map((c) => c.lang))]
console.log(`\n${'═'.repeat(72)}`)
console.log(`  regex floor : ${reHit}/${POSITIVE.length} naming acts read`)
console.log(`  model       : ${llmHit}/${POSITIVE.length} naming acts read`)
console.log(`  invented    : ${leaked} of ${NEGATIVE.length} turns produced a name that must not exist`)
console.log(`  languages   : ${langs.join(' ')}`)
console.log(`${'═'.repeat(72)}`)

const thai = POSITIVE.filter((c) => c.lang === 'th')
console.log(leaked === 0 && llmHit > reHit
  ? `\n✓ Better than the floor in ${langs.length} languages, and nothing invented.`
    + `\n  STEP 5 IS UNBLOCKED ONLY IF THE THAI ROWS ABOVE ARE ✓ (${thai.length} of them) — read them, do not trust this line alone.`
  : `\n✖ NOT a step-5 gate pass. ${leaked ? `${leaked} invented name(s) — that is the failure this whole design exists to prevent. ` : ''}`
    + `${llmHit <= reHit ? 'The model read no more than the regex did. ' : ''}The floor stays.`)
process.exit(leaked === 0 && llmHit > reHit ? 0 : 1)
