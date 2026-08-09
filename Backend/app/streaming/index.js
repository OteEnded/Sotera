// Server-Sent Events wire serializer.
//
// Takes { event, data } and returns the on-the-wire string per the SSE spec:
//   event: <name>
//   data: <json>
//   <blank line>
//
// The blank line terminates the event so the client dispatches it immediately.

export function serializeSseEvent({ event, data }) {
  const name = event || 'message'
  const payload = typeof data === 'string' ? data : JSON.stringify(data ?? {})
  return `event: ${name}\ndata: ${payload}\n\n`
}

export const SSE_CONTENT_TYPE = 'text/event-stream'

export const SSE_HEADERS = Object.freeze({
  'Content-Type': SSE_CONTENT_TYPE,
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
})
