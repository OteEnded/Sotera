// BOOT + CONTRACT CHECK — the things that broke tonight, encoded so they cannot break silently.
//
// Every one of these assertions exists because it ACTUALLY WENT WRONG during the fold, not because it
// seemed prudent. In order: three relative paths that were short by one directory (she sits a level
// deeper than OteLLMServices), a schema that has to be HERS and not OLS's, a config that documented
// the wrong project, and an identity line that inherits "You are male" if left null.
//
// Run:  node checks/boot-check.mjs        (needs her server up on :8210)
import { readFileSync } from 'node:fs'
import { makeChecker, makeClient, devPg, devSchema, pgConfig, BASE } from '../harness.mjs'

const { check, done } = makeChecker()
const call = makeClient()
const cfg = JSON.parse(readFileSync(new URL('../../Backend/config.json', import.meta.url), 'utf8'))

// ── she is up, and she is HERSELF ────────────────────────────────────────────────────
const health = await call('anon', 'GET', '/api/health')
check('server answers /api/health', health.status === 200, `status ${health.status}`)
check('it identifies as Sotera, not OteLLMServices', health.json?.service === 'Sotera API', `got "${health.json?.service}"`)

// ── the database is HERS ─────────────────────────────────────────────────────────────
// The fold pointed OLS's 35 models at her schema. If config ever drifts back to ote_llm_services she
// would write into OteLLMServices' live tables, and nothing would fail loudly.
check('config names HER schema', devSchema() === 'persona_sotera', `schema=${devSchema()}`)
check('config names the shared database', pgConfig().database === 'ote_ai_toolbox', `db=${pgConfig().database}`)

const db = devPg()
await db.connect()
try {
  const S = devSchema()
  const t = await db.query(
    `select count(*)::int n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
     where ns.nspname=$1 and c.relkind='r'`, [S])
  check('her schema has tables', t.rows[0].n > 25, `${t.rows[0].n} tables`)

  // She must never carry the template's demo table — it was removed BEFORE her first boot precisely
  // so sync could not create it inside persona_sotera.
  const demo = await db.query(
    `select count(*)::int n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
     where ns.nspname=$1 and c.relname='template_items'`, [S])
  check('no template_items leaked into her schema', demo.rows[0].n === 0)

  // Every table follows the prefix canon. A bare table name means something bypassed the convention.
  const unprefixed = await db.query(
    `select c.relname from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
     where ns.nspname=$1 and c.relkind='r' and c.relname !~ '^(mst_|txn_|log_)'`, [S])
  check('every table carries mst_/txn_/log_', unprefixed.rows.length === 0,
    unprefixed.rows.map((r) => r.relname).join(', ') || 'all prefixed')
} finally {
  await db.end()
}

// ── identity: the null trap ──────────────────────────────────────────────────────────
// null does NOT mean "no identity" — it falls through to DEFAULT_ASSISTANT_IDENTITY. This is the one
// config value whose ABSENCE is a bug.
const ident = cfg.chat?.assistantIdentity
check('assistantIdentity is set (null falls through to the default)', typeof ident === 'string' && ident.length > 0)
check('...and it does not say she is male', !/\byou are male\b/i.test(ident || ''), ident?.slice(0, 60))

// ── ⚠️ THE DEFAULTS THEMSELVES — because they were PARETO'S, and they arrived by clone ──
// Checking the config alone was not enough. Until 2026-08-11 the fallbacks in context-composer.js were
// the OteLLMServices persona's (named Pareto that day), and one of them was LIVE, not latent:
// `chat.systemPrompt` is null, so every turn told her she ran "in Ote's LLM Services" — a service she
// does not run on. The identity fallback said "You are male … in a male voice", so clearing one config
// key would have silently made her Pareto. A default nobody reads is exactly where this hides.
const composer = readFileSync(new URL('../../Backend/app/components/context-composer.js', import.meta.url), 'utf8')
const grab = (name) => composer.slice(composer.indexOf(`export const ${name} =`)).split('\n').slice(0, 4).join(' ')
const defPrompt = grab('DEFAULT_SYSTEM_PROMPT')
const defIdent = grab('DEFAULT_ASSISTANT_IDENTITY')
check('DEFAULT_SYSTEM_PROMPT does not place her on another service', !/LLM Services|OteLLMServices|Pareto/i.test(defPrompt))
check('DEFAULT_ASSISTANT_IDENTITY is not male (a cleared setting must degrade to the truth)', !/\byou are male\b/i.test(defIdent))
check('...and names her', /\bSotera\b/.test(defIdent), defIdent.match(/'([^']*Sotera[^']*)'/)?.[1] || '')

// ── the paths that were each short by one directory ──────────────────────────────────
const pkg = JSON.parse(readFileSync(new URL('../../Backend/package.json', import.meta.url), 'utf8'))
check('SDK path is resolvable from HER depth (../../../)',
  pkg.dependencies?.['@ote/components-sdk'] === 'file:../../../OteAIComponentSDK',
  pkg.dependencies?.['@ote/components-sdk'])

const persona = JSON.parse(readFileSync(new URL('../../Backend/app/components/persona.json', import.meta.url), 'utf8'))
check('persona.json calls her Sotera, not ote-chat', persona.name === 'Sotera', `name=${persona.name}`)
const badSource = (persona.components || []).filter((c) => !String(c.source || '').startsWith('../../../../../PortableComponents/'))
check('all component sources resolve from her depth', badSource.length === 0,
  badSource.map((c) => c.name).join(', ') || `${persona.components.length} components`)

// ── BYOK is gone; the inbound key surface is NOT ─────────────────────────────────────
// These point in opposite directions and were nearly stripped together.
const byok = await call('anon', 'GET', '/v1/me/providers')
check('BYOK surface is removed', byok.status === 404, `status ${byok.status}`)

// ── the local runtime she owns natively ──────────────────────────────────────────────
const host = cfg.providers?.ollama?.host
check('she reaches Ollama natively (config, not via OLS)', /127\.0\.0\.1:11434/.test(host || ''), host)

done()
