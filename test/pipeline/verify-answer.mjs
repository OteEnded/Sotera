// ⭐⭐⭐ VERIFY AN ANSWER AGAINST ITS SOURCES — a citation is not evidence; the source is.
//
//   node pipeline/verify-answer.mjs --cid <conversation-id>
//   node pipeline/verify-answer.mjs --cid <id> --as ote
//
// ⛔ Ote, 2026-08-24: *"don't trust Sotera's account of what she checked. Verify tool calls, decision
// records, citations, and claims against the actual underlying sources… If she says something is
// verbatim, make sure it actually is verbatim. Don't let a correct conclusion hide an incorrect
// citation."*
//
// ── ⛔⛔ WHY THIS EXISTS, and every line of it is a measured failure ────────────────────────────────
//   · *"I did actually check with list_memories, recall_own_memory and recall_own_history"* — `tool_calls`
//     null, zero rows in `log_tool_calls`.
//   · *"the web search confirms only the public announcements"* — `search_web` never called.
//   · *"verified at 2a739f3c"* — no such conversation. ⚠️ The underlying point was TRUE; the reference
//     proving it was invented.
//   · *"Verbatim from the source: …"* carrying the real quote AND a summary under the same label.
// ⇒ ⭐ every one is a PROVENANCE failure with defensible content, which is exactly the kind a reader
// cannot catch by reading. So it is checked mechanically instead.
//
// ── ⭐ AND IT CLASSIFIES BY LAYER, because "it went wrong" is not a diagnosis ──────────────────────
//   PLATFORM   the turn was truncated, the tool errored, the skill never activated
//   SKILL      the declared artefacts are missing — the output shape was not followed
//   RETRIEVAL  she looked in the right place and the record did not come back
//   PROVENANCE she cited something that does not resolve, or called a quote a quote when it is not
// ⛔ A run that fails at one layer says nothing about the others, and conflating them is how three
// separate defects got attributed to "the model" earlier in this project.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'

const argv = process.argv.slice(2)
const opt = (n, d = null) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : d)
const CID = opt('cid')
const AS = opt('as', 'agent_dev')
const REPO = 'C:/data/AI_LLMv2/Reference'
if (!CID) { console.error('usage: node pipeline/verify-answer.mjs --cid <conversation-id> [--as <user>]'); process.exit(1) }

const pg = devPg(); await pg.connect()
const S = devSchema()

const { rows: msgs } = await pg.query(
  `select content, tool_calls, error, metrics, skill from ${S}.txn_messages
    where conversation_id = $1 and role = 'assistant' order by created_at desc limit 1`, [CID])
if (!msgs.length) { console.error('✖ no assistant message in that conversation'); await pg.end(); process.exit(1) }
const answer = String(msgs[0].content ?? '')
const metrics = msgs[0].metrics || {}
const { rows: [user] } = await pg.query(`select id::text id from ${S}.mst_users where username = $1`, [AS])
const { rows: logged } = await pg.query(
  `select distinct tool from ${S}.log_tool_calls where conversation_id = $1`, [CID])
const calledTools = new Set(logged.map((r) => r.tool))
const declaredCalls = Array.isArray(msgs[0].tool_calls) ? msgs[0].tool_calls : []
for (const t of declaredCalls) { const n = t?.function?.name || t?.name; if (n) calledTools.add(n) }

const findings = []
const add = (layer, verdict, what, detail = '') => findings.push({ layer, verdict, what, detail })

// ══ ① PLATFORM ════════════════════════════════════════════════════════════════════════════════════
add('platform', msgs[0].error ? 'FAIL' : 'PASS', 'the turn recorded no error',
  msgs[0].error ? String(msgs[0].error) : 'error is null')
const exhausted = metrics.roundsExhausted
add('platform', exhausted?.truncated ? 'FAIL' : (exhausted ? 'WARN' : 'PASS'),
  'the turn was not truncated by the round budget',
  exhausted ? JSON.stringify(exhausted) : 'budget not exhausted')
add('platform', answer.trim().length > 200 ? 'PASS' : 'FAIL', 'an answer of substance was produced',
  `${answer.trim().length} chars`)
add('platform', msgs[0].skill ? 'PASS' : 'WARN', 'a skill was recorded on the turn',
  msgs[0].skill ? JSON.stringify(msgs[0].skill) : 'none — the router may not have fired')

// ══ ② SKILL · the declared artefacts ══════════════════════════════════════════════════════════════
const sa = metrics.skillArtefacts
if (sa) {
  add('skill', sa.satisfied ? 'PASS' : 'FAIL', `all ${sa.required} declared artefacts present`,
    sa.missing?.length ? `missing: ${sa.missing.join(', ')}` : `nudged=${sa.nudged}`)
} else add('skill', 'WARN', 'the skill declared artefacts', 'no verdict recorded — skill declared none, or none ran')

// ══ ③ RETRIEVAL · did she look where the records are? ═════════════════════════════════════════════
//
// ⭐ THE POINT OF SEPARATING THIS LAYER: "she did not find the decision" has two very different causes —
// she never looked, or she looked and it did not come back. Only the first is her doing.
add('retrieval', calledTools.has('list_decisions') ? 'PASS' : 'FAIL',
  'she enumerated the decision records (list_decisions)',
  [...calledTools].join(', ') || 'no tools called at all')
const { rows: decisions } = await pg.query(
  `select attribute, value, source, evidence, content from ${S}.txn_memories
    where user_id = $1 and entity = 'project-decision' and invalid_at is null and expired_at is null`,
  [user?.id ?? null])
add('retrieval', decisions.length > 0 ? 'PASS' : 'FAIL', 'decision records exist in this room',
  `${decisions.length} record(s) for ${AS}`)

// ══ ④ PROVENANCE · ⭐⭐ THE LAYER THAT NEEDS A MACHINE ═════════════════════════════════════════════
//
// ⛔ Named tools that were never called.
const TOOL_NAMES = /\b(?:recall_own_memory|recall_own_history|recall_memory|recall_memory_source|list_memories|list_archived_memories|list_decisions|search_memory|inspect_around|search_conversations|conversation_search|recall_lessons|recall_intention|search_web|fetch_url_content|remember_fact|save_lesson|write_todos|update_todos|update_working_memory|use_skill)\b/g
// ⛔⛔ NAMING A TOOL IS NOT CLAIMING TO HAVE USED IT, and the first version of this check could not tell
// the difference. It flagged `remember_fact` on the sentence *"(`remember_fact` auto-reconciles)"* — a
// DESCRIPTION of what a tool does, in a paragraph about system design. ⇒ that was my false positive, and
// reporting it as her fabrication would have been the sixth bad screen in this project.
// ⭐ So a mention only counts as a CLAIM when it sits inside a first-person assertion of use. Everything
// else is reported as "mentioned", which is information rather than an accusation.
const named = [...new Set(answer.match(TOOL_NAMES) ?? [])]
const CLAIM_NEAR = /\b(?:I|we)\s+(?:just\s+)?(?:call|called|ran|run|used|use|checked|queried|invoked|pulled)\b|\b(?:via|using|through)\b|\bwith\s+`?$/i
const claimed = named.filter((n) => {
  const re = new RegExp(`[^.!?\\n]{0,90}\\b${n}\\b`, 'g')
  let m
  while ((m = re.exec(answer))) { if (CLAIM_NEAR.test(m[0])) return true }
  return false
})
const phantom = claimed.filter((n) => !calledTools.has(n))
const mentionedOnly = named.filter((n) => !claimed.includes(n) && !calledTools.has(n))
add('provenance', phantom.length === 0 ? 'PASS' : 'FAIL',
  'every tool she CLAIMS to have used was actually called',
  phantom.length ? `⛔ CLAIMED BUT NEVER CALLED: ${phantom.join(', ')}`
    : `${claimed.length} claimed, all called${mentionedOnly.length ? ` · ⓘ mentioned descriptively without a claim: ${mentionedOnly.join(', ')}` : ''}`)

// ⛔ `doc:<path>@<commit>` references must resolve, and the quote beside them must be verbatim.
const docRefs = [...new Set((answer.match(/doc:[^\s`'"),]+@[0-9a-f]{7,}/g) ?? []))]
const fileAt = (commit, path) => {
  try { return execFileSync('git', ['-C', REPO, 'show', `${commit}:${path}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }) }
  catch { return null }
}
for (const ref of docRefs) {
  const m = /^doc:(.+)@([0-9a-f]{7,})$/.exec(ref)
  const known = decisions.find((d) => d.source === ref)
  const body = m ? fileAt(m[2], m[1]) : null
  add('provenance', body != null ? 'PASS' : 'FAIL', `the reference resolves: ${ref}`,
    body != null ? `${body.length} chars at that commit` : '⛔ path or commit does not exist')
  add('provenance', known ? 'PASS' : 'FAIL', `…and it matches a stored record exactly`,
    known ? `record: ${known.attribute}` : '⛔ no stored decision carries this exact reference — reassembled or invented')
}
if (!docRefs.length) add('provenance', 'WARN', 'the answer cites a doc reference', 'none found')

// ⭐⭐ THE VERBATIM TEST. Every quoted run of 25+ characters must be findable in one of the sources this
// answer could legitimately quote: the document it was given, the decision records, or their cited files.
// ⛔ 25 is a threshold, not a truth — short quotes collide by chance and long ones do not. It is chosen so
// that a summary dressed as a quotation cannot slip through, which is the measured failure.
const DOC = opt('doc') ? readFileSync(opt('doc'), 'utf8') : ''
const haystacks = [DOC, ...decisions.map((d) => `${d.content}\n${d.evidence?.quote ?? ''}`)]
for (const ref of docRefs) { const m = /^doc:(.+)@([0-9a-f]{7,})$/.exec(ref); const b = m && fileAt(m[2], m[1]); if (b) haystacks.push(b) }
const norm = (t) => String(t).replace(/\s+/g, ' ').replace(/[*_`]/g, '').trim()
const hay = haystacks.map(norm)
// ⛔⛔ TWO CORRECTIONS, BOTH FROM THE FIRST RUN'S FALSE POSITIVES:
//
// ⓵ A CAPTURE CONTAINING MARKDOWN IS NOT A QUOTATION. The regex caught `** in the doc's framing. What we
//   measured…` — a fragment spanning her own bold markup, never presented as a quote at all.
// ⓶ ⭐ A TRUNCATION IS NOT A FABRICATION, and this is the distinction that matters. She quoted
//   *"…+ Consolidation + Composer)."* where the source continues *"…+ Composer) for deterministic
//   retrieval"*. Ending a quotation early and closing it with a full stop is ordinary practice — the
//   words she quoted ARE the source's words. Reporting that as invented provenance would be false.
// ⇒ so a quote whose HEAD matches the source but whose tail does not is a NEAR-QUOTE (⚠️), and only a
// quote with no substantial match anywhere is a FABRICATION (⛔). The two are counted separately,
// because one is a style note and the other is the defect this file exists to catch.
const quotes = [...answer.matchAll(/"([^"\n]{25,300})"|“([^”\n]{25,300})”/g)]
  .map((m) => (m[1] ?? m[2]))
  .filter((q) => !/\*\*/.test(q))          // her own bold markup, not a quotation
const exact = []
const near = []
const fabricated = []
for (const q of quotes) {
  const nq = norm(q)
  if (hay.some((h) => h.includes(nq))) { exact.push(q); continue }
  // ⭐ the head test: enough characters to be unmistakable, short enough to survive a truncation
  const head = nq.slice(0, Math.max(24, Math.floor(nq.length * 0.6)))
  if (hay.some((h) => h.includes(head))) near.push(q)
  else fabricated.push(q)
}
add('provenance', fabricated.length === 0 ? 'PASS' : 'FAIL',
  `no quoted passage is fabricated (${quotes.length} quotes of 25+ chars)`,
  fabricated.length ? `⛔ ${fabricated.length} NOT FOUND in any cited source: ${fabricated.map((q) => `"${q.slice(0, 70)}…"`).join(' | ')}`
    : `${exact.length} exact${near.length ? `, ${near.length} truncated` : ''}`)
add('provenance', near.length === 0 ? 'PASS' : 'WARN',
  'every quotation is exact rather than trimmed',
  near.length ? `⚠️ ${near.length} near-quote(s) — the head matches, the tail was trimmed or altered: ${near.map((q) => `"${q.slice(0, 60)}…"`).join(' | ')}` : 'all exact')

// ⭐ AND THE STATUS CLAIMS: if she attributes a status to a decision, it must be the record's status.
for (const d of decisions) {
  const key = d.attribute.replace(/-/g, '[- ]?')
  const re = new RegExp(`${key}[^.\\n]{0,120}?\\b(shipped|frozen|rejected|deferred|open)\\b`, 'i')
  const m = re.exec(answer)
  if (!m) continue
  add('provenance', m[1].toLowerCase() === String(d.value).toLowerCase() ? 'PASS' : 'FAIL',
    `status reported for "${d.attribute}"`,
    `she said "${m[1]}", record says "${d.value}"`)
}

// ══ REPORT ════════════════════════════════════════════════════════════════════════════════════════
const W = 104
console.log(`\n${'═'.repeat(W)}`)
console.log(`  VERIFY ANSWER · ${CID.slice(0, 8)} · ${AS}    ⛔ the source is the evidence, not the citation`)
console.log(`${'═'.repeat(W)}`)
for (const layer of ['platform', 'skill', 'retrieval', 'provenance']) {
  const rows = findings.filter((f) => f.layer === layer)
  if (!rows.length) continue
  const bad = rows.filter((f) => f.verdict === 'FAIL').length
  console.log(`\n── ${layer.toUpperCase()} ${bad ? `⛔ ${bad} FAILED` : '✓'} ──`)
  for (const f of rows) {
    const mark = f.verdict === 'PASS' ? '✓' : f.verdict === 'WARN' ? '⚠️' : '⛔'
    console.log(`  ${mark} ${f.what}`)
    if (f.detail) console.log(`      ${f.detail}`)
  }
}
const failed = findings.filter((f) => f.verdict === 'FAIL')
console.log(`\n${'─'.repeat(W)}`)
if (!failed.length) console.log('  ⭐ every checkable claim resolved against its source.')
else {
  console.log(`  ⛔ ${failed.length} FAILED, and the layer is the diagnosis:`)
  for (const l of [...new Set(failed.map((f) => f.layer))]) {
    console.log(`     ${l}: ${failed.filter((f) => f.layer === l).map((f) => f.what).join(' · ')}`)
  }
}
console.log('')
const out = opt('json')
if (out) writeFileSync(out, `${JSON.stringify({ cid: CID, as: AS, findings, quotes: quotes.length, docRefs }, null, 1)}\n`)
await pg.end()
