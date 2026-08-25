// ⭐⭐⭐ RETENTION + AUTHORSHIP — the two integrity guarantees, asserted against the real store.
//
//   node test/checks/retention-authorship-check.mjs
//
// The design names exactly two things the architecture owes her, and the family-lineage incident broke
// BOTH. They are testable without a model, which is the point — a guarantee that needs a 35B to
// demonstrate is a hope.
//
//   1. HER DECLARED AUTHOR SURVIVES THE WRITE PATH UNCHANGED. ⛔ No later stage may reassign it.
//   2. A PERSONA-AUTHORED MEMORY IS NEVER RE-SUBJECTED INTO A `user's …` SLOT.
//
// ⚠️ AND THE THIRD, WHICH IS THE ONE THAT ACTUALLY BIT: **an undeclared owner is REFUSED.** The bug was
// never a wrong rule, it was a default standing in for a decision nobody made.

import { makeChecker, devPg, devSchema } from '../harness.mjs'
import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildRetention, authorFor, KINDS } from '../../Backend/app/components/retention-host.js'
import { ownerOf } from '../../Backend/app/components/memory-ownership.js'
import { readFileSync } from 'node:fs'

const { check, done } = makeChecker('retention-authorship')
const ok = (c, l, d = '') => check(l, c, d)
const config = loadConfig()
const db = await initDB(); setDB(db); await initSettings(db)
const fastify = { db, config, log: null }
const pg = devPg(); await pg.connect()
const S = devSchema()
const q = async (sql, p) => (await pg.query(sql, p)).rows

const [me] = await q(`select id::text id, username from ${S}.mst_users where username = 'agent_dev' limit 1`)
if (!me) { console.error('✖ agent_dev not found'); process.exit(1) }
const R = buildRetention(fastify, { userId: me.id, self: { username: me.username } })

// ── 1 · THE GATE · `mine` HAS NO DEFAULT ──────────────────────────────────────────────────────────
//
// ⚠️⚠️ THE MEASURED FAILURE THIS ENCODES: three family-lineage rows, all `author='account'`, none of them
// a decision anyone made. `runtime.js` reads `extras.memoryAuthor === 'persona' ? 'persona' : 'account'`
// and NO ROUTE passes `memoryAuthor` — so the interactive path never offered the choice at all.
ok(authorFor(true) === 'persona', '1 · mine:true  ⇒ author persona', String(authorFor(true)))
ok(authorFor(false) === 'account', '1 · mine:false ⇒ author account', String(authorFor(false)))
ok(authorFor(undefined) === null, '1 · ⭐⭐⭐ mine OMITTED ⇒ null — ⛔ NOT a default', String(authorFor(undefined)))
ok(authorFor(null) === null, '1 · mine:null ⇒ null', String(authorFor(null)))
// ⛔ THE TRUTHINESS TRAP, ASSERTED EXPLICITLY. `!mine` would fold `false` into the same branch as
// `undefined` and quietly restore the default through the back door — the same shape as reading identity
// off a value's shape, which has nine live instances in this project.
ok(authorFor(0) === null && authorFor('') === null && authorFor('false') === null,
  '1 · ⛔ falsy-but-not-false is UNDECLARED, not "account" — the truthiness trap',
  `0:${authorFor(0)} '':${authorFor('')} 'false':${authorFor('false')}`)
ok(authorFor('true') === null, '1 · ⛔ …and a STRING "true" is not a decision either', String(authorFor('true')))

const undeclared = await R.keep({ what: 'something worth keeping', kind: 'note' })
ok(undeclared.ok === false && undeclared.refused === 'ownership_undeclared',
  '1 · ⭐⭐ an undeclared owner REFUSES THE WRITE and asks', JSON.stringify(undeclared.refused))
ok(/whose memory/i.test(undeclared.why ?? ''),
  '1 · ⭐ …and the refusal is a QUESTION she can answer, not an error code',
  String(undeclared.why).slice(0, 60))

// ⛔ AND THE REFUSAL MUST NOT HAVE WRITTEN ANYTHING. A refusal that already persisted is worse than a
// default, because it is a default plus a lie.
const [{ n: beforeRefuse }] = await q(`select count(*)::int n from ${S}.txn_memories where user_id = $1`, [me.id])
await R.keep({ what: 'a second undeclared thing', kind: 'note' })
await new Promise((r) => setTimeout(r, 600))
const [{ n: afterRefuse }] = await q(`select count(*)::int n from ${S}.txn_memories where user_id = $1`, [me.id])
ok(beforeRefuse === afterRefuse, '1 · ⛔⛔ a refused keep writes NOTHING', `${beforeRefuse} → ${afterRefuse}`)

// ── 2 · GUARANTEE ONE · THE DECLARED AUTHOR SURVIVES THE WRITE PATH ───────────────────────────────
const stamp = `retention-check-${process.pid}-${beforeRefuse}`

const mineNote = await R.keep({ what: `${stamp} · mine`, kind: KINDS.note, mine: true })
ok(mineNote.ok === true && mineNote.author === 'persona', '2 · keep(note, mine:true) reports persona', JSON.stringify(mineNote.author))
const theirsNote = await R.keep({ what: `${stamp} · theirs`, kind: KINDS.note, mine: false })
ok(theirsNote.ok === true && theirsNote.author === 'account', '2 · keep(note, mine:false) reports account', JSON.stringify(theirsNote.author))

// ⚠️ The write is fire-and-forget on the store's SERIAL queue, so the row lands shortly after the call
// returns. Polled rather than slept-once: a fixed sleep is a race that passes on a fast day.
const waitFor = async (needle, tries = 40) => {
  for (let i = 0; i < tries; i += 1) {
    const rows = await q(`select id::text id, author, kind, user_id::text user_id, subject_person_id::text subj
                            from ${S}.txn_memories where content like $1`, [`%${needle}%`])
    if (rows.length) return rows
    await new Promise((r) => setTimeout(r, 250))
  }
  return []
}

const mineRows = await waitFor(`${stamp} · mine`)
const theirsRows = await waitFor(`${stamp} · theirs`)

ok(mineRows.length > 0, '2 · ⭐ the mine:true row actually landed', `${mineRows.length} row(s)`)
ok(mineRows.length > 0 && mineRows.every((r) => r.author === 'persona'),
  '2 · ⭐⭐⭐ …and the STORE says author=persona — her decision survived the write path',
  mineRows.map((r) => r.author).join(', '))
ok(theirsRows.length > 0 && theirsRows.every((r) => r.author === 'account'),
  '2 · ⭐ …and mine:false survived as account — the decision works in BOTH directions',
  theirsRows.map((r) => r.author).join(', '))

// ⭐ OWNERSHIP IS DERIVED, AND IT FOLLOWS THE AUTHOR SHE DECLARED — end to end, through the real
// `ownerOf()` rather than by re-reading the column this check just asserted.
const mineOwner = ownerOf({ kind: 'memory', author: mineRows[0]?.author })
const theirsOwner = ownerOf({ kind: 'memory', author: theirsRows[0]?.author })
ok(String(mineOwner).includes('sotera'), '2 · ⭐⭐ ownerOf() says the mine:true row is HERS', String(mineOwner))
ok(String(theirsOwner).includes('account'), '2 · ownerOf() says the mine:false row is the account\'s', String(theirsOwner))

// ── 3 · GUARANTEE TWO · ⛔ NEVER RE-SUBJECTED INTO A `user's …` SLOT ──────────────────────────────
//
// ⚠️⚠️ THIS IS THE HALF THAT ACTUALLY HAPPENED. Her sentence *"Ote (Dad/Creator): My father"* was typed by
// the observation pipeline into `entity=user attribute=soteras_family_lineage_and_key_relationships`.
// ⭐ The pipeline did its job — it types facts about the user — it was simply handed a SELF-CLAIM and had
// no way to know. ⇒ ABOUT ≠ OWNER.
ok(!mineRows.some((r) => r.kind === 'identity'),
  '3 · ⛔⛔ mine:true did NOT mint a kind=identity row — authorship is not scope',
  mineRows.map((r) => r.kind).join(', '))
ok(mineRows.every((r) => r.user_id === me.id),
  '3 · ⭐⭐ …and `user_id` is the ROOM IT WAS FORMED IN, still set — ⛔ not NULL',
  mineRows.map((r) => (r.user_id === me.id ? 'room' : String(r.user_id))).join(', '))
// ⛔ The live regression: a persona-authored row must not be sitting under a `user's …` attribute where
// only the account can find it. Scoped to rows this check created, so it reports on the NEW path rather
// than on the historical rows Ote has ruled untouchable.
const misfiled = await q(
  `select id::text id, attribute from ${S}.txn_memories
    where author = 'persona' and content like $1 and attribute ilike 'soteras\\_%'`, [`%${stamp}%`])
ok(misfiled.length === 0,
  '3 · ⭐⭐⭐ no persona-authored row landed in a `soteras_…` user slot',
  misfiled.map((r) => r.attribute).join(', ') || 'none')

// ── 4 · KIND AND OWNERSHIP MUST AGREE, AND DISAGREEMENT IS SAID OUT LOUD ──────────────────────────
// ⓘ A practice note is an observation about how SHE works; a lesson is something SHE learned. Both are
// hers by construction. ⛔ So `mine:false` there is a contradiction, and naming it beats silently
// honouring one half of a contradictory instruction.
const badPractice = await R.keep({ what: 'i-avoid-hedging', kind: KINDS.practice, mine: false })
ok(badPractice.ok === false && badPractice.refused === 'kind_conflicts_with_ownership',
  '4 · ⛔ practice + mine:false is refused as a contradiction, not silently made "mine"',
  String(badPractice.refused))
const badLesson = await R.keep({ what: 'something learned', kind: KINDS.lesson, mine: false })
ok(badLesson.ok === false && badLesson.refused === 'kind_conflicts_with_ownership',
  '4 · ⛔ …and so is lesson + mine:false', String(badLesson.refused))

// ⛔ A fact needs its attribute, because a guessed slot name is exactly how a self-claim ended up in
// `soteras_family_lineage_and_key_relationships`.
const noAttr = await R.keep({ what: 'Bangkok', kind: KINDS.fact, mine: false, about: 'user' })
ok(noAttr.ok === false && noAttr.refused === 'fact_needs_attribute',
  '4 · ⛔ a fact with no attribute is refused rather than filed under an invented slot',
  String(noAttr.refused))

const unknownKind = await R.keep({ what: 'x', kind: 'whatever', mine: true })
ok(unknownKind.ok === false && unknownKind.refused === 'unknown_kind',
  '4 · ⛔ an unknown kind is refused — the vocabulary is closed', String(unknownKind.refused))
ok(Array.isArray(unknownKind.kinds) && unknownKind.kinds.length === 4,
  '4 · ⭐ …and the refusal NAMES the kinds, so it teaches instead of just failing',
  (unknownKind.kinds ?? []).join(', '))

// ── 5 · ABOUT ≠ OWNER · the axis the design turns on ──────────────────────────────────────────────
// ⭐ A fact she keeps as HERS about somebody else: subject is them, author is her. This is the exact
// shape of the family-lineage material, written correctly.
const aboutOther = await R.keep({
  what: `${stamp} · what I make of him`, kind: KINDS.fact, mine: true, about: 'Ote', attribute: 'how_I_see_him',
})
ok(aboutOther.ok === true && aboutOther.author === 'persona',
  '5 · ⭐⭐⭐ a fact ABOUT someone else, kept as HERS, is persona-authored', JSON.stringify(aboutOther.author))
// ── 5b · ⭐⭐⭐ AN UNSTATED SUBJECT FOLLOWS `mine`, NOT "the user" ─────────────────────────────────
// ⚠️⚠️ MEASURED LIVE 2026-08-26, on the FIRST row the follow-through ever produced. She kept a
// self-observation with `mine:true` and no `about`; the entity defaulted to `'user'`, and a row reading
// *"I tend to deflect personal praise toward the work"* was filed as **`user's reaction_to_praise`**
// with `author='persona'`. ⛔ The family-lineage shape, rebuilt by the code written to prevent it.
const selfFact = await R.keep({
  what: `${stamp} · I deflect praise toward the work`, kind: KINDS.fact, mine: true, attribute: 'reaction_to_praise',
})
ok(selfFact.ok === true, '5b · a self-fact with no `about` is accepted', JSON.stringify(selfFact.ok))
const selfRows = await waitFor(`${stamp} · I deflect praise`)
const selfEntities = await q(
  `select entity, attribute, author from ${S}.txn_memories where content like $1`, [`%${stamp} · I deflect praise%`])
ok(selfEntities.length > 0 && selfEntities.every((r) => r.entity !== 'user'),
  '5b · ⭐⭐⭐ …and it is NOT filed under `user` — an unstated subject follows `mine`',
  selfEntities.map((r) => `${r.entity}/${r.author}`).join(', ') || 'no row')
ok(selfRows.length > 0 && selfRows.every((r) => r.author === 'persona'),
  '5b · ⭐ …while the author is still the one she declared', selfRows.map((r) => r.author).join(', '))
// ⛔ AND AN EXPLICIT `about` STILL WINS — the default must not quietly swallow ABOUT ≠ OWNER.
const aboutRows = await waitFor(`${stamp} · what I make of him`)
ok(aboutRows.length > 0 && aboutRows.every((r) => r.author === 'persona'),
  '5 · ⭐⭐ …and the store agrees — ABOUT ≠ OWNER, end to end',
  aboutRows.map((r) => r.author).join(', ') || 'no row')

// ── 6 · THE FRONT DOOR DID NOT DEMOLISH ANYTHING ──────────────────────────────────────────────────
// ⛔ `keep` is a front door. If it ever becomes the ONLY door, the specialised operations on existing
// memory (forget / pin / restore) go with it, and those are not acts of retention at all.
const memPkg = readFileSync(new URL('../../../../PortableComponents/Packages/Memory/index.js', import.meta.url), 'utf8')
for (const t of ['remember', 'remember_fact', 'forget_memory', 'pin_memory', 'restore_memory']) {
  ok(memPkg.includes(`name: '${t}'`), `6 · ⛔ ${t} still exists underneath`, t)
}
const lessonPkg = readFileSync(new URL('../../../../PortableComponents/Tools/Lesson/index.js', import.meta.url), 'utf8')
ok(lessonPkg.includes("name: 'decline_to_remember'"),
  '6 · ⭐⭐ decline_to_remember still exists — choosing NOT to keep something stays a real answer')

// ── 7 · THE TOOL DESCRIPTION NAMES NO OCCASION ────────────────────────────────────────────────────
// ⚠️ The measured result behind this: priming her with a decision procedure holds her labels and LOWERS
// her insight. `retrieve_conversations` carries the same constraint and this is its twin.
const toolSrc = readFileSync(new URL('../../../../PortableComponents/Tools/Retention/index.js', import.meta.url), 'utf8')
// ⛔ COMMENTS STRIPPED, STRING LITERALS KEPT — the file's own prose discusses the very words being
// banned, so an unstripped scan would match its own documentation and fail vacuously. The description IS
// a string literal, so the polarity follows where the truth lives.
const desc = toolSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')
ok(/name: 'keep'/.test(desc), '7 · ⛔ ANCHOR: the scan can still see the tool — an empty scan is not a pass')
for (const phrase of ['you should', 'always ', 'make sure you', 'be sure to', 'as often as']) {
  ok(!new RegExp(phrase, 'i').test(desc), `7 · ⛔ the description does not say "${phrase.trim()}"`)
}

// ── 8 · ⭐⭐ THE CHECK CLEANS UP AFTER ITSELF ──────────────────────────────────────────────────────
// ⚠️ 2026-08-26's lesson, applied to this file rather than only written down: a measurement that leaves
// its own rows behind is measuring a store it changed. These rows are hers, in her store, and every one
// of them is a fabricated "memory" that never happened.
// ⛔ BY THE EXACT STAMP, never by a time window or a LIKE on prose — the stamp is unique to this process
// and cannot match anything real. The deletion is asserted, because a cleanup nobody verifies is a
// cleanup that silently stopped working.
const { rowCount: removed } = await pg.query(
  `delete from ${S}.txn_memories where content like $1`, [`%${stamp}%`])
const leftovers = await q(`select id::text id from ${S}.txn_memories where content like $1`, [`%${stamp}%`])
ok(leftovers.length === 0, '8 · ⭐ every row this check wrote is gone — it does not accumulate in her store',
  `${removed} removed, ${leftovers.length} left`)
// ⛔ AND THE ORPHANED INDEX ROWS TOO. An orphan embedding still carries the vector and stays a retrieval
// candidate, which is precisely how a deleted fixture went on outranking her real conversations.
const { rowCount: orphans } = await pg.query(
  `delete from ${S}.txn_message_embeddings e
    where not exists (select 1 from ${S}.txn_messages m where m.id = e.message_id)`)
ok(true, '8 · ⓘ orphan embedding sweep', `${orphans} swept`)

await pg.end()
done()
