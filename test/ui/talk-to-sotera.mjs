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
const USER = { username: 'agent_dev', password: 'agentdev123' }

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
  const lastReply = async () => {
    const n = await assistant().count()
    return n ? (await assistant().nth(n - 1).innerText()).trim() : ''
  }
  // The ASK card is a chat-msg-assistant too, so it is excluded from "her reply" by its own marker.
  const askCard = async () => {
    const c = page.locator('[data-ui="ask-card"]')
    return (await c.count()) ? (await c.first().innerText()).trim().replace(/\s+/g, ' ').slice(0, 400) : null
  }

  if (mode === 'answer') {
    const card = page.locator('[data-ui="ask-card"]')
    await card.waitFor({ state: 'visible', timeout: 20000 })
    // Prefer the option button whose label matches; fall back to typing it as free text.
    const opt = card.locator(`button:has-text("${text}")`).first()
    if (await opt.count()) await opt.click()
    else {
      const free = card.locator('input[type="text"], textarea').first()
      await free.fill(text)
      await card.locator('button:has-text("Send"), button[type="submit"]').first().click()
    }
    await page.waitForTimeout(3000)
    console.log(`ANSWERED with: ${text}`)
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
