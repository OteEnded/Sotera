import fp from 'fastify-plugin'
import { cronManager, log } from '../../lib/utility.js'
import { runUsageRetention, runLogRetention, pruneEmbeddingCache } from '../usage/retention.js'
import { decayMemories } from '../components/memory-maintenance-host.js'
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

    // ── ⭐⭐ EVERY 5 MINUTES · MESSAGE EMBEDDING, SO A CONVERSATION IS SEARCHABLE WHILE IT MATTERS ────
    // Measured 2026-08-20 and it broke the loop we are building: Sotera formed a lesson, and TWO HOURS
    // LATER, in the same room, could not find the conversation that produced it. Conversation Search
    // searched three times and missed it. Cause: the dense arm's embeddings rode ONLY the 04:00 pass
    // above — newest embedding row 08-19 21:12 against a newest message of 08-20 09:00 — so **today's
    // conversations were not densely searchable until tonight.**
    //
    // ⚠️ AND THE LEXICAL ARM CANNOT COVER FOR IT IN THAI: `to_tsvector` turns a whole Thai clause into one
    // token, so for her 70 Thai messages the dense arm is not an improvement, it is the ONLY arm.
    //
    // Ote: *"Don't leave this as a later optimization. We need a conversation to become searchable soon
    // enough that the next turn can actually use what happened."*
    //
    // ⭐ WHY THIS IS CHEAP ENOUGH TO RUN AT THIS RATE, which is the only reason it is safe:
    //   · `drainPendingEmbeddings` is already **incremental, bounded per pass and resumable** — it was
    //     built to be interrupted, so a short interval is the shape it was designed for;
    //   · it is an EMBEDDER call, not an LLM call — no generation, and `memory.embeddingDevice` keeps it
    //     on the CPU by default, so it never evicts the chat model from VRAM (a GPU-placed aux model costs
    //     ~29s on the user's next turn — measured, and the reason every aux sibling runs at numGpu:0);
    //   · with nothing pending it is one indexed query and returns `{embedded:0}`, which is not logged.
    //
    // ⚠️ IT IS THE SAME FUNCTION THE DAILY PASS CALLS, deliberately — not a second writer and not a copy.
    // The daily tick stays as the catch-up for anything a restart or an error left behind.
    // ⚠️ And it is gated by the SAME setting (`memory.embedMessagesEnabled`) checked inside the drain, so
    // turning Conversation Search off still turns this off with it.
    const embedIntervalMin = (() => {
      const v = fastify.config?.memory?.embedIntervalMinutes
      return Number.isInteger(v) && v >= 1 && v <= 1440 ? v : 5
    })()
    cronManager.createJob('message-embed-fresh', `0 */${embedIntervalMin} * * * *`, async () => {
      try {
        const emb = await drainPendingEmbeddings(fastify)
        // ⛔ Log ONLY when it did something. At this rate a per-run line would bury every other signal in
        // the log — which is how a noisy job gets switched off and takes its usefulness with it.
        if (!emb.skipped && emb.embedded) await log(`[message-embed] (fresh) ${JSON.stringify(emb)}`, import.meta.url)
      } catch (e) {
        await log(`[message-embed] (fresh) error: ${e.message}`, import.meta.url)
      }
    }, { isLog: true })

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
