// One-time migration: DailyDigest (Feature) → a root-owned Schedule.
//
// Background: the daily digest used to be an installed Feature (@ote/feature-daily-digest),
// firing its own cron trigger and composing a fresh conversation each morning. We took it
// down at OteLLMServices (persona.json → DailyDigest enabled:false; config.json →
// components.dailyDigest.enabled:false — the Feature still ships in PortableComponents, it's
// just not installed here) and folded its behaviour into the general Schedules system, which
// already does the exact same thing (a skill-turn is a real chat turn AS the owner) and adds
// a permanent "home" chat (the '@dedicated' destination) instead of a new conversation daily.
//
// This script creates that schedule for root ONCE, through a direct DB write that mirrors the
// row + seeded home-chat the service's createJob/resolveDedicatedDestination produce. After it
// runs, the digest is a normal schedule root owns — edit / disable / delete it in Options →
// Schedules (or via the create/update/delete_schedule tools). Re-running is a no-op (it skips
// when a root schedule named "Daily digest" already exists), so a deleted one is NOT recreated.
//
// Run once (server may stay up; boot picks up the new job on the next restart):
//   node database/seeds/seed-digest-schedule.mjs

import { initDB } from '../index.js'

// Source of truth = the (now-disabled) config.json components.dailyDigest block.
const NAME = 'Daily digest'
const TIME = '07:30'
const TZ = 'Asia/Bangkok'
const MODEL = 'ollama/gemma4:26b'
const PROMPT =
  "Compose today's daily digest for the user. Check the current date and time first, then use " +
  'whatever tools you have to gather anything genuinely useful, and write a short, friendly ' +
  'morning briefing: the date, anything notable you can actually observe, and one suggestion ' +
  'for the day. Be honest about what you cannot see — never invent events.'

const [hh, mm] = TIME.split(':').map(Number)
const CRON = `${mm} ${hh} * * *` // "30 7 * * *"

const db = await initDB()
try {
  const existing = await db.mst_trigger_jobs.findOne({ where: { user_id: null, name: NAME } })
  if (existing) {
    console.log(`↷ skip — root already has a "${NAME}" schedule (${existing.id}). Nothing to do.`)
  } else {
    // 1) The '@dedicated' home chat: a real conversation seeded with one assistant message,
    //    mirroring schedules' resolveDedicatedDestination + store.createSeededConversation.
    const convo = await db.txn_conversations.create({ user_id: null, title: `⏰ ${NAME}`, model: MODEL })
    await db.txn_messages.create({
      conversation_id: convo.id,
      role: 'assistant',
      content: `This chat is the home of the schedule **“${NAME}”** — every run lands here, so its history stays in one place.\n\nStanding instruction: ${PROMPT}`,
      provider: MODEL.split('/')[0] || null,
      model: MODEL,
    })

    // 2) The schedule row (mirrors store.create's fields). next_run_at stays null — the server's
    //    initSchedules registers the trigger at boot and computes the next fire then.
    const job = await db.mst_trigger_jobs.create({
      user_id: null, // root
      name: NAME,
      trigger: { type: 'cron', expr: CRON, tz: TZ },
      action: { type: 'skill-turn', skillId: null, prompt: PROMPT, model: MODEL, conversationId: convo.id },
      enabled: true,
      catch_up: false, // a digest for a moment that already passed is stale (the Feature's default)
    })

    console.log(`✓ created root schedule "${NAME}" (${job.id})`)
    console.log(`  trigger : cron "${CRON}" ${TZ}  (daily ${TIME})`)
    console.log(`  model   : ${MODEL}`)
    console.log(`  lands in: ⏰ ${NAME} home chat (${convo.id})`)
    console.log('  ↻ restart the server so initSchedules registers the trigger.')
  }
} finally {
  await db.sequelize.close()
}
process.exit(0)
