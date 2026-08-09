import { randomUUID } from 'node:crypto'
import { createOllamaProvider } from '../../providers/ollama.js'

// Sotera's CHAT SITE — the UI-facing surface.
//
// ⚠️ NAMED chat-site DELIBERATELY, and there is no chat.route.js beside it. In OteLLMServices the
// OpenAI/Anthropic-standard API is a separate route with ZERO references to memory, persona,
// reflection or the composer — every memory write path is reachable only from the chat SITE. Memory
// comes from driving a UI, not from being an API client. Sotera emits her own API later, on purpose;
// until then, adding a standard API surface here would create a second entry point that silently
// bypasses everything that makes her herself.

const parseModelRef = (ref) => {
  const i = String(ref || '').indexOf('/')
  return i === -1 ? { provider: 'ollama', model: String(ref || '') } : { provider: ref.slice(0, i), model: ref.slice(i + 1) }
}

export default async function chatSiteRoutes(fastify) {
  const cfg = fastify.config || {}
  const providers = cfg.providers || {}
  const ollama = createOllamaProvider({ host: providers.ollama?.host, log: fastify.log })

  const resolveProvider = (name) => {
    if (name === 'ollama') return ollama
    // Shape (a): more adapters land here (OLS, OpenRouter, …). The runtime knows the INTERFACE, never
    // a URL or an auth scheme — so adding one is an addition, not a restructure.
    return null
  }

  /** Models she can actually reach right now. Honest about the local runtime being down. */
  fastify.get('/chat/models', async (request, reply) => {
    try {
      const models = await ollama.listModels()
      return { ok: true, models: models.map((m) => ({ ...m, id: `ollama/${m.id}` })), defaultModel: cfg.chat?.defaultModel }
    } catch (err) {
      // Ollama is Ote's and always-on; if it is unreachable that is worth saying plainly, not hiding.
      return reply.code(503).send({ ok: false, error: { code: 'local_runtime_unreachable', message: String(err.message || err) } })
    }
  })

  /** What is resident on the GPU. The manager does not exist yet — this is the window into it. */
  fastify.get('/chat/running', async (request, reply) => {
    try { return { ok: true, running: await ollama.running() } }
    catch (err) { return reply.code(503).send({ ok: false, error: { code: 'local_runtime_unreachable', message: String(err.message || err) } }) }
  })

  /**
   * One turn, streamed over SSE.
   *
   * The user turn is persisted BEFORE generation starts, so a crash mid-stream loses the reply and
   * never loses what the person said.
   */
  fastify.post('/chat/conversations/:id/messages', async (request, reply) => {
    const db = fastify.db
    const { id: conversationId } = request.params
    const { content, model: modelRef } = request.body || {}

    if (!content || !String(content).trim()) {
      return reply.code(400).send({ ok: false, error: { code: 'empty_content', message: 'Nothing to send.' } })
    }

    const convo = await db.TxnConversations.findByPk(conversationId)
    if (!convo) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Conversation not found.' } })

    const { provider: providerName, model } = parseModelRef(modelRef || cfg.chat?.defaultModel)
    const provider = resolveProvider(providerName)
    if (!provider) {
      return reply.code(400).send({ ok: false, error: { code: 'unknown_provider', message: `No adapter for "${providerName}".` } })
    }

    await db.TxnMessages.create({
      id: randomUUID(),
      conversation_id: convo.id,
      owner_user_id: convo.owner_user_id, // never null — the schema forbids it
      role: 'user',
      content: String(content),
    })

    const history = await db.TxnMessages.findAll({
      where: { conversation_id: convo.id },
      order: [['created_at', 'ASC']],
      attributes: ['role', 'content'],
    })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    const send = (event, data) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

    const assistantId = randomUUID()
    let answer = ''
    let reasoning = ''
    let metrics = null
    let usedModel = model

    try {
      send('start', { messageId: assistantId, model: `${providerName}/${model}` })
      for await (const ev of provider.chat({ model, messages: history.map((m) => ({ role: m.role, content: m.content })) })) {
        if (ev.type === 'delta') { answer += ev.content; send('delta', { content: ev.content }) }
        // Its own event and its own column. Reasoning is a different KIND of output from the reply,
        // not a prefix of it — merging them is how drafts end up quoted back as answers.
        else if (ev.type === 'reasoning') { reasoning += ev.content; send('reasoning', { content: ev.content }) }
        else if (ev.type === 'done') { metrics = ev.metrics; usedModel = ev.model || model }
      }
    } catch (err) {
      fastify.log.error({ err }, 'chat stream failed')
      send('error', { code: 'generation_failed', message: String(err.message || err) })
      reply.raw.end()
      return reply
    }

    // Persist AFTER the stream completes, then tell the client it is durable.
    // ⚠️ The client is told "saved" only once the row is committed — a queued write is not a saved
    // one, and claiming otherwise is exactly how OLS ended up saying "It's saved." on an ack.
    await db.TxnMessages.create({
      id: assistantId,
      conversation_id: convo.id,
      owner_user_id: convo.owner_user_id,
      role: 'assistant',
      content: answer,
      reasoning: reasoning || null,
      model: `${providerName}/${usedModel}`,
      metrics,
    })

    send('done', { messageId: assistantId, model: `${providerName}/${usedModel}`, metrics, persisted: true })
    reply.raw.end()
    return reply
  })

  /** Minimal conversation surface — enough to hold a turn. */
  fastify.post('/chat/conversations', async (request, reply) => {
    const db = fastify.db
    const { title, ownerUserId } = request.body || {}
    if (!ownerUserId) {
      return reply.code(400).send({ ok: false, error: { code: 'owner_required', message: 'Every row carries a real owner id.' } })
    }
    const convo = await db.TxnConversations.create({ id: randomUUID(), owner_user_id: ownerUserId, title: title || null })
    return reply.code(201).send({ ok: true, conversation: { id: convo.id, title: convo.title } })
  })

  fastify.get('/chat/conversations/:id', async (request, reply) => {
    const db = fastify.db
    const convo = await db.TxnConversations.findByPk(request.params.id)
    if (!convo) return reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Conversation not found.' } })
    const messages = await db.TxnMessages.findAll({
      where: { conversation_id: convo.id },
      order: [['created_at', 'ASC']],
    })
    return { ok: true, conversation: { id: convo.id, title: convo.title }, messages }
  })
}
