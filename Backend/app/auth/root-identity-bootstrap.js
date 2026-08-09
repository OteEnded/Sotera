// BOOT-TIME RECONCILIATION of root's user record (Ote, 2026-08-06: *"when userConnected resolves to
// 'no row', server auto run root user record create pipline, and console log warning about this"*).
//
// ⚠️ THE SERVER CANNOT WRITE config.json — that file is root's own ("config.json = platform DEFAULTS
// (root's file; never written by the console)"). So auto-create CANNOT close the loop by itself: it can
// guarantee the ROW exists, but only Ote can point config at it. That constraint decides the whole
// design below.
//
// ⚠️ WHICH IS WHY IT IS FIND-OR-CREATE BY USERNAME, NOT CREATE. If it simply created a row whenever
// config resolved to "no row", then with `userConnected` unset — the normal state until it is pasted —
// EVERY BOOT WOULD MINT ANOTHER ORPHAN ROW. Idempotence is not a nicety here, it is the only thing
// standing between this feature and an unbounded pile of dead root accounts.
//
// It never throws and never blocks boot. A platform that refuses to start because a reconciliation
// step failed is worse than one that starts and says loudly what is wrong.

import { fileURLToPath } from 'node:url'
import { rootUserIdFrom, rootUserIdProblem } from './root-identity.js'
import { setRootUserConnected } from '../config/config-writer.js'

const CONFIG_PATH = fileURLToPath(new URL('../../config.json', import.meta.url))

const IMPOSSIBLE_HASH = 'x-root-authenticates-from-config-not-this-row'

/**
 * Ensure root has a user row, and report how config lines up with it.
 * Returns a summary for the caller to log/expose; never throws.
 * @returns {Promise<{state:string, id:string|null, message:string}>}
 *   state: 'connected' | 'needs-config' | 'stale-config' | 'not-configured' | 'error'
 */
export async function reconcileRootUserRecord(fastify) {
  const cfgRoot = fastify?.config?.auth?.root
  const username = cfgRoot?.username
  if (!username) return { state: 'error', id: null, message: 'auth.root.username is not set — cannot reconcile root' }

  try {
    const configured = rootUserIdFrom(fastify.config)
    const problem = rootUserIdProblem(fastify.config)

    // Does the configured id actually resolve to a live row?
    let row = configured ? await fastify.db.mst_users.findByPk(configured) : null
    if (row && row.is_active) {
      return { state: 'connected', id: row.id, message: `root is connected to user row ${row.id} (${row.username})` }
    }

    // Either nothing is configured, or it points at a row that is missing/inactive. Either way the row
    // itself must exist — found by USERNAME, so re-running is idempotent and cannot pile up duplicates.
    const [found] = await fastify.db.mst_users.findOrCreate({
      where: { username },
      defaults: {
        username,
        display_name: cfgRoot.displayName || 'Ote',
        // ⚠️ NOT a bcrypt hash, deliberately. bcrypt.compare against a non-bcrypt string is always
        // false, so this row can never become a second, weaker way into root. Root authenticates from
        // config.json and only from config.json.
        password_hash: IMPOSSIBLE_HASH,
        is_active: true,
      },
    })

    // ── CLOSE THE LOOP: write the key ourselves (Ote's call, 2026-08-06) ──────────────────────────
    // A warning nobody can act on automatically is a loop that never closes — the server already knows
    // the id, so making a human retype it is ceremony, not safety. The write is atomic (temp + rename),
    // backed up, surgical and validated before commit; see app/config/config-writer.js.
    // ⚠️ The in-memory config is updated too, so the running process agrees with the file without a
    // restart. Without that, this boot would keep believing root is unconnected.
    const wrote = setRootUserConnected(CONFIG_PATH, found.id)
    if (wrote.ok && wrote.wrote) {
      if (fastify.config?.auth?.root) fastify.config.auth.root.userConnected = found.id
      return { state: 'auto-connected', id: found.id, backup: wrote.backup,
        message: `root had no usable userConnected — wrote ${found.id} into config.json (backup: ${wrote.backup})` }
    }
    const why = wrote.reason ? ` (${wrote.reason})` : ''
    if (problem) {
      return { state: 'stale-config', id: found.id, message: `${problem} — a usable row exists at ${found.id}; could not write config${why}` }
    }
    if (configured) {
      return { state: 'stale-config', id: found.id, message: `auth.root.userConnected points at ${configured}, which is missing or inactive — a usable row exists at ${found.id}; could not write config${why}` }
    }
    return { state: 'needs-config', id: found.id, message: `root has no userConnected yet — a usable row exists at ${found.id}; could not write config${why}` }
  } catch (e) {
    return { state: 'error', id: null, message: `root reconciliation failed: ${e?.message || e}` }
  }
}

/** Log the reconciliation result at a level that matches how much it matters. */
export function logRootReconciliation(fastify, res) {
  const line = (s) => fastify?.log?.warn ? fastify.log.warn(s) : console.warn(s)
  if (res.state === 'connected') {
    fastify?.log?.info?.(`[root] ${res.message}`)
    return
  }
  // The loop closed by itself. Still a WARN, not info: the platform edited root's own config file, and
  // that is something the owner must see in the log rather than discover in a diff later.
  if (res.state === 'auto-connected') {
    line('')
    line('⚠️  ROOT USER RECORD WAS AUTO-CONNECTED')
    line(`    ${res.message}`)
    line('    Root still authenticates from config.json exactly as before — this only records WHICH')
    line('    user row root owns. The previous config was backed up beside it.')
    line('')
    return
  }
  if (res.state === 'error') { line(`⚠️  [root] ${res.message}`); return }

  // needs-config / stale-config: the platform is FINE (root still logs in from config as it always has)
  // but a human action is outstanding, so say exactly what to paste rather than just flagging a state.
  line('')
  line('⚠️  ROOT USER RECORD IS NOT CONNECTED')
  line(`    ${res.message}`)
  line('    Root still logs in from config.json exactly as before — nothing is broken.')
  line('    To connect it, add this to Backend/config.json → auth.root :')
  line(`        "userConnected": "${res.id}"`)
  line('')
}
