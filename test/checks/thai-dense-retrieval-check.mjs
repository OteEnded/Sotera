// THAI END-TO-END — does Conversation Search actually retrieve Thai content, and which ARM answered?
//
//   node checks/thai-dense-retrieval-check.mjs
//
// ⚠️ THE POINT IS `mode`, NOT THE HIT. The lexical arm cannot tokenise Thai — `to_tsvector('english', …)`
// turns a whole Thai clause into ONE token, so a word query never matches (measured 2026-08-19). A result
// that came back lexically would therefore be a FALSE PASS. This check fails unless the dense arm ran.
//
// Read-only: runs queries, writes nothing.

import { initDB } from '../../Backend/database/index.js'
import { setDB, loadConfig } from '../../Backend/lib/utility.js'
import { rebuildProviderRegistry } from '../../Backend/app/adapters/registry.js'
import { initSettings } from '../../Backend/app/settings/index.js'
import { buildConversationSearch } from '../../Backend/app/components/conversation-search.js'
import { makeEmbedder } from '../../Backend/app/components/memory-embed-host.js'

const config = loadConfig()
const db = await initDB()
setDB(db)
await rebuildProviderRegistry({ db, config })
await initSettings(db)
const fastify = { db, config }
const seq = db.txn_messages.sequelize
const Q = (sql, replacements) => seq.query(sql, { replacements, type: seq.QueryTypes.SELECT })

let pass = 0; let fail = 0
const ok = (cond, label, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`)
  cond ? pass++ : fail++
}

const [{ id: userId }] = await Q("select id from persona_sotera.mst_users where username = 'kavi'")

// ── 0. Is there Thai content, and is it embedded? ────────────────────────────────────────────────
const thai = await Q(`select m.id, m.content from persona_sotera.txn_messages m
  join persona_sotera.txn_conversations c on c.id = m.conversation_id
  where c.user_id = :userId and m.content ~ '[\\u0E00-\\u0E7F]' and length(m.content) >= 50`, { userId })
ok(thai.length > 0, 'Thai messages exist for this user', `${thai.length} rows`)
// ⚠️ `IN (:ids)`, not `any(:ids::uuid[])` — Sequelize expands a bound array into a comma list, which
// makes `any(...)` a syntax error rather than a wrong answer. Loud failure, at least.
const embedded = await Q(`select count(*)::int n from persona_sotera.txn_message_embeddings
  where message_id IN (:ids)`, { ids: thai.map((t) => t.id) })
ok(embedded[0].n === thai.length, 'every Thai message is embedded', `${embedded[0].n}/${thai.length}`)

// ── 1. ⭐ The lexical arm CANNOT do this — establish the baseline the dense arm has to beat ───────
const TERM = 'ข้าวผัด' // not present; use a term that IS present instead:
const PRESENT = 'connection pool' // English, present in the Thai-language message
const lex = await Q(
  `select count(*)::int n from persona_sotera.txn_messages m
     where m.content_tsv @@ plainto_tsquery('english', :q) and m.id IN (:ids)`,
  { q: 'หุ่นยนต์', ids: thai.map((t) => t.id) },
)
ok(lex[0].n === 0, '⭐ lexical arm finds NOTHING for a Thai word (the defect this check exists for)', `${lex[0].n} hits`)
void TERM; void PRESENT

// ── 2. ⭐ END-TO-END through the real component, and the ARM must be dense ───────────────────────
const search = buildConversationSearch(fastify, {
  userId, currentConversationId: null, embed: makeEmbedder(fastify, { userId }),
})
// A Thai query using words that appear INSIDE her Thai messages.
for (const q of ['connection pool หลุดตอน deploy', 'ปัญหาเรื่อง deploy กับ timeout']) {
  const r = await search.search(q, { limit: 5, minLength: 20 })
  const modes = String(r.mode || '')
  console.log(`\n  query: "${q}"  → mode=${modes} count=${r.count}`)
  for (const e of (r.evidence || []).slice(0, 3)) {
    console.log(`     · ${String(e.excerpt || '').replace(/\s+/g, ' ').slice(0, 110)}`)
  }
  ok(r.count > 0, `retrieval returned evidence for a Thai query`, `${r.count} items`)
  // ⚠️ THIS ASSERTION FALSE-PASSED ON ITS FIRST RUN, 2026-08-19. It was `/dense|hybrid/`, and the
  // component reports `mode=lexical+empty-dense` when the dense arm RAN AND MATCHED NOTHING — so the
  // regex matched the substring "dense" inside "empty-dense" and called a total dense failure a pass.
  // Same family as the F6 regex that could not tell "I am stateless" from "I am not stateless":
  // a matcher that keys on a WORD rather than on the CLAIM.
  ok(/\bhybrid\b/i.test(modes) || (/\bdense\b/i.test(modes) && !/empty-dense/i.test(modes)),
    '⭐ the DENSE arm CONTRIBUTED — "empty-dense" means it ran and matched nothing, which is a FAILURE',
    `mode=${modes}`)
}

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : `✖ ${fail} FAILED`}  (${pass} passed)`)
process.exit(fail === 0 ? 0 : 1)
