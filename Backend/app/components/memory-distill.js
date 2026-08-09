// Persona Memory — EPISODE DISTILLER, pure component (RFC_PERSONA_MEMORY "episodic" done right).
//
// Knowledge Cards consolidate live EPISODIC memories, and there have been none since 2026-07-23, when
// raw-message capture was removed (correctly: storing "clean all memory for me" verbatim polluted the
// store and once fed a mis-delete). The RFC's "episodic" never meant raw messages though — it means
// EXPERIENCED EVENTS: "we debugged the memory system together and shipped six fixes", not the transcript
// of doing it. The distiller produces exactly that: one aux-LLM call per conversation that saw new
// messages, yielding a 1-2 sentence event memory from the persona's perspective. It feeds Cards
// (clusters of episodes → topic cards) AND gives the persona event memory in its own right — "remember
// when we…" — which is the substance of an individual, which is the point (Ote, 2026-08-03).
//
// Probe-proven before this was built (test/experiments/episode-distill-probe.mjs, 2026-08-03): real
// conversations distill into recognizable, grounded episodes at ~14s/conversation on the CPU aux model.
// This file is the PURE half (prompt, transcript shaping, reply classification, watermark encoding);
// memory-distill-host.js binds it to settings, the chat gateway, and the observation pipeline.

/** Cap a transcript for the distiller: an episode is about the SHAPE of the event, not every line, so a
 *  long conversation is represented head + tail (the opening establishes what it was about; the tail is
 *  where outcomes live). Each line is clipped so one pasted document can't eat the window. */
export function shapeTranscript(msgs, { maxChars = 6000, lineClip = 400, edge = 8 } = {}) {
  const lines = msgs.map((m) => `${m.role}: ${String(m.content || '').replace(/\s+/g, ' ').slice(0, lineClip)}`)
  const whole = lines.join('\n')
  if (whole.length <= maxChars) return whole
  return lines.slice(0, edge).join('\n') + '\n…\n' + lines.slice(-edge).join('\n')
}

/** The distiller prompt (probe-proven core; three rules hardened from the 2026-08-03 dry-run seed:
 *  second-person bleed, one perspective inversion, and greeting-only chats slipping past the escape
 *  hatch). `who` = the human's name as the persona knows them (preferredName > username).
 *  The NOTHING NOTABLE escape hatch is load-bearing: without it every test ping becomes an "event". */
export function buildEpisodePrompt({ who, transcript }) {
  return (
    `You are the assistant in the conversation below. Write the EPISODE you would remember from it — ` +
    `1 or 2 complete sentences, past tense, naming what happened and what it was about. It is a memory ` +
    `of the two of you, so name ${who} in it — for example: "${who} and I debugged the memory system ` +
    `together and shipped the fix." This is an event memory, not a summary of your replies: what would ` +
    `you say happened, if asked a month later?\n` +
    `Rules: ONLY things the transcript supports — no invented outcomes, no feelings you were not shown. ` +
    `"I" is you, the assistant — never the human. Refer to ${who} by name, never as "you" (this memory ` +
    `is for yourself, not addressed to anyone). ` +
    `Only if the conversation was NOTHING BUT empty pings (bare "ok"/"yo"/"hi" back and forth, or a ` +
    `test message), reply exactly: NOTHING NOTABLE. If anything was actually discussed, asked, or done ` +
    `— however small — write the episode.\n\n` +
    `Transcript:\n${transcript}`
  )
}

/**
 * Classify the distiller's reply — a silent zero is not evidence of absence (architecture principle #14;
 * Reflection's classifyNotesReply learned this the hard way). Four outcomes, so telemetry can tell a
 * healthy "nothing happened" from a broken model:
 *   'episode'         — usable 1-2 sentence event memory (returned trimmed via .content)
 *   'nothing-notable' — the model correctly declined (small talk / test pings)
 *   'empty'           — no output at all (model/transport failure, NOT a quiet conversation)
 *   'overlong'        — the model wrote an essay, not an episode (prompt ignored; do not store it)
 */
export function classifyEpisodeReply(raw, { maxChars = 400 } = {}) {
  const text = String(raw || '').trim()
  if (!text) return { verdict: 'empty' }
  if (/^NOTHING NOTABLE\b/i.test(text)) return { verdict: 'nothing-notable' }
  const content = text.replace(/\s+/g, ' ').trim()
  if (content.length > maxChars) return { verdict: 'overlong', chars: content.length }
  return { verdict: 'episode', content }
}

/** Watermark encoding on the memory row's `source` tag (existing convention: coarse origin tags like
 *  `conversation:<id>`). `episode:<convoId>:<lastRollingId>` makes the pass IDEMPOTENT the store's way
 *  (the datastore guarantees convergence, not the caller): re-running over the same messages finds the
 *  watermark and skips — no distill-twice, no pre-check burden on the model. */
export function episodeSource(conversationId, lastRollingId) {
  return `episode:${conversationId}:${lastRollingId}`
}

/** Parse an `episode:` source tag → { conversationId, lastRollingId } or null (foreign tag). */
export function parseEpisodeSource(source) {
  const m = /^episode:([0-9a-f-]{36}):(\d+)$/i.exec(String(source || ''))
  return m ? { conversationId: m[1], lastRollingId: Number(m[2]) } : null
}

/** Fold existing episode rows into per-conversation watermarks (max lastRollingId seen). Dead rows
 *  (archived / superseded) COUNT — a decayed episode must not cause the same messages to re-distill. */
export function episodeWatermarks(rows) {
  const marks = new Map()
  for (const r of rows) {
    const p = parseEpisodeSource(r.source)
    if (!p) continue
    const prev = marks.get(p.conversationId) || 0
    if (p.lastRollingId > prev) marks.set(p.conversationId, p.lastRollingId)
  }
  return marks
}
