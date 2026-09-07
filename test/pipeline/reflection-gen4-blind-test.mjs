// ⭐ THE BLIND HUMAN EVALUATION (F4) — an Ote-facing test built from the 20 recorded pairs, nothing generated, nothing rewritten.
//
//   node test/pipeline/reflection-gen4-blind-test.mjs
//
// Reads test/results/reflection-gen4-ab.json (the run record), test/results/reflection-gen4-ab-key.json (X/Y per pair, made once by
// hash) and the DATABASE (the clone conversations and their ledger rows are preserved). Writes TWO renderings of the same test:
//   Reference/docs/BLIND_TEST_SOTERA_REFLECTION_GENERATION_4.md      markdown
//   Reference/docs/BLIND_TEST_SOTERA_REFLECTION_GENERATION_4.html    self-contained page: radio X/Y/Neither + reason per pair,
//                                                                    autosaves a draft in the browser, "Save answers" downloads JSON
//
// ── THE SOURCE SHOWN IS THE MATERIAL THE PASS REVIEWED, RECONSTRUCTED FROM THE LEDGER ─────────────────────────────────────
// Each arm's ledger row records `from_rolling_id` (NULL = the conversation's start) and `up_to_rolling_id`; the reviewed slice is the
// clone's messages inside that range, in order, shaped exactly as the lane shaped them (`role: text`, whitespace folded, a line
// clipped at 1500 chars) — MINUS the one thing that differs by arm (line numbering), which is what the evaluation must not show.
// The two arms' shaped slices are compared line by line; a pair whose arms did NOT see identical material is FLAGGED rather than
// shown with a substitute. `messages_considered` is cross-checked against the reconstructed count.
// ⛔ Not written: generation, arm letter, run order, timestamps, citations/ordinals, fixture ids/titles, refusal/decline counts.
import { readFileSync, writeFileSync } from 'node:fs'
import { devPg, devSchema } from '../harness.mjs'
import { transcriptLine } from '../../Backend/app/components/reflection-lifecycle.js'

const R = JSON.parse(readFileSync(new URL('../results/reflection-gen4-ab.json', import.meta.url), 'utf8'))
const KEY = JSON.parse(readFileSync(new URL('../results/reflection-gen4-ab-key.json', import.meta.url), 'utf8'))
const OUT_MD = new URL('../../../../Reference/docs/BLIND_TEST_SOTERA_REFLECTION_GENERATION_4.md', import.meta.url)
const OUT_HTML = new URL('../../../../Reference/docs/BLIND_TEST_SOTERA_REFLECTION_GENERATION_4.html', import.meta.url)
const pairs = (R.pairs ?? []).filter((p) => p.A?.harvest && p.B?.harvest).sort((a, b) => a.index - b.index)
const S = `"${devSchema()}"`
const pg = devPg(); await pg.connect()
const q = async (sql, p = []) => (await pg.query(sql, p)).rows

async function reviewed(cid) {
  const [led] = await q(`SELECT from_rolling_id, up_to_rolling_id, messages_considered, outcome FROM ${S}."log_conversation_revisits" WHERE conversation_id = $1::uuid ORDER BY created_at DESC LIMIT 1`, [cid])
  if (!led) return { error: 'no ledger row' }
  const msgs = await q(`SELECT role, content, rolling_id FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid AND ($2::bigint IS NULL OR rolling_id >= $2::bigint) AND rolling_id <= $3::bigint ORDER BY rolling_id`, [cid, led.from_rolling_id, led.up_to_rolling_id])
  const [tot] = await q(`SELECT count(*)::int AS n FROM ${S}."txn_messages" WHERE conversation_id = $1::uuid`, [cid])
  const lines = msgs.map((m) => transcriptLine(m))
  const clipped = msgs.filter((m) => String(m.content || '').replace(/\s+/g, ' ').length > 1500).length
  return { lines, considered: led.messages_considered, reconstructed: msgs.length, total: tot.n, outcome: led.outcome, clipped }
}
// the memory exactly as stored: kind · slot label (if she gave one) · content — no whitespace folding, no truncation
const items = (h) => (h.rows ?? []).map((r) => ({ kind: r.kind ?? 'memory', label: r.attribute ? String(r.attribute).trim() : null, text: String(r.value ?? r.content ?? '').trim() }))

// ── collect ──
const data = []
for (const p of pairs) {
  const k = KEY.pairs[String(p.index)]
  if (!k) throw new Error(`no key entry for pair ${p.index}`)
  const a = await reviewed(p.A.conversationId), b = await reviewed(p.B.conversationId)
  const identical = !a.error && !b.error && a.lines.length === b.lines.length && a.lines.every((l, i) => l === b.lines[i])
  const whole = !a.error && a.reconstructed === a.total && a.considered === a.reconstructed && b.considered === b.reconstructed
  data.push({ n: p.index, identical, whole, considered: [a.considered, b.considered], reconstructed: [a.reconstructed, b.reconstructed], total: a.total, clipped: a.clipped,
    source: identical ? a.lines : null, X: items(p[k.X].harvest), Y: items(p[k.Y].harvest) })
}
await pg.end()

const QUESTION = 'Given the conversation material Sotera reviewed, which of X or Y contains the things you would rather she carry forward as durable knowledge from that conversation?'
const sourceNote = (d) => (d.reconstructed[0] < d.total ? ` (⚠️ the pass reviewed ${d.reconstructed[0]} of ${d.total} turns; only those are shown)` : '') + (d.clipped ? ` (⚠️ ${d.clipped} turn(s) were shown to her clipped at 1,500 characters, as here)` : '')

// ── markdown ──
const md = [
  '# Blind evaluation · Reflection Generation 4 — the 20 pairs, with the material she reviewed', '',
  '**The question, for every pair:**', '', `> ${QUESTION}`, '',
  '**Instructions.** Each pair is one fixture conversation, reflected twice under two instruments. X and Y were assigned per pair',
  'by a hash, and nothing in this document says which is which. **Judge each memory in relation to the source conversation.** Ask: if',
  'these were the memories Sotera is proposing to carry forward from this conversation, which would you rather she keep: X, Y, or neither?', '',
  '- **X** — X captures the better things to carry forward.', '- **Y** — Y captures the better things to carry forward.',
  '- **Neither** — neither contains something you would want carried forward.', '',
  'The **Source** block is exactly the material the reflection pass was shown, in order, as the lane shaped it: one line per turn,',
  '`user:` / `assistant:`, whitespace folded, a turn longer than 1,500 characters clipped there (flagged where it happened). Both sides',
  'reviewed the same lines. She was told the conversation was with "Claude" (the fixture account\'s display name). The Source ends at',
  'the rule marked **— end of source —**; everything after it is her output.', '',
  '**Response template** (copy, fill in):', '', '```', ...pairs.map((p) => `${p.index}. X | Y | Neither — reason`), '```', '', '---', '',
]
const mdSide = (xs) => (xs.length ? xs.map((r) => `- **${r.kind}**${r.label ? ` · ${r.label}` : ''}: ${r.text}`).join('\n') : '- Nothing retained')
for (const d of data) {
  md.push(`## Pair ${d.n}`, '')
  if (!d.identical) md.push('⚠️ **FLAGGED: the two arms did not review identical material — this pair cannot be judged blind and is shown without a source.**', '')
  else md.push(`**Source** — the material she reviewed${sourceNote(d)}`, '', '```text', ...d.source, '```', '', '**— end of source —**', '')
  md.push('**X**', '', mdSide(d.X), '', '**Y**', '', mdSide(d.Y), '', '---', '')
}

// ── html (self-contained; no network) ──
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const htmlSide = (xs) => (xs.length ? `<ul class="mem">${xs.map((r) => `<li><span class="kind">${esc(r.kind)}</span>${r.label ? `<span class="label">${esc(r.label)}</span>` : ''}<div class="text">${esc(r.text)}</div></li>`).join('')}</ul>` : '<p class="none">Nothing retained</p>')
const htmlPair = (d) => `
<section class="pair" id="pair-${d.n}" data-pair="${d.n}">
  <h2>Pair ${d.n} <span class="state" id="state-${d.n}">unanswered</span></h2>
  ${d.identical
    ? `<h3>Source <small>— the material she reviewed${esc(sourceNote(d))}</small></h3>
  <div class="chat">${d.source.map((l) => { const i = l.indexOf(': '); const u = l.startsWith('user:'); return `<div class="row ${u ? 'u' : 'a'}"><div class="bubble"><div class="who">${u ? 'user' : 'assistant'}</div>${esc(l.slice(i + 2))}</div></div>` }).join('')}</div>
  <div class="endsrc">— end of source —</div>`
    : '<p class="flag">⚠️ FLAGGED: the two arms did not review identical material — this pair cannot be judged blind and is shown without a source.</p>'}
  <div class="sides">
    <div class="side"><h3>X</h3>${htmlSide(d.X)}</div>
    <div class="side"><h3>Y</h3>${htmlSide(d.Y)}</div>
  </div>
  <div class="answer">
    <label><input type="radio" name="c${d.n}" value="X"> <b>X</b> captures the better things to carry forward</label>
    <label><input type="radio" name="c${d.n}" value="Y"> <b>Y</b> captures the better things to carry forward</label>
    <label><input type="radio" name="c${d.n}" value="Neither"> <b>Neither</b> contains something I would want carried forward</label>
    <input class="reason" type="text" name="r${d.n}" placeholder="reason (optional)">
  </div>
</section>`
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blind evaluation · Reflection Generation 4</title>
<style>
  :root{--ink:#1d1f22;--mute:#6b7280;--rule:#d9dce2;--u:#0b4f8a;--a:#6a3fa0;--bg:#fbfbf9;--card:#fff;--acc:#a8562a}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Georgia,"Times New Roman",serif}
  header{position:sticky;top:0;background:var(--card);border-bottom:1px solid var(--rule);padding:12px 24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;z-index:2}
  header h1{font-size:18px;margin:0;flex:1 1 auto}
  header .progress{font-family:ui-monospace,Consolas,monospace;color:var(--mute)}
  button{font:inherit;padding:8px 14px;border:1px solid var(--ink);background:var(--ink);color:#fff;border-radius:4px;cursor:pointer}
  button.secondary{background:#fff;color:var(--ink)}
  main{max-width:1100px;margin:0 auto;padding:24px}
  .intro{background:var(--card);border:1px solid var(--rule);padding:18px 22px;border-radius:6px}
  .intro blockquote{margin:12px 0;padding:10px 16px;border-left:4px solid var(--acc);background:#fdf6f1;font-size:16px}
  .pair{background:var(--card);border:1px solid var(--rule);border-radius:6px;padding:18px 22px;margin:22px 0}
  .pair h2{margin:0 0 8px;font-size:20px}
  .pair h3{margin:14px 0 6px;font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:var(--mute)}
  .pair h3 small{text-transform:none;letter-spacing:0;font-weight:normal}
  .state{font:12px ui-monospace,Consolas,monospace;color:var(--mute);margin-left:8px;padding:2px 8px;border:1px solid var(--rule);border-radius:10px;vertical-align:middle}
  .state.done{color:#fff;background:var(--acc);border-color:var(--acc)}
  .chat{background:#f4f5f7;border:1px solid var(--rule);border-radius:6px;padding:14px;max-height:600px;overflow:auto;display:flex;flex-direction:column;gap:10px}
  .row{display:flex} .row.u{justify-content:flex-end} .row.a{justify-content:flex-start}
  .bubble{max-width:78%;padding:10px 14px;border-radius:14px;font:15px/1.5 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;box-shadow:0 1px 1px rgba(0,0,0,.06)}
  .row.u .bubble{background:#dbe9f7;color:#0b2540;border-bottom-right-radius:4px}
  .row.a .bubble{background:#fff;color:var(--ink);border:1px solid var(--rule);border-bottom-left-radius:4px}
  .who{font:11px ui-monospace,Consolas,monospace;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;opacity:.7}
  .row.u .who{color:var(--u)} .row.a .who{color:var(--a)}
  .endsrc{text-align:center;color:var(--mute);font-style:italic;border-top:2px solid var(--acc);margin:8px 0 4px;padding-top:4px}
  .sides{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  @media (max-width:760px){.sides{grid-template-columns:1fr}}
  .side{border:1px solid var(--rule);border-radius:4px;padding:6px 14px 12px}
  .side h3{font-size:22px;color:var(--ink);text-transform:none;letter-spacing:0;margin:8px 0}
  ul.mem{list-style:none;padding:0;margin:0}
  ul.mem li{padding:8px 0;border-top:1px dotted var(--rule)}
  .kind{font:12px ui-monospace,Consolas,monospace;background:#eef0f3;padding:1px 6px;border-radius:3px;margin-right:6px}
  .label{font:12px ui-monospace,Consolas,monospace;color:var(--mute);margin-right:6px}
  .text{margin-top:4px;white-space:pre-wrap;overflow-wrap:anywhere}
  .none{color:var(--mute);font-style:italic}
  .flag{color:#9a1b1b;font-weight:bold}
  .answer{margin-top:14px;display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center;border-top:1px solid var(--rule);padding-top:12px}
  .answer label{cursor:pointer}
  .reason{flex:1 1 320px;font:inherit;padding:6px 8px;border:1px solid var(--rule);border-radius:4px}
  footer{max-width:1100px;margin:0 auto 40px;padding:0 24px;color:var(--mute)}
  #status{margin-left:8px;color:var(--mute)}
</style></head><body>
<header>
  <h1>Blind evaluation · Reflection Generation 4</h1>
  <span class="progress" id="progress">0 / ${data.length} answered</span>
  <button class="secondary" id="copy">Copy JSON</button>
  <button id="save">Save answers (JSON)</button>
  <span id="status"></span>
</header>
<main>
  <div class="intro">
    <p><b>The question, for every pair:</b></p>
    <blockquote>${esc(QUESTION)}</blockquote>
    <p>Each pair is one fixture conversation, reflected twice under two instruments. X and Y were assigned per pair by a hash, and nothing on this page says which is which. <b>Judge each memory in relation to the source conversation.</b> Ask: if these were the memories Sotera is proposing to carry forward from this conversation, which would you rather she keep: X, Y, or neither?</p>
    <ul>
      <li><b>X</b> — X captures the better things to carry forward.</li>
      <li><b>Y</b> — Y captures the better things to carry forward.</li>
      <li><b>Neither</b> — neither contains something you would want carried forward.</li>
    </ul>
    <p>The <b>Source</b> block is exactly the material the reflection pass was shown, in order, as the lane shaped it: one bubble per turn (the account holder on the right, Sotera on the left), whitespace folded, a turn longer than 1,500 characters clipped there (flagged where it happened). Both sides reviewed the same lines. She was told the conversation was with “Claude” (the fixture account's display name). The source ends at the rule marked <i>— end of source —</i>; everything after it is her output.</p>
    <p>Your answers autosave in this browser as you go. When all 20 are done, <b>Save answers (JSON)</b> downloads <code>gen4-blind-answers.json</code>; if the download is blocked, <b>Copy JSON</b> puts the same text on the clipboard.</p>
  </div>
  ${data.map(htmlPair).join('\n')}
</main>
<footer>Mapping X/Y → instrument is not on this page.</footer>
<script>
(function () {
  var N = ${data.length}, KEYLS = 'gen4-blind-answers-v1';
  var draft = {};
  try { draft = JSON.parse(localStorage.getItem(KEYLS) || '{}') || {}; } catch (e) { draft = {}; }
  function collect() {
    var out = {};
    for (var n = 1; n <= N; n++) {
      var c = document.querySelector('input[name="c' + n + '"]:checked');
      var r = document.querySelector('input[name="r' + n + '"]');
      out[n] = { choice: c ? c.value : null, reason: r && r.value ? r.value : '' };
    }
    return out;
  }
  function paint() {
    var a = collect(), done = 0;
    for (var n = 1; n <= N; n++) {
      var st = document.getElementById('state-' + n);
      if (a[n].choice) { done++; st.textContent = a[n].choice; st.className = 'state done'; } else { st.textContent = 'unanswered'; st.className = 'state'; }
    }
    document.getElementById('progress').textContent = done + ' / ' + N + ' answered';
    try { localStorage.setItem(KEYLS, JSON.stringify(a)); } catch (e) {}
    return { done: done, answers: a };
  }
  function restore() {
    for (var n = 1; n <= N; n++) {
      var d = draft[n]; if (!d) continue;
      if (d.choice) { var c = document.querySelector('input[name="c' + n + '"][value="' + d.choice + '"]'); if (c) c.checked = true; }
      var r = document.querySelector('input[name="r' + n + '"]'); if (r && d.reason) r.value = d.reason;
    }
  }
  function payload() {
    var p = paint();
    return JSON.stringify({ test: 'BLIND_TEST_SOTERA_REFLECTION_GENERATION_4', question: ${JSON.stringify(QUESTION)}, savedAt: new Date().toISOString(), answered: p.done, of: N, answers: p.answers }, null, 2);
  }
  function status(msg) { var s = document.getElementById('status'); s.textContent = msg; setTimeout(function () { s.textContent = ''; }, 4000); }
  document.addEventListener('change', paint); document.addEventListener('input', paint);
  document.getElementById('save').addEventListener('click', function () {
    var text = payload(), done = JSON.parse(text).answered;
    if (done < N && !confirm(done + ' of ' + N + ' answered. Save anyway?')) return;
    var blob = new Blob([text], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'gen4-blind-answers.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); status('saved gen4-blind-answers.json');
  });
  document.getElementById('copy').addEventListener('click', function () {
    var text = payload();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { status('JSON copied'); }, function () { prompt('Copy this JSON:', text); });
    else prompt('Copy this JSON:', text);
  });
  restore(); paint();
})();
</script>
</body></html>`

// ⛔ tripwires, not promises: the X/Y blocks must carry nothing arm-naming; the whole body nothing that names a fixture or an arm.
function tripwire(label, text) {
  const body = text.slice(text.indexOf('Pair 1'))
  const xy = data.map((d) => [...d.X, ...d.Y].map((r) => `${r.kind} ${r.label ?? ''} ${r.text}`).join('\n')).join('\n')
  for (const bad of [/\bgen(eration)? ?[34]\b/i, /\barm [AB]\b/, /\[\d+\] (user|assistant):/, /\bfrom:/, /\bquote\b/i, /[0-9a-f]{8}-[0-9a-f]{4}/, /\b20\d\d-\d\d-\d\d[T ]\d\d:/, /zz_gen4/, /PROBE as agent_dev/, /fixture [0-9a-f]{8}/]) {
    if (bad.test(xy)) throw new Error(`${label}: X/Y would reveal something: ${bad}`)
  }
  for (const bad of [/\barm [AB]\b/, /\[\d+\] (user|assistant):/, /zz_gen4/, /prompt_generation/, /fixture [0-9a-f]{8}/, /"[AB]":\s*"generation/]) {
    if (bad.test(body)) throw new Error(`${label}: body would reveal something: ${bad}`)
  }
}
tripwire('markdown', md.join('\n')); tripwire('html', html)
writeFileSync(OUT_MD, md.join('\n')); writeFileSync(OUT_HTML, html)
console.log(`blind test: ${data.length} pairs → ${OUT_MD.pathname}\n                       → ${OUT_HTML.pathname}`)
console.log('faithfulness per pair (identical material · whole conversation · considered A/B · reconstructed A/B · total · clipped):')
for (const d of data) console.log(`  ${String(d.n).padStart(2)}  identical=${d.identical}  whole=${d.whole}  considered=${d.considered.join('/')}  reconstructed=${d.reconstructed.join('/')}  total=${d.total}  clipped=${d.clipped}`)
console.log('mapping stays in test/results/reflection-gen4-ab-key.json (not written into either document)')
