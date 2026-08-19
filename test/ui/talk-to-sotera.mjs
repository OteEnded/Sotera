// TALK TO HER. A real conversation through the real UI, as agent_dev — ONE TURN PER INVOCATION.
//
//   node ui/talk-to-sotera.mjs "hey, first message"              → starts a chat, prints its id
//   node ui/talk-to-sotera.mjs "next message" <conversationId>    → continues it
//   node ui/talk-to-sotera.mjs --answer "Otto" <conversationId>   → answers a pending ask card
//   node ui/talk-to-sotera.mjs --read <conversationId>            → just look, say nothing
//
// ⚠️ NOT A SCRIPTED DRIVE, which is the whole request: *"dynamicy turn by turn, no proscitpted. so we
// know if the new updated code really work."* A fixed list of messages tests the plumbing and cannot
// tell you whether she is any good to talk to, whether she remembers the right things, or whether what
// she stored matches what was actually said. So each turn is a separate run: whoever is driving reads
// her reply and then decides what to say next, like a person would.
//
// One turn per process rather than a held browser, because the driver here is an agent that cannot
// keep a pipe open between decisions. Continuity is the SERVER's — the conversation id is the thread,
// so relaunching the browser loses a few seconds and nothing else.
//
// ⛔ agent_dev, never root. Root is Ote's account, and a conversation writes memories into whoever
// it runs as. 👀 HEADED by default so the run is visible (SOTERA_HEADLESS=1 to hide it).
import { chromium } from '../../../../OteLLMServices/test/node_modules/playwright/index.mjs'

const BASE = process.env.SOTERA_BASE || 'http://127.0.0.1:8210'
const HEADLESS = process.env.SOTERA_HEADLESS === '1'
// ⚠️ agent_dev IS NOT SAFE FOR OBSERVATION, and that cost a real relationship on 2026-08-19.
// `checks/memory-lifecycle-check.mjs` opens with `delete from txn_memories where user_id = <agent_dev>`
// — it has to, it is testing deletion — so every `npm test` erases everything Sotera has learned about
// whoever is driving from this account. She stored my work hours, the suite ran, and an hour later she
// correctly reported an empty store. I nearly filed that as a `list_memories` bug; the bug was mine.
//
// ⇒ For anything meant to ACCUMULATE, drive as a different account:
//     SOTERA_USER=ote_observer SOTERA_PASS=... node ui/talk-to-sotera.mjs "…"
// The test account and the observation account must not be the same account.
const USER = {
  username: process.env.SOTERA_USER || 'agent_dev',
  password: process.env.SOTERA_PASS || 'agentdev123',
}

const args = process.argv.slice(2)
const mode = args[0] === '--answer' ? 'answer' : args[0] === '--read' ? 'read' : 'say'
const text = mode === 'read' ? '' : (mode === 'answer' ? args[1] : args[0])
const convoId = mode === 'read' ? args[1] : (mode === 'answer' ? args[2] : args[1])

const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 40 })
const ctx = await browser.newContext({ viewport: { width: 1240, height: 880 } })
const page = await ctx.newPage()
page.setDefaultTimeout(30000)

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  // ⚠️ The username field carries NO `type` and NO `name` — it is `autoComplete="username"` and that is
  // the only stable hook on it. `input[type="text"]` matched nothing and timed out; the selector was
  // wrong, not the page. Worth remembering before blaming a UI for a locator.
  await page.fill('input[autocomplete="username"]', USER.username)
  await page.fill('input[type="password"]', USER.password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 25000 }).catch(() => {})

  await page.goto(convoId ? `${BASE}/chat/${convoId}` : `${BASE}/chat`, { waitUntil: 'domcontentloaded' })
  const composer = page.locator('textarea.chat-input')
  await composer.waitFor({ state: 'visible', timeout: 25000 })

  const assistant = () => page.locator('.chat-msg-assistant')
  // ⭐ STRIP THE WAITING INDICATOR STRUCTURALLY, NOT BY ITS WORDS. The pending line is a real DOM node
  // inside the bubble (`.animate-shimmer`, or `[data-ui="live-note"]` for a runtime status), and it is
  // NOT part of her reply. Removing the ELEMENT works for every phrase, including ones added after this
  // was written.
  // ⚠️ This cost a whole conversation on 2026-08-19. The word-list below knew "Poking the model…" and
  // ChatApp.tsx rolled "Here we go…" — one of SEVENTEEN randomly-rotating phrases. The harness read a
  // status line as her answer, saw it hold still for 4s, declared the turn finished and closed the
  // browser, which ABORTED THE STREAM: the row landed with `error: "no output was produced — the client
  // disconnected before the first token"` and it looked exactly like she had failed to answer.
  // Same family as the F6 regex and `dense` matching inside `empty-dense`: KEYED ON WORDS, NOT ON WHAT
  // THE THING IS. Extending the list to 17 strings would just be a bigger guess with a longer half-life.
  const lastReply = async () => {
    const n = await assistant().count()
    if (!n) return ''
    return (await assistant().nth(n - 1).evaluate((el) => {
      const clone = el.cloneNode(true)
      clone.querySelectorAll('.animate-shimmer, [data-ui="live-note"]').forEach((x) => x.remove())
      return clone.innerText
    })).trim()
  }
  // The ASK card is a chat-msg-assistant too, so it is excluded from "her reply" by its own marker.
  const askCard = async () => {
    const c = page.locator('[data-ui="ask-card"]')
    return (await c.count()) ? (await c.first().innerText()).trim().replace(/\s+/g, ' ').slice(0, 400) : null
  }

  if (mode === 'answer') {
    // ⚠️ THIS USED TO LIE, AND IT COST A HELD TURN (2026-08-19). It clicked the option button, waited a
    // blind 3s, and printed "ANSWERED with: Yes" — while the interaction sat at `pending` and expired.
    // TWO faults, and the second is the instructive one:
    //   1. Clicking an option only SELECTS it. The card has a separate "Answer" button that submits.
    //      Nothing was ever sent.
    //   2. It reported an outcome it never observed. A harness that asserts its own success is worse
    //      than one that fails, because it converts a broken step into a confident log line.
    // Now: select → submit → and REFUSE to claim anything until the server says the interaction left
    // `pending`. Verified against the API, not against the DOM, because the DOM is what we are driving.
    const card = page.locator('[data-ui="ask-card"]')
    await card.waitFor({ state: 'visible', timeout: 20000 })

    const opt = card.locator(`button:has-text("${text}")`).first()
    if (await opt.count()) {
      await opt.click()
      // The submit control. Deliberately NOT `button[type=submit]` alone — the option rows are buttons
      // too, and matching loosely is how the original clicked the wrong thing and thought it was done.
      const submit = card.locator('button:has-text("Answer")').first()
      if (await submit.count()) await submit.click()
    } else {
      const free = card.locator('input[type="text"], textarea').first()
      await free.fill(text)
      const submit = card.locator('button:has-text("Answer"), button:has-text("Send")').first()
      await submit.click()
    }

    // VERIFY. Poll the server's own view; the card vanishing is not proof the answer landed.
    const stillPending = async () => page.evaluate(async (cid) => {
      try {
        const r = await fetch(`/v1/chat/conversations/${cid}/interactions/pending`, { credentials: 'include' })
        if (!r.ok) return true
        const j = await r.json()
        return Boolean(j?.interaction && j.interaction.status === 'pending')
      } catch { return true }
    }, convoId)

    let landed = false
    for (let i = 0; i < 30; i++) {
      if (!(await stillPending())) { landed = true; break }
      await page.waitForTimeout(1000)
    }
    if (!landed) {
      console.error(`✖ ANSWER DID NOT LAND — the interaction is still pending after 30s. Nothing was submitted.`)
      console.error(`  (the reply stays held until it expires; re-run, or answer in the UI)`)
      await browser.close()
      process.exitCode = 1
      process.exit(1)
    }
    console.log(`ANSWERED with: ${text}  (verified: interaction left pending)`)
    // The held reply resumes AFTER the answer — wait for it so the caller sees the actual continuation
    // rather than the paused state. ⚠️ CONFIRMED CAPABILITY, not a workaround: the interaction survives
    // the death of the SSE connection that created it. On 2026-08-19 the originating Playwright process
    // had exited minutes earlier and the turn still resumed and completed on answer.
    await page.waitForFunction(
      (sel) => document.querySelectorAll(sel).length > 0,
      '.chat-msg-assistant', { timeout: 240000 },
    ).catch(() => {})
    await page.waitForTimeout(2000)
  } else if (mode === 'say') {
    const before = await assistant().count()
    await composer.click()
    await composer.fill(text)
    await page.keyboard.press('Enter')
    await page.waitForFunction(
      ([sel, n]) => document.querySelectorAll(sel).length > n,
      ['.chat-msg-assistant', before], { timeout: 240000 },
    ).catch(() => {})
    // ⚠️ WAIT FOR REAL TEXT BEFORE WAITING FOR STABILITY. The first version latched onto the status
    // line ("Poking the model…"), which is perfectly stable while a 26GB chat model cold-loads — so it
    // declared the turn finished, closed the browser, and ABORTED THE STREAM. The transcript then held
    // the user message and no reply at all, which looks exactly like "she did not answer".
    // A placeholder is not an answer; treat it as still waiting.
    // ⚠️ THIS LIST IS THE FLOOR, NOT THE MECHANISM — and on 2026-08-19 it failed exactly the way a word
    // list always does: it fired on nothing, because the phrase that came up ("Here we go…") was not in
    // it. `lastReply()` now removes the indicator ELEMENT, which is what actually makes this correct;
    // the regex only catches a placeholder that somehow arrives outside that node. Deny-lists fail open.
    const PLACEHOLDER = /^(SOTERA\s*)?(poking the model|thinking|working|reading|searching|recalling)[….\s]*$/i
    const realReply = async () => {
      const t = await lastReply()
      const body = t.replace(/^SOTERA\s*/i, '').trim()
      return PLACEHOLDER.test(body) || !body ? '' : t
    }
    let prev = ''
    let stable = 0
    for (let i = 0; i < 420; i++) { // up to ~7 min: a cold model plus a long reply
      await page.waitForTimeout(1000)
      const now = await realReply()
      if (now && now === prev) { if (++stable >= 4) break } else stable = 0
      prev = now
    }
  }

  const id = convoId || (page.url().match(/\/chat\/([0-9a-f-]{36})/i)?.[1] ?? null)
  if (mode !== 'read') console.log(`\nSOTERA> ${(await lastReply()) || '(no reply captured)'}\n`)
  else {
    const n = await assistant().count()
    for (let i = Math.max(0, n - 2); i < n; i++) console.log(`SOTERA> ${(await assistant().nth(i).innerText()).trim()}\n`)
  }
  const ask = await askCard()
  if (ask) console.log(`⭐ ASK CARD ON SCREEN: ${ask}\n`)
  console.log(`CONVERSATION ${id ?? '(unknown)'}`)
} finally {
  await browser.close()
}
