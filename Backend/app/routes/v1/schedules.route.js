// Schedules — user-owned scheduled skill-turns (Milestone ②, proactive personas).
//
// Who: roles with select_model (developer/power/admin/root) — members follow fixed models
// and are excluded, like BYOK. Cap per user via chat.maxSchedulesPerUser (0 = feature off).
// Everything is the CALLER's own rows (user_id scoping; root = null, its usual convention).
//
// GET    /chat/schedules            own jobs (live next-run merged from the TriggerService)
// POST   /chat/schedules            create { name, trigger, action, catchUp? }
// PATCH  /chat/schedules/:id        update fields; re-enabling resets the failure counter
// POST   /chat/schedules/:id/run    fire now (respects the overlap guard)
// DELETE /chat/schedules/:id        remove (trigger unregisters live)
// GET    /admin/schedules           root/admin read-only ops view (all users)

import { requireLogin } from '../../auth/index.js'
import { ownerIdOf, ownedBy } from '../../auth/owner.js'
import { requireCapability } from '../../auth/permissions.js'
import { getSetting } from '../../settings/index.js'
import { runtime, listSkills } from '../../components/runtime.js'
import { chat, parseModelRef, listAllModels } from '../../chat-runtime/index.js'
import { ensureChatApiKey } from '../../auth/chat-key.js'
import { checkTokenBudget } from '../../usage/limits.js'
import { loadRootPrefs } from './me-prefs.route.js'
import { defaultTriggerTz } from '../../schedules/tz-default.js'
import {
  initSchedules, jobView, jobTriggerId,
  createJob, updateJob, deleteJob, rotateHook, userMaySchedule, validateJobSpec,
} from '../../schedules/index.js'

export default async function schedulesRoutes(fastify) {
  fastify.addHook('preHandler', requireLogin())
  const chatCap = requireCapability('chat')

  // Per-TIER gate (root's chat.scheduleRoles lever) — not the old hardcoded select_model.
  const gate = (request, reply) => {
    if (!userMaySchedule(fastify.config, request.user)) {
      reply.code(403).send({ error: { code: 'schedules_locked', message: 'Your role tier is not allowed to create schedules.' } })
      return false
    }
    if ((getSetting(fastify.config, 'chat.maxSchedulesPerUser') || 0) <= 0) {
      reply.code(403).send({ error: { code: 'schedules_disabled', message: 'Scheduling is disabled on this platform.' } })
      return false
    }
    return true
  }

  const ownJob = async (request) => fastify.db.mst_trigger_jobs.findOne({
    where: { id: request.params.id, ...ownedBy(request.user, 'this schedule') },
  })

  fastify.get('/chat/schedules', { preHandler: chatCap }, async (request) => {
    const rows = await fastify.db.mst_trigger_jobs.findAll({
      where: ownedBy(request.user, 'your schedules'),
      order: [['created_at', 'ASC']],
    })
    return {
      schedules: rows.map(jobView),
      maxPerUser: getSetting(fastify.config, 'chat.maxSchedulesPerUser'),
      minIntervalMinutes: getSetting(fastify.config, 'chat.scheduleMinIntervalMinutes'),
      canSchedule: userMaySchedule(fastify.config, request.user) && (getSetting(fastify.config, 'chat.maxSchedulesPerUser') || 0) > 0,
      canHttp: request.user?.isRoot === true, // http actions originate from the server — root-only
      tools: runtime.listTools().map((t) => ({ id: t.manifest.id, description: t.manifest.description })),
    }
  })

  fastify.post('/chat/schedules', {
    preHandler: chatCap,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'trigger', 'action'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80 },
          trigger: { type: 'object' },
          action: { type: 'object' },
          catchUp: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    // ONE creation path shared with the create_schedule tool — gates, caps, validation
    // and webhook-token minting all live in createJob.
    const out = await createJob(fastify, request.user, request.body)
    if (out.error) return reply.code(out.error.status).send({ error: { code: out.error.code, message: out.error.message } })
    return reply.send({ schedule: out.schedule })
  })

  // ---- assist: natural-language create/edit. The model FILLS THE FORM, it never writes:
  // one non-stream side-call returns a strict-JSON spec, validated with the same
  // validateJobSpec as the write paths, then handed BACK as a proposal for the human to
  // review — the panel's normal POST/PATCH (the user clicking Save) is the only writer.
  fastify.post('/chat/schedules/assist', {
    preHandler: chatCap,
    schema: {
      body: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string', minLength: 1, maxLength: 2000 },
          scheduleId: { type: 'string', format: 'uuid' }, // present = edit MY schedule; absent = draft a new one
          model: { type: 'string', maxLength: 200 },      // the form's picked model interprets (falls back to platform default)
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    if (!gate(request, reply)) return
    // this endpoint spends real provider tokens — same kill-switch as suggest-title: an
    // admin-disabled chat account must not keep burning tokens through assist
    try {
      const key = await ensureChatApiKey(fastify.db, request.user, fastify.config)
      if (key && key.is_active === false) {
        return reply.code(403).send({ error: { code: 'chat_disabled', message: 'Chat access for this account has been disabled by an administrator' } })
      }
    } catch { /* key-ensure failed — the token budget below still caps spend */ }
    // ...and the same budget gate
    const limitHit = await checkTokenBudget(fastify, ownerIdOf(request.user, 'a token budget check'), request.log)
    if (limitHit) return reply.code(429).send({ error: { code: limitHit.code, message: limitHit.message, budget: limitHit.budget } })

    let current = null
    if (request.body.scheduleId) {
      const row = await fastify.db.mst_trigger_jobs.findOne({ where: { id: request.body.scheduleId, ...ownedBy(request.user, 'this schedule') } })
      if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'No such schedule.' } })
      if ((row.action?.type ?? 'skill-turn') !== 'skill-turn') {
        return reply.code(400).send({ error: { code: 'assist_unsupported', message: 'Prompt editing works for instruction schedules — tool/http jobs are edited by hand.' } })
      }
      current = { name: row.name, trigger: row.trigger, action: row.action, catchUp: row.catch_up === true }
    }

    // the asking user's zone — same source the executors use for run-time context
    let tz = null
    try {
      tz = request.user.id
        ? (await fastify.db.mst_users.findByPk(request.user.id, { attributes: ['id', 'chat_prefs'] }))?.chat_prefs?.timezone ?? null
        : (await loadRootPrefs(fastify.db))?.timezone ?? null
    } catch { /* zone stays unknown — the tz rail still inherits/passes through */ }

    const skills = listSkills(fastify.config).map((s) => `${s.id} (${s.name})`)
    const toolIds = runtime.listTools().map((t) => t.manifest.id)
    // The live catalog rails BOTH model choices here — gemma once hallucinated
    // "ollama/app/gemma4:26b" into a proposal and it poisoned the form (Ote-reported).
    // Root may PIN the interpreter via chat.scheduleAssistModel (empty = user's pick).
    // If the catalog itself is unreachable, fall through unvalidated rather than block.
    const known = new Set((await listAllModels({ serverConfig: fastify.config, userId: request.user?.id ?? null })).models.map((m) => m.id))
    const inCatalog = (id) => typeof id === 'string' && !!id && (known.size === 0 || known.has(id))
    const modelId = [
      getSetting(fastify.config, 'chat.scheduleAssistModel'),
      request.body.model,
      current?.action?.model,
      getSetting(fastify.config, 'chat.defaultModel'),
    ].find(inCatalog)
    if (!modelId) {
      return reply.code(502).send({ error: { code: 'assist_failed', message: 'No usable model to interpret the prompt — check the platform default model.' } })
    }
    const nowLine = tz
      ? `${new Date().toLocaleString('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' })} (${tz})`
      : new Date().toISOString()
    const sys = [
      'You fill in a schedule form. Output ONLY one JSON object — no prose, no code fences — shaped exactly:',
      '{"name": string, "trigger": TRIGGER, "action": {"skillId": string|null, "prompt": string, "model": "<provider>/<model>", "conversationId": string|null, "tools": [string] (optional)}, "catchUp": boolean, "summary": "one short sentence describing the resulting schedule"}',
      'TRIGGER is one of: {"type":"cron","expr":"<5-field cron>","tz":"<IANA zone>"} | {"type":"interval","every":"30m|2h|1d"} | {"type":"at","at":"<ISO datetime WITH utc offset>"} | {"type":"webhook"}',
      'Rules:',
      `- The user's local time right now: ${nowLine}. Wall-clock times in the request mean the user's zone — put it in trigger.tz (or the at offset). NEVER convert to UTC.`,
      '- Setting BOTH day-of-month and day-of-week means EITHER day matches (standard cron OR): "0 17 1 * 3" fires on the 1st of every month AND every Wednesday. Use that for combined monthly+weekly asks — never silently drop part of the request.',
      '- action.prompt runs later, executed by an assistant with no memory of this exchange: write it self-contained and ADDRESSED TO THAT ASSISTANT ("Remind the user to…", never "Remind me").',
      '- When a CURRENT schedule is given you are EDITING it: change only what the request asks, copy every other field unchanged (especially conversationId, model, skillId, tools).',
      `- skillId must be one of the installed skills, or null for a plain instruction. Installed: ${skills.length ? skills.join(', ') : '(none)'}`,
      `- Optional action.tools narrows the run to these installed tool ids: ${toolIds.join(', ')}`,
      `- Defaults when the request doesn't say: model "${modelId}", catchUp false, conversationId null (a new conversation per run) — never invent a conversation id.`,
    ].join('\n')
    const userMsg = (current ? `CURRENT schedule:\n${JSON.stringify(current)}\n\n` : '') + `Request: ${request.body.prompt}`

    let parsed = null
    const startedAt = Date.now()
    let usage = null
    try {
      const { provider, model } = parseModelRef({ model: modelId })
      const res = await chat({
        serverConfig: fastify.config,
        request: {
          provider, model,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: userMsg }],
          options: { stream: false, reasoning: { enabled: false }, max_tokens: 700 },
          userId: ownerIdOf(request.user, 'a schedule run'),
        },
      })
      usage = res?.usage ?? null
      const raw = (res?.message?.content || '').trim()
      const m = raw.match(/\{[\s\S]*\}/) // tolerate fences/preamble — take the outermost object
      parsed = m ? JSON.parse(m[0]) : null
    } catch (e) {
      return reply.code(502).send({ error: { code: 'assist_failed', message: `The assistant call failed: ${e?.message || e}` } })
    }
    if (!parsed || typeof parsed !== 'object') {
      return reply.code(422).send({ error: { code: 'assist_parse', message: "The assistant didn't produce a usable proposal — try rephrasing." } })
    }

    // normalize DEFENSIVELY: unknown fields dropped, missing fields inherited from the
    // current schedule (edit) or sane defaults (create); the tz rail applies as everywhere
    const p = parsed
    const action = {
      type: 'skill-turn',
      skillId: typeof p.action?.skillId === 'string' && p.action.skillId ? p.action.skillId : null,
      prompt: String(p.action?.prompt ?? current?.action?.prompt ?? '').slice(0, 4000),
      // a proposed model must EXIST — hallucinated ids fall back to the schedule's own, then the interpreter
      model: inCatalog(p.action?.model) ? p.action.model
        : (inCatalog(current?.action?.model) ? current.action.model : modelId),
      conversationId: p.action?.conversationId !== undefined ? (p.action.conversationId || null) : (current?.action?.conversationId ?? null),
      ...(Array.isArray(p.action?.tools) && p.action.tools.length
        ? { tools: p.action.tools }
        : (current?.action?.tools?.length ? { tools: current.action.tools } : {})),
    }
    // a hallucinated destination must not survive — only the current schedule's own
    // conversation (edit) may ride through; anything else falls back to "new per run"
    if (action.conversationId && action.conversationId !== (current?.action?.conversationId ?? null)) action.conversationId = null
    const trigger = defaultTriggerTz(p.trigger ?? current?.trigger ?? null, tz, current?.trigger ?? null)
    const name = String(p.name ?? current?.name ?? '').trim().slice(0, 80)
    const catchUp = typeof p.catchUp === 'boolean' ? p.catchUp : (current?.catchUp ?? false)
    if (!name) return reply.code(422).send({ error: { code: 'assist_invalid', message: 'The proposal had no name — try rephrasing.' } })
    const v = validateJobSpec(fastify.config, { trigger, action }, { isRoot: request.user?.isRoot === true })
    if (v.error) {
      return reply.code(422).send({ error: { code: 'assist_invalid', message: `The assistant proposed something invalid (${v.error.message}) — try rephrasing.` } })
    }

    try {
      await fastify.db.log_usage.create({
        user_id: ownerIdOf(request.user, 'a usage row'),
        api_key_id: null,
        provider: parseModelRef({ model: modelId }).provider, model: modelId, endpoint: 'chat.schedule-assist',
        prompt_tokens: usage?.promptTokens ?? null,
        completion_tokens: usage?.completionTokens ?? null,
        latency_ms: Date.now() - startedAt,
        request_body: JSON.stringify({ scheduleId: request.body.scheduleId ?? null }),
        response_body: null,
      })
    } catch { /* accounting must never break the endpoint */ }

    return reply.send({
      proposal: { name, trigger, action, catchUp },
      summary: typeof p.summary === 'string' && p.summary.trim() ? p.summary.trim().slice(0, 300) : null,
    })
  })

  fastify.patch('/chat/schedules/:id', {
    preHandler: chatCap,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80 },
          trigger: { type: 'object' },
          action: { type: 'object' },
          catchUp: { type: 'boolean' },
          enabled: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    // ONE edit path shared with the update_schedule tool — gates, validation, spent-one-shot
    // tolerance and the enable/disable semantics all live in updateJob.
    const out = await updateJob(fastify, request.user, request.params.id, request.body || {})
    if (out.error) return reply.code(out.error.status).send({ error: { code: out.error.code, message: out.error.message } })
    return reply.send({ schedule: out.schedule })
  })

  // Run history — the recent tail (the executor prunes at write time, so this IS the cap).
  fastify.get('/chat/schedules/:id/runs', { preHandler: chatCap }, async (request, reply) => {
    const row = await ownJob(request)
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'No such schedule.' } })
    const runs = await fastify.db.log_trigger_job_runs.findAll({
      where: { job_id: row.id },
      order: [['started_at', 'DESC'], ['rolling_id', 'DESC']],
    })
    // "conversation <uuid>" summaries get the human TITLE joined in at read time (a bare
    // uuid confuses users — Ote; titles also rename later, so resolving live stays
    // current). The raw summary still rides along for debugging. Deleted convo → null title.
    const summaryConvoId = (r) => /^conversation ([0-9a-f-]{36})$/i.exec(r.summary || '')?.[1] ?? null
    const convoIds = [...new Set(runs.map(summaryConvoId).filter(Boolean))]
    const titles = convoIds.length
      ? new Map((await fastify.db.txn_conversations.findAll({ where: { id: convoIds }, attributes: ['id', 'title'] }))
          .map((c) => [c.id, c.title || '(untitled)']))
      : new Map()
    return {
      runs: runs.map((r) => {
        const cid = summaryConvoId(r)
        return {
          id: r.id, startedAt: r.started_at, status: r.status,
          durationMs: r.duration_ms, summary: r.summary, error: r.error,
          conversation: cid ? { id: cid, title: titles.get(cid) ?? null } : null,
        }
      }),
    }
  })

  fastify.post('/chat/schedules/:id/run', { preHandler: chatCap }, async (request, reply) => {
    if (!gate(request, reply)) return
    const row = await ownJob(request)
    if (!row) return reply.code(404).send({ error: { code: 'not_found', message: 'No such schedule.' } })
    if (!row.enabled) return reply.code(400).send({ error: { code: 'disabled', message: 'Enable the schedule first.' } })
    const fired = runtime.triggers.fireNow(jobTriggerId(row.id))
    if (!fired) return reply.code(409).send({ error: { code: 'already_running', message: 'This schedule is already running (overlap guard).' } })
    return reply.send({ fired: true, taskId: fired.taskId })
  })

  // Renew a webhook fire URL — fresh token minted, the OLD URL dies immediately (the
  // leaked-URL remedy). Thin delegate like create/update/delete.
  fastify.post('/chat/schedules/:id/rotate-hook', { preHandler: chatCap }, async (request, reply) => {
    if (!gate(request, reply)) return
    const out = await rotateHook(fastify, request.user, request.params.id)
    if (out.error) return reply.code(out.error.status).send({ error: { code: out.error.code, message: out.error.message } })
    return reply.send({ schedule: out.schedule })
  })

  fastify.delete('/chat/schedules/:id', { preHandler: chatCap }, async (request, reply) => {
    const out = await deleteJob(fastify, request.user, request.params.id)
    if (out.error) return reply.code(out.error.status).send({ error: { code: out.error.code, message: out.error.message } })
    return { ok: true }
  })

  // ---- ops eyes: every schedule on the box (read-only) ----
  fastify.get('/admin/schedules', { preHandler: requireCapability('manage_users') }, async () => {
    const rows = await fastify.db.mst_trigger_jobs.findAll({
      order: [['created_at', 'ASC']],
      include: [{ association: 'owner', attributes: ['username'] }],
    })
    return { schedules: rows.map((r) => ({ ...jobView(r), username: r.owner?.username ?? 'root' })) }
  })

  // Boot wiring: executor + persisted-job load + the 30s tick (idempotent).
  await initSchedules(fastify)
}
