// Browser-side SSE client built on fetch + ReadableStream.
// EventSource is unusable here because it doesn't allow custom headers
// (we need Authorization: Bearer ...).

export type SseEvent = { event: string; data: unknown }

export async function* streamSseEvents(
  url: string,
  init: RequestInit
): AsyncGenerator<SseEvent> {
  const response = await fetch(url, init)

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let message = `HTTP ${response.status}`
    try {
      const json = JSON.parse(text)
      if (json?.error?.message) message = json.error.message
    } catch {
      if (text) message = text
    }
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('Response had no body')
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += value

      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''

      for (const block of blocks) {
        const event = parseSseBlock(block)
        if (event) yield event
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // best effort
    }
  }
}

function parseSseBlock(block: string): SseEvent | null {
  if (!block.trim()) return null

  let eventName = 'message'
  const dataLines: string[] = []

  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).replace(/^ /, ''))
    }
  }

  const dataStr = dataLines.join('\n')
  let data: unknown = dataStr
  if (dataStr) {
    try {
      data = JSON.parse(dataStr)
    } catch {
      // leave as raw string
    }
  }

  return { event: eventName, data }
}
