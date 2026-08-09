// WRITING config.json FROM THE RUNNING SERVER — narrowly, safely, and only for keys the platform can
// legitimately own.
//
// Ote, 2026-08-06: *"not 'util you run' / util for server to run edit config"*. The long-standing rule
// was that config.json is root's file and the platform never writes it. He has overruled that for this
// case, and he is right that a warning nobody can act on automatically is a loop that never closes:
// the server knows the row id, so making a human copy it by hand is ceremony, not safety.
//
// ── WHAT MAKES IT SAFE ENOUGH TO DO AT BOOT ────────────────────────────────────────────────────────
// The real hazard was never "writing" — it is being INTERRUPTED while writing the file that holds
// root's credentials, which would leave the platform unbootable and the owner locked out. So:
//
//   1. ATOMIC REPLACE. The new text is written to a temp file in the SAME directory and then renamed
//      over the original. rename() within one filesystem is atomic, so a crash at any instant leaves
//      either the old file or the new one — never a half-written one. This is the safeguard that
//      actually removes the risk; the rest are belt and braces.
//   2. BACKUP FIRST — config.json.bak.<timestamp> beside it, before anything is written.
//   3. SURGICAL TEXT EDIT, not JSON.stringify. The key is spliced into the existing block so every
//      other byte, the formatting and the key order survive exactly. Re-serialising would quietly
//      reformat a file the owner hand-maintains, and a diff full of noise hides a real change.
//   4. VALIDATE BEFORE COMMIT. The edited text must parse AND still carry byte-identical
//      username/password before it is allowed to replace anything. If not, nothing is written.
//
// ⚠️ SCOPE IS DELIBERATELY ONE NAMED KEY, NOT A PATH ARGUMENT. This module sets
// `auth.root.userConnected` and nothing else. A general "server edits its own config" primitive is how
// a settings console ends up silently owning a file a human still hand-edits. A second case would get
// its own function and its own justification — never a `key` parameter.
//
// ⚠️ A SECOND CASE WAS ADDED AND THEN REMOVED THE SAME DAY, 2026-08-07 — worth knowing before proposing
// another. `setRootDisplayName` was written so root could rename itself from the console, on the
// reasoning that a display name is not a credential and so qualifies under the rule above. It was the
// wrong question: Ote — *"didnt root have connected user record? why wont we save to that user record
// on db?"* — root's user row ALREADY held `display_name`, so the writer was creating a second copy of a
// value the database owned, and a rename left the row stale (measured: config said "DIVERGENCE TEST"
// while `/v1/admin/users` still said "Ote"). His call: *"no need to save displayname to config, it
// should came from db"*.
// ⇒ **BEFORE ADDING A CASE HERE, CHECK WHETHER THE VALUE ALREADY HAS A HOME.** "Is this key safe to
// write?" is the easy question and it was answerable yes; "does this key belong in this file at all?"
// is the one that mattered.

import { readFileSync, writeFileSync, copyFileSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { log } from '../../lib/utility.js'

// ⚠️ EVERY OUTCOME IS LOGGED FROM IN HERE, NOT FROM THE CALLER — Ote, 2026-08-06:
// *"everytime server use util to update config. mush log … i mean debug.log with warning. alway"*.
// Logging at the call site would mean each future caller has to remember, and one that forgets makes
// the platform edit root's own config file silently. The writer is the only place that knows what
// actually happened, so it is the only place that can promise the record exists.
//
// WARN even on success, deliberately. This is not a routine event: the platform rewrote a file the
// owner hand-maintains. "It worked" is exactly the case that must still be visible afterwards — an
// info line is what gets scrolled past when someone is trying to explain why a config changed.
// Fire-and-forget on purpose: a logging failure must never be able to fail a config write that has
// already been committed to disk.
// ⚠️ THE LEVEL STRING IS 'warning', NOT 'warn'. lib/utility.js validates against
// log_levels = ["info","warning","error"] and SILENTLY FALLS BACK TO "info" on anything else — so the
// first cut of this file passed 'warn', every audit line came out [INFO], and the "always log a
// warning" requirement was quietly not met while looking like it was. Caught by reading the emitted
// log rather than trusting the call.
const audit = (level, msg) => { try { void log(`[config-writer] ${msg}`, level, import.meta.url) } catch { /* logging must never break the write */ } }

/**
 * Set `auth.root.userConnected` in config.json, atomically.
 * @param {string} configPath absolute path to config.json
 * @param {string} id uuid of root's user row
 * @returns {{ok:boolean, wrote:boolean, backup?:string, reason?:string}}
 */
export function setRootUserConnected(configPath, id) {
  // every refusal is audited too — a config write the platform DECLINED to make is exactly as
  // important to have on record as one it made, and harder to reconstruct later.
  const fail = (reason) => { audit('warning', `refused to write auth.root.userConnected: ${reason}`); return { ok: false, wrote: false, reason } }
  let raw
  try { raw = readFileSync(configPath, 'utf8') } catch (e) { return fail(`cannot read config: ${e.message}`) }

  let cfg
  try { cfg = JSON.parse(raw) } catch (e) { return fail(`config is not valid JSON: ${e.message}`) }
  const root = cfg?.auth?.root
  if (!root?.username) return fail('auth.root.username missing')
  if (String(root.userConnected || '').toLowerCase() === String(id).toLowerCase()) {
    audit('info', `no write needed — auth.root.userConnected already ${id}`)
    return { ok: true, wrote: false, reason: 'already connected' }
  }

  // --- surgical splice -----------------------------------------------------------------------
  let next
  if (/"userConnected"\s*:/.test(raw)) {
    next = raw.replace(/"userConnected"\s*:\s*("[^"]*"|null)/, `"userConnected": ${JSON.stringify(id)}`)
  } else {
    const m = raw.match(/("root"\s*:\s*\{)(\r?\n)([ \t]*)/)
    if (!m) return fail('could not locate the "root": { block')
    next = raw.replace(m[0], `${m[1]}${m[2]}${m[3]}"userConnected": ${JSON.stringify(id)},${m[2]}${m[3]}`)
  }

  // --- validate BEFORE anything touches disk -------------------------------------------------
  let check
  try { check = JSON.parse(next) } catch (e) { return fail(`edit produced invalid JSON: ${e.message}`) }
  if (check?.auth?.root?.username !== root.username || check?.auth?.root?.password !== root.password) {
    return fail('edit would alter root credentials — REFUSED')
  }
  if (check?.auth?.root?.userConnected !== id) return fail('edit did not take')

  // --- backup, then atomic replace -----------------------------------------------------------
  const dir = dirname(configPath)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = join(dir, `${basename(configPath)}.bak.${stamp}`)
  const tmp = join(dir, `.${basename(configPath)}.tmp-${process.pid}`)
  try {
    copyFileSync(configPath, backup)
    writeFileSync(tmp, next, 'utf8')
    renameSync(tmp, configPath) // atomic within the same filesystem
  } catch (e) {
    try { unlinkSync(tmp) } catch { /* temp may not exist */ }
    audit('error', `WRITE FAILED for auth.root.userConnected — config left untouched (backup: ${backup}): ${e.message}`)
    return { ok: false, wrote: false, backup, reason: `write failed: ${e.message}` }
  }
  audit('warning', `WROTE auth.root.userConnected = ${id} into ${configPath} (backup: ${backup})`)
  return { ok: true, wrote: true, backup }
}
