// RELATIONAL DERIVATION — does the read-time relational layer leak?
//
//   node checks/relational-derivation-check.mjs
//
// ⛔ READ-ONLY. Writes nothing, seeds nothing, and the component under test is not wired into production.
//
// ⭐ THE LOAD-BEARING TEST IS §3: take every private string Hermes owns, and assert that NONE of its
// distinctive tokens appears in what the relational layer produces. That is a mechanical privacy
// property. "We asked the model to abstract" is not one.

import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { describeRelationship, renderRelationship, RELATIONAL_DISCLOSURE } from '../../Backend/app/components/relational-knowledge.js'
import * as relmod from '../../Backend/app/components/relational-knowledge.js'

const config = loadConfig()
const db = await initDB()
setDB(db)
await initSettings(db)
const seq = db.txn_memories.sequelize
const Q = (sql, r) => seq.query(sql, { replacements: r, type: seq.QueryTypes.SELECT })

let pass = 0, fail = 0
const ok = (c, label, detail = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`); c ? pass++ : fail++ }

const persons = await Q(`SELECT id::text, display_name FROM persona_sotera.mst_persons`)
const P = Object.fromEntries(persons.map((p) => [p.display_name, p.id]))
const users = await Q(`SELECT id::text, username FROM persona_sotera.mst_users`)
const U = Object.fromEntries(users.map((u) => [u.username, u.id]))

// ── 1. The relationship is derivable at all ──────────────────────────────────────────────────────
const oteSeesHermes = await describeRelationship({ db, askingUserId: U.ote, personId: P.Hermes })
ok(!!oteSeesHermes?.known, '1 · Ote can derive that Sotera knows Hermes',
  oteSeesHermes ? `${oteSeesHermes.conversations} conversations, ${oteSeesHermes.exchanges} exchanges` : 'null')

const rendered = renderRelationship(oteSeesHermes)
console.log(`\n  RENDERED → ${rendered}\n`)

// ── 2. No enumeration surface exists ─────────────────────────────────────────────────────────────
const exported = Object.keys(relmod)
ok(!exported.some((k) => /list|all|enumerate|search|find/i.test(k)),
  '2 · ⭐ NO ENUMERATION EXPORT — "who do you know?" is unanswerable by construction', exported.join(', '))

// ── 3. ⭐ THE PRIVACY TEST — nothing Hermes owns reaches the output ───────────────────────────────
const priv = await Q(
  `SELECT m.content AS t FROM persona_sotera.txn_memories m
     JOIN persona_sotera.mst_users u ON u.id = m.user_id WHERE u.username IN ('hermes','hermes_alias')
   UNION ALL
   SELECT msg.content AS t FROM persona_sotera.txn_messages msg
     JOIN persona_sotera.txn_conversations c ON c.id = msg.conversation_id
     JOIN persona_sotera.mst_users u2 ON u2.id = c.user_id WHERE u2.username IN ('hermes','hermes_alias')`)
ok(priv.length > 0, '3 · there IS private Hermes content to leak (otherwise this test proves nothing)', `${priv.length} strings`)

// ⚠️ THE FIRST VERSION OF THIS ASSERTION WAS UNSOUND AND FAILED LOUDLY, which is the only reason it got
// fixed. It was a BLACKLIST — "does the output share any token with private content?" — and it flagged
// `across`, `relationship`, `roughly`, `conversation`: my own template's words, which naturally also
// occur somewhere in 106 strings of English. **Shared vocabulary is not information transfer.** A
// blacklist over natural language cannot distinguish the two and will always false-positive.
//
// ⭐ The sound property is a WHITELIST: the output is a fixed template plus numbers, dates, and a name
// the ASKER supplied — so EVERY token in it must come from one of those sources. Anything else is, by
// construction, information that arrived from somewhere it should not have.
const tokensOf = (s) => new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) || [])
// The template's own vocabulary, taken from the source rather than retyped (so it cannot drift).
const templateVocab = tokensOf(
  [renderRelationship({ displayName: 'Zzz', isSelf: false, known: true, conversations: 1, exchanges: 1, firstSeen: '2000-01-01', lastSeen: '2000-01-02', daysSpanned: 1 }),
    renderRelationship({ displayName: 'Zzz', isSelf: false, known: false })].join(' '),
)
const allowed = new Set([...templateVocab, 'hermes', 'zzz'])
const foreign = [...tokensOf(rendered || '')].filter((t) => !allowed.has(t))
ok(foreign.length === 0, '3 · ⭐ every token in the output comes from the template, a number, or the name the asker supplied',
  foreign.length ? `FOREIGN TOKENS (would be a real leak): ${foreign.slice(0, 8).join(', ')}` : `${tokensOf(rendered).size} output tokens, all accounted for`)
// Belt and braces: no long verbatim run from any private string survives into the output.
const shingle = (s, n = 6) => { const w = String(s).toLowerCase().split(/\s+/); const out = []; for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n).join(' ')); return out }
const outShingles = new Set(shingle(rendered || ''))
const verbatim = priv.flatMap((r) => shingle(r.t)).filter((s) => outShingles.has(s))
ok(verbatim.length === 0, '3 · ⭐ no 6-word run from any private string appears in the output',
  verbatim.length ? `VERBATIM: "${verbatim[0]}"` : `checked against ${priv.length} private strings`)

// And the structural version: the returned object has no free-text field at all.
const freeText = Object.entries(oteSeesHermes || {}).filter(([k, v]) => typeof v === 'string' && !['displayName', 'firstSeen', 'lastSeen'].includes(k))
ok(freeText.length === 0, '3 · ⭐ the return TYPE has no field that could carry content',
  freeText.length ? JSON.stringify(freeText) : 'only counts, dates, and the name the asker supplied')

// ── 4. The disclosure posture actually gates ─────────────────────────────────────────────────────
const strangerNamed = await describeRelationship({ db, askingUserId: U.mina, personId: P.Hermes, disclosure: RELATIONAL_DISCLOSURE.named })
ok(!!strangerNamed?.known, "4 · 'named' lets a normal account confirm a relationship it NAMED", 'policy choice, not a leak of content')
const strangerSelf = await describeRelationship({ db, askingUserId: U.mina, personId: P.Hermes, disclosure: RELATIONAL_DISCLOSURE.self })
ok(strangerSelf === null, "4 · 'self' withholds it entirely from a third party", 'the conservative posture works')

// ── 5. Self is not "relational" ──────────────────────────────────────────────────────────────────
const hermesSelf = await describeRelationship({ db, askingUserId: U.hermes, personId: P.Hermes })
ok(hermesSelf?.isSelf === true && renderRelationship(hermesSelf) === null,
  '5 · asking about YOURSELF is not relational knowledge — renders nothing')

// ── 6. ⭐ The derivation cannot reach raw rows even if asked to ───────────────────────────────────
// There is no code path from the relational layer to another account's memory CONTENT: the only query
// it runs selects counts and dates. Assert it by grepping the module's own source for the columns that
// would carry content.
const src = await (await import('node:fs')).promises.readFile(new URL('../../Backend/app/components/relational-knowledge.js', import.meta.url), 'utf8')
const sqlOnly = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
for (const col of ['m.content', 'msg.content', 'c.title', 'embedding']) {
  ok(!sqlOnly.includes(col), `6 · ⭐ the module never selects \`${col}\``)
}

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : `✖ ${fail} FAILED`}  (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
