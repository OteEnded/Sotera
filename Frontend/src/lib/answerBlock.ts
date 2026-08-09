// A NEW ROUND'S TEXT IS A NEW MARKDOWN BLOCK — the client half of a rule the server also owns.
//
// ⚠⚠ MIRRORED with `answerBlockJoin` in Backend/app/chat/stream-guards.js. Both sides build `content` for the
// SAME reply: the server accumulates it from the provider stream and persists it, the browser accumulates it
// from the SSE token events so the reply can be copied, exported and SPOKEN before it is ever reloaded.
// test/unit/answer-block-join.test.mjs asserts the two implementations agree on the same inputs and fails if
// they drift, which is the only thing that keeps a duplicated rule honest.
//
// WHY THE CLIENT NEEDS IT AT ALL — and this was a real gap, live for hours on 2026-08-06. The server-side fix
// stopped `content` welding markdown at round boundaries (`**Round 1: … findings**` + `Good — …` came out as
// `findings**Good`). But the 🔊 button plans its pieces from the CLIENT's copy, which had no separator. So a
// reply streamed in the current session was still glued when spoken, and only came out right after a page
// reload pulled the server's version back. Two copies of one reply, one fixed and one not.
//
// It also matters for something less obvious than the audio: piece text IS the clip cache key. With the two
// copies disagreeing, speaking a reply before a reload and after a reload produced DIFFERENT pieces, so the
// second press re-rendered every one of them — and since no engine here exposes a seed, a re-render is a
// different take, not the same clip. Agreeing on the text makes the cache agree with itself.
//
// The rule is deliberately conservative: separate only when there is something to separate FROM and it does not
// already end in a newline. Never inserted before the first text of a turn, and never left trailing, because
// the caller only asks for it at the moment it is about to append real text.
export const answerBlockJoin = (soFar: string): string => (soFar && !/\n\s*$/.test(soFar) ? '\n\n' : '')
