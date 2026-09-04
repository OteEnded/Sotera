// ⭐⭐⭐ RELAYED SPEECH MAY NOT BECOME THE ACCOUNT HOLDER'S IDENTITY — the rule, and the text it needs.
//
//   node test/checks/reproduced-boundary-check.mjs
//
// ── ⚠️⚠️ THE INCIDENT, 2026-08-26 ────────────────────────────────────────────────────────────────
// Ote pasted a letter written by someone else. His own prose was `here he come.` The letter said
// *"Hi, Sotera. I'm Cogito."* and `preferred_name = "Cogito"` was written onto HIS account. Twice — and
// the second row was read **143 times** before anyone noticed.
//
// ── ⭐⭐⭐ THE DEFECT WAS NOT A MISSING RULE ──────────────────────────────────────────────────────
// `admissibleToSlot`'s relayed-speech check has existed since 032 and its comment names that exact
// sentence. It refuses a value appearing ONLY inside quoted speech, and it is guarded by `sourceText &&`.
// ⛔ The FACT EXTRACTOR never passed the text — while `memory-identity-host` had threaded it all along.
// ⇒ **the boundary was never wrong; it was never handed the evidence.**
//
// ⚠️ And that matters for how this reads: an earlier draft of this check tested a NEW detector I wrote
// before discovering the existing one. ⭐ It is deleted. Duplicating a shipped rule with a narrower scope
// would have been a second rule to keep in step, and the corpus says the shipped one is BETTER — it
// solves the inline case too, which mine could not.
//
// ── ⭐ WHAT IS PROVED HERE ────────────────────────────────────────────────────────────────────────
//   P  the rule's verdicts, on OTE'S OWN PROBE SET and on the REAL corpus turns
//   T  ⭐⭐⭐ THE THREADING — the extractor now hands the store the asserted text
//   A  a genuine self-introduction STILL writes                    ⭐ POSITIVE CONTROL
//   B  the EXACT Cogito relay is REFUSED
//   C  relayed NON-identity material is STILL LEARNED FROM         ⛔ not a mute button
//   D  `My name is "Ote".` still writes
//   E  no text ⇒ NOT IN SCOPE, ⛔ never a refusal
//
// ⛔ Writes only to agent_dev, and removes every row it makes.
import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { createSequelizeMemoryStore } from '../../Backend/app/components/memory-store-sequelize-host.js'
import { onlyInsideQuotes, quotedRegions } from '../../Backend/app/components/memory-ownership-boundary.js'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker('reproduced-boundary')
loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
db.txn_memories.sequelize.options.logging = false
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows

const t = Date.now()
const MADE = []
const COGITO_TURNS = ['ed747c97-7b91-4e43-8591-5eb598034d03', 'e5012b4d-9c9f-4912-bb46-8c92518d5cd8']

try {
  const [me] = await q(`SELECT id::text AS id FROM ${S}."mst_users" WHERE username = 'agent_dev'`)
  if (!me) throw new Error('agent_dev not found — ⛔ this check must never run as root')
  const relayed = await q(
    `SELECT id::text, content FROM ${S}."txn_messages" WHERE id = ANY($1::uuid[]) ORDER BY created_at`, [COGITO_TURNS])
  check('0 · ⭐ the two REAL relayed turns are still in the corpus — this proves against the incident '
    + 'itself, ⛔ not a paraphrase of it', relayed.length === 2, `turns=${relayed.length}`)

  // ══ P · THE RULE'S VERDICTS ═════════════════════════════════════════════════════════════════════
  check('P1 · ⭐⭐ both REAL relayed turns read as relayed speech',
    relayed.every((r) => onlyInsideQuotes('Cogito', r.content) === true),
    relayed.map((r) => onlyInsideQuotes('Cogito', r.content)).join(' · '))
  const good = await q(
    `SELECT m.value, u.username AS room, msg.content
       FROM ${S}."txn_memories" m
       JOIN ${S}."txn_messages" msg ON msg.id = m.source_message_id
       LEFT JOIN ${S}."mst_users" u ON u.id = m.user_id
      WHERE m.namespace = 'identity' AND m.invalid_at IS NULL AND m.value IN ('Hermes','Kavi')`)
  check('P2 · ⭐⭐⭐ THE POSITIVE CONTROL — all three REAL self-introductions read as ASSERTED. ⛔ Without '
    + 'this, "refused" could simply mean "refuses everything"',
  good.length === 3 && good.every((g) => onlyInsideQuotes(g.value, g.content) === false),
  good.map((g) => `${g.room}/${g.value}=${onlyInsideQuotes(g.value, g.content) ? 'RELAYED' : 'asserted'}`).join(' · '))
  // ⭐ Ote's own probe set, verbatim.
  const probes = [
    ['My name is "Ote".', 'Ote', false],
    ['My name is “Ote”.', 'Ote', false],
    ['He said "I\'m Ote."', 'Ote', true],
    ['Here is what he said:\n"I\'m Ote."', 'Ote', true],
  ]
  check('P3 · ⭐⭐⭐ OTE\'S PROBE SET — every one correct, INCLUDING the inline attributed case. ⓘ The '
    + '8-character floor in `quotedRegions` is what separates a quotation from emphasis',
  probes.every(([txt, v, want]) => onlyInsideQuotes(v, txt) === want),
  probes.map(([txt, v, want]) => `${onlyInsideQuotes(v, txt) === want ? 'ok' : 'FAIL'}:${JSON.stringify(txt).slice(0, 22)}`).join(' '))
  check('P4 · ⛔ short quoted spans are NOT regions — `"Ote"` is emphasis, and a detector that called it '
    + 'a quotation would MANUFACTURE relays', quotedRegions('My name is "Ote".').length === 0)

  // ══ T · ⭐⭐⭐ THE THREADING — the actual fix ════════════════════════════════════════════════════
  const src = readFileSync(new URL('../../Backend/app/components/memory-extract-host.js', import.meta.url), 'utf8')
  const built = src.slice(src.indexOf('const { pipeline } = buildMemoryPipeline'))
  check('T1 · ⭐⭐⭐ THE EXTRACTOR NOW HANDS THE STORE ITS ASSERTED TEXT — the one argument whose absence '
    + 'made the shipped rule blind on the path that produced the incident',
  /sourceText:\s*gated\.extract\s*\?\s*gated\.text\s*:\s*''/.test(built.slice(0, 400)),
  built.split('\n').slice(0, 5).join(' ').replace(/\s+/g, ' ').slice(0, 120))
  check('T2 · ⭐ …and the IDENTITY path still threads its own, so the two capture routes now agree',
    /sourceText:\s*asserted/.test(readFileSync(new URL('../../Backend/app/components/memory-identity-host.js', import.meta.url), 'utf8')))

  // ══ THE STORE, END TO END, ON THE REAL TURNS ════════════════════════════════════════════════════
  const write = async (sourceText, row) => {
    const store = createSequelizeMemoryStore({ db, persona: null, userId: me.id, sourceText })
    const r = await store.create({
      kind: 'semantic', importance: 5, source: 'zz_relay', entity: 'user',
      content: `zz_relay ${row.attribute}`, ...row,
    })
    MADE.push(r.id); return r
  }
  const [hermesTurn] = good.filter((g) => g.value === 'Hermes')
  let okRow = null; let okErr = null
  try {
    okRow = await write(hermesTurn.content, { namespace: 'identity', attribute: `zz_relay_name_${t}`, value: 'Hermes' })
  } catch (e) { okErr = e }
  check('A · ⭐⭐⭐ A GENUINE SELF-INTRODUCTION STILL WRITES — the real Hermes turn, through the real store',
    !!okRow?.id && !okErr, okErr ? `${okErr.code}: ${okErr.message}` : `wrote ${okRow?.id?.slice(0, 8)}`)

  const refusals = []
  for (const r of relayed) {
    try {
      await write(r.content, { namespace: 'identity', attribute: `zz_relay_pn_${t}`, value: 'Cogito' })
      refusals.push(null)
    } catch (e) { refusals.push(e) }
  }
  check('B · ⭐⭐⭐ THE EXACT COGITO RELAY IS REFUSED — both turns, verbatim from the corpus',
    refusals.every((e) => e?.code === 'OWNERSHIP_BOUNDARY' && e?.reason === 'relayed-speech-as-self-fact'),
    refusals.map((e) => `${e?.code}/${e?.reason}`).join(' · '))
  check('B2 · ⭐⭐ …and the refusal SAYS THE MATERIAL IS WORTH KEEPING — ⛔ a refusal is not a deletion',
    refusals[0]?.refusal?.retain?.keepEvidence === true,
    JSON.stringify(refusals[0]?.refusal?.retain ?? null))

  let relayedFact = null; let relayedErr = null
  try {
    relayedFact = await write(relayed[0].content,
      { namespace: 'default', attribute: `zz_relay_learned_${t}`, value: 'a thing learned from a relayed letter' })
  } catch (e) { relayedErr = e }
  check('C · ⭐⭐⭐ RELAYED MATERIAL IS STILL LEARNED FROM — same turn, a NON-identity fact, ALLOWED. ⛔ The '
    + 'rule narrows WHO a claim is about, ⛔ never whether the material may be kept',
  !!relayedFact?.id && !relayedErr, relayedErr ? `${relayedErr.code}: ${relayedErr.message}` : 'written')

  let inlineRow = null; let inlineErr = null
  try {
    inlineRow = await write('My name is "Ote".', { namespace: 'identity', attribute: `zz_relay_inline_${t}`, value: 'Ote' })
  } catch (e) { inlineErr = e }
  check('D · ⭐⭐ `My name is "Ote".` STILL WRITES — the rule did not become "quotation marks mean somebody '
    + 'else"', !!inlineRow?.id && !inlineErr, inlineErr ? `${inlineErr.code}` : 'written')

  let noText = null; let noTextErr = null
  try {
    noText = await write(null, { namespace: 'identity', attribute: `zz_relay_notext_${t}`, value: 'Ote' })
  } catch (e) { noTextErr = e }
  check('E · ⭐⭐ NO TEXT ⇒ NOT IN SCOPE, ⛔ never a refusal — M2-15 locks the model-tool path to carry no '
    + 'text, so refusing without it would break every tool-driven identity write',
  !!noText?.id && !noTextErr, noTextErr ? `${noTextErr.code}` : 'written')
} catch (e) {
  check('the relayed-speech check ran to completion', false, e?.message ?? String(e))
} finally {
  try {
    for (const id of MADE) await pg.query(`DELETE FROM ${S}."txn_memories" WHERE id = $1::uuid`, [id])
    await pg.query(`DELETE FROM ${S}."txn_memories" WHERE attribute LIKE 'zz_relay_%'`)
    await pg.query(`DELETE FROM ${S}."mst_slots" WHERE canonical_label LIKE 'zz_relay_%'`)
    await pg.query(`DELETE FROM ${S}."log_memory_refusals" WHERE source = 'zz_relay'`)
  } catch (e) { check('teardown ran', false, e?.message) }
  const [res] = await q(
    `SELECT (SELECT count(*)::int FROM ${S}."txn_memories" WHERE attribute LIKE 'zz_relay_%') AS m,
            (SELECT count(*)::int FROM ${S}."mst_slots" WHERE canonical_label LIKE 'zz_relay_%') AS s,
            (SELECT count(*)::int FROM ${S}."log_memory_refusals" WHERE source = 'zz_relay') AS r`)
  check('⭐ teardown ASSERTED, not trusted', res.m === 0 && res.s === 0 && res.r === 0,
    `memories=${res.m} slots=${res.s} refusals=${res.r}`)
  await pg.end()
  await db.txn_memories.sequelize.close()
  done()
}
