import fp from 'fastify-plugin'
import { cronManager, log } from '../../lib/utility.js'
import { runUsageRetention, runLogRetention, pruneEmbeddingCache } from '../usage/retention.js'
import { decayMemories } from '../components/memory-maintenance.js'
import { consolidateAll } from '../components/memory-consolidate-host.js'
import { distillAll } from '../components/memory-distill-host.js'
import { drainPendingEmbeddings } from '../components/conversation-search.js'
import { reflectAll, reflectMode } from '../components/reflection-host.js'
import { runHealthSuite } from '../maintenance/health-suite.js'
import { decayWorkingMemory } from '../components/working-memory-host.js'

export default fp(async function (fastify, opts) {

    // Usage retention: prune (optionally cold-dump first) usage rows past
    // usage.retentionDays. Daily at 04:10 + one pass shortly after boot, so a
    // server that isn't running at 04:10 still catches up.
    const retentionPass = async (trigger) => {
        if (!fastify.db) return
        const result = await runUsageRetention({ db: fastify.db, config: fastify.config })
        if (!result.skipped) {
            await log(`[usage-retention] (${trigger}) ${JSON.stringify(result)}`, import.meta.url)
        }
        // embeddings cache hygiene rides the same pass (independent of usage retention)
        const embed = await pruneEmbeddingCache({ db: fastify.db })
        if (embed.pruned || embed.error) {
            await log(`[embed-cache] (${trigger}) ${JSON.stringify(embed)}`, import.meta.url)
        }
        // debug-log retention (logs.retentionDays — log_requests grew to 132k rows before
        // this existed; Ote's pg tidy). Same daily pass, no cold storage.
        const logs = await runLogRetention({ db: fastify.db, config: fastify.config })
        if (!logs.skipped && (logs.requests || logs.messages || logs.error)) {
            await log(`[log-retention] (${trigger}) ${JSON.stringify(logs)}`, import.meta.url)
        }
        // persona memory v2 decay/archive: soft-remove never-used old noise, demote idle → cold
        try {
            const mem = await decayMemories(fastify.db, { config: fastify.config, log: fastify.log })
            if (!mem.skipped && (mem.archived || mem.demoted)) {
                await log(`[memory-decay] (${trigger}) ${JSON.stringify(mem)}`, import.meta.url)
            }
        } catch (e) {
            await log(`[memory-decay] (${trigger}) error: ${e.message}`, import.meta.url)
        }
        // L4 Working Memory idle-decay (WM2): CLEAR the working set of conversations gone cold
        // (memory.workingMemoryIdleDays). Cheap UPDATE — fine on boot + daily. Decay only clears.
        try {
            const wm = await decayWorkingMemory(fastify)
            if (!wm.skipped && wm.cleared) {
                await log(`[working-memory-decay] (${trigger}) ${JSON.stringify(wm)}`, import.meta.url)
            }
        } catch (e) {
            await log(`[working-memory-decay] (${trigger}) error: ${e.message}`, import.meta.url)
        }
        // persona memory v2 Phase-3 consolidation → Knowledge Cards (gated by memory.consolidateEnabled,
        // default OFF). Makes LLM calls, so it rides ONLY the scheduled daily tick, never the boot pass.
        if (trigger !== 'boot') {
            // EPISODE DISTILLER (gated by memory.episodeDistillEnabled, default OFF) — distill each
            // conversation's new messages into a 1-2 sentence event memory (kind=episodic). Runs BEFORE
            // consolidation so tonight's episodes can feed tonight's Cards. LLM calls → daily tick only.
            try {
                const epi = await distillAll(fastify)
                if (!epi.skipped && (epi.distilled || epi.errors || epi.truncated)) {
                    const { episodes, declined, ...summary } = epi // summary counts only — episode text is in the store
                    await log(`[memory-distill] (${trigger}) ${JSON.stringify(summary)}`, import.meta.url)
                }
            } catch (e) {
                await log(`[memory-distill] (${trigger}) error: ${e.message}`, import.meta.url)
            }
            try {
                const con = await consolidateAll(fastify)
                if (!con.skipped && (con.cards || con.truncated)) {
                    await log(`[memory-consolidate] (${trigger}) ${JSON.stringify(con)}`, import.meta.url)
                }
            } catch (e) {
                await log(`[memory-consolidate] (${trigger}) error: ${e.message}`, import.meta.url)
            }
            // Conversation Search CS2b: incrementally embed new messages into txn_message_embeddings so the
            // dense arm stays fresh (gated by memory.embedMessagesEnabled, default ON). Makes embedder
            // calls, so — like consolidation — it rides ONLY the scheduled daily tick, never the boot pass.
            try {
                const emb = await drainPendingEmbeddings(fastify)
                if (!emb.skipped && emb.embedded) {
                    await log(`[message-embed] (${trigger}) ${JSON.stringify(emb)}`, import.meta.url)
                }
            } catch (e) {
                await log(`[message-embed] (${trigger}) error: ${e.message}`, import.meta.url)
            }
            // Reflection (R2): distil L3 Persona Notes from grounded signals. memory.reflectMode gates it:
            // 'off' skip · 'shadow' propose + LOG only (inspect before trusting) · 'on' write. Makes LLM
            // calls → daily tick only. The cron is Reflection's FIRST trigger; the Feature runtime will
            // later call the same reflectScope on other events (we swap the trigger, not Reflection).
            const rMode = reflectMode(fastify.config)
            if (rMode !== 'off') {
                try {
                    const refl = await reflectAll(fastify, { dryRun: rMode === 'shadow' })
                    if (!refl.skipped) {
                        if (rMode === 'shadow') {
                            // SHADOW: log what it WOULD propose (per scope) — nothing was written.
                            if (refl.added) await log(`[reflection-shadow] (${trigger}) ${JSON.stringify({ scopes: refl.scopes, proposed: refl.added, details: refl.details })}`, import.meta.url)
                        } else if (refl.added || refl.trimmed) {
                            await log(`[reflection] (${trigger}) ${JSON.stringify({ scopes: refl.scopes, added: refl.added, trimmed: refl.trimmed })}`, import.meta.url)
                        }
                    }
                } catch (e) {
                    await log(`[reflection] (${trigger}) error: ${e.message}`, import.meta.url)
                }
            }
        }
    }
    cronManager.createJob('usage-retention', '0 10 4 * * *', () => retentionPass('daily'), { isLog: true })

    // ── 03:00 · THE HEALTH SUITE ────────────────────────────────────────────────────────────────────
    // OLS is FEATURE-FROZEN (2026-08-08) but still serving, and Sotera calls it as one of several API
    // providers — so a silent break shows up as HER behaving oddly, with the cause in a system nobody has
    // opened in weeks. This is the only thing watching. See maintenance/health-suite.js for why the tier
    // is default-only and why the settings snapshot is the real work.
    //
    // ⚠ 03:00 IS ONE HOUR BEFORE THE 04:00 PASS ABOVE, AND THE GAP IS LOAD-BEARING — not spacing. The
    // suite FLIPS GLOBAL SETTINGS and restores them; the 04:00 pass READS settings (reflectMode,
    // consolidateEnabled). Overlap means maintenance reads one mid-flip and quietly does the wrong thing
    // for a night. Ote's ordering: 01:00 Sotera · 03:00 this · 04:00 maintenance.
    //
    // ⚠ NO BOOT PASS, unlike retention. A restart is exactly when someone IS watching, and a 20-minute
    // suite firing on every boot would make restarts expensive for no signal.
    // Config-level, not a runtime setting: this is a DEPLOY decision (does this box watch itself?),
    // and it must not be flippable by the very suite it runs. Defaults OFF so no other deployment
    // silently starts spawning test runs; Ote's config.json turns it on.
    if (fastify.config?.maintenance?.healthSuiteEnabled === true) {
      cronManager.createJob('health-suite', '0 0 3 * * *', () => runHealthSuite(fastify).catch(() => {}), { isLog: true })
    }

    fastify.addHook('onReady', async () => {
        cronManager.startAll()
        const bootPass = setTimeout(() => { retentionPass('boot').catch(() => {}) }, 30_000)
        bootPass.unref?.() // don't hold the process open on shutdown
    })

    fastify.addHook('onClose', async () => {
        cronManager.stopAll()
    })

    // Decorate fastify with cronManager for easy access
    fastify.decorate('cronManager', cronManager)

})
