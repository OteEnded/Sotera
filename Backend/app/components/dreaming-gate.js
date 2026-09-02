// ⭐⭐⭐ THE DREAMING GATE — one predicate, and it decides whether Dreaming EXISTS in this process.
//
// PURE. No stores, no IO, no database, no settings lookup. It takes a config object and returns a
// boolean. That is the whole file, and the smallness is the point: this is the only thing standing
// between "Dreaming is code that exists" and "Dreaming is a job that runs".
//
// ── ⛔⛔ WHY IT READS `config` AND NOTHING ELSE ───────────────────────────────────────────────────
// `mst_settings` OVERRIDES `config.json` for effective settings elsewhere in this app — that is what
// `getSetting()` is for, and it is correct for the settings it governs. ⚠️ But it means a gate that read
// the EFFECTIVE setting could be flipped from the admin surface: one row, no restart, no review, and
// Dreaming starts running against the live corpus.
//
// ⇒ ⭐ this predicate is never handed `fastify.db`, so it CANNOT consult the settings table. Activation
// therefore costs **a config.json edit AND a restart** — two deliberate acts, neither available from the
// UI. Ote, 2026-09-02: *"The setting must remain explicitly off/absent until we make a separate decision
// to activate real Dreaming."* ⛔ That is a structural guarantee here, not a promise.
//
// ── ⛔ AND IT IS `=== true`, NOT TRUTHINESS ──────────────────────────────────────────────────────
// A config value can arrive as the STRING `"true"`, as `1`, as `"1"`, or as `"yes"` — from a hand-edited
// file, an env-var overlay, or a JSON round trip. Every one of those is truthy, and every one of them
// would silently activate Dreaming on somebody's typo. ⭐ Only the boolean counts, and
// `dreaming-m1-check` attacks this with all of them.

/**
 * ⭐ May the Dreaming cron job be REGISTERED in this process?
 *
 * ⛔ Registration, not permission-to-run: when this returns false the job is never created at all —
 * it is not a job that fires and returns early. A job that exists and no-ops still appears in the
 * scheduler, still has to be reasoned about, and is one edited line from being live.
 *
 * @param {object|null|undefined} config  the deployment config (`fastify.config`), ⛔ never the
 *                                        effective/merged settings
 * @returns {boolean} true ONLY for the boolean `true`
 */
export function dreamingCronEnabled(config) {
  return config?.memory?.dreamingEnabled === true
}

/** ⛔ Exported so a check can assert the INTENT, not merely the comparison. */
export const DREAMING_IS_OFF_UNTIL_TWO_DELIBERATE_ACTS =
  'Dreaming is registered only when config.memory.dreamingEnabled is the boolean true. The predicate is '
  + 'never given a database handle, so it cannot read mst_settings and cannot be switched on from the '
  + 'admin surface -- activation costs a config file edit and a restart. Anything else, including the '
  + 'string "true", leaves the job unregistered rather than registered-and-inert.'
