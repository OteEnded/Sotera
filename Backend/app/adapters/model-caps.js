// Model capability normalization — shared by the console Models catalog and the
// chat site's model picker. Two sources, in order of trust:
//   1. DECLARED — the provider says so (Ollama /api/show `capabilities`,
//      OpenRouter-style modalities/supported_parameters). inferred: false.
//   2. INFERRED — guessed from the model name (most vendors' lists are bare ids).
//      inferred: true, so UIs can mark the guess.

export function inferCapsFromName(id) {
  const n = String(id).toLowerCase()
  const caps = new Set()
  // non-chat specialists first — they must NOT get a chat badge (or a chat Test button)
  if (/embed/.test(n)) return ['embeddings']
  if (/rerank/.test(n)) return ['reranker']
  if (/flux|diffusion|dall|[-\/]sd[-0-9]|image|video|wan[0-9.]/.test(n)) return ['media-gen']
  if (/tts|speech-[0-9]|cosyvoice|voice/.test(n)) return ['speech']
  caps.add('chat')
  if (/vision|-vl|vl-|multimodal|omni|gemma[34]|llava|pixtral/.test(n)) caps.add('vision')
  if (/think|reason|-r1|qwq|-o[134]|deepseek-v[34]|mimo/.test(n)) caps.add('thinking')
  if (/ocr/.test(n)) caps.add('ocr')
  if (/asr|whisper/.test(n)) caps.add('audio')
  if (/coder|codestral|-code/.test(n)) caps.add('code')
  if (/translate/.test(n)) caps.add('translation')
  return [...caps]
}

// Declared capabilities from a rich model entry (adapter listModels/listModelsDetailed
// output), or null when the entry carries no metadata.
export function declaredCaps(m) {
  if (Array.isArray(m.capabilities)) {
    // Ollama-declared: completion->chat, embedding->embeddings; rest pass through
    return m.capabilities.map((c) => (c === 'completion' ? 'chat' : c === 'embedding' ? 'embeddings' : c))
  }
  if (Array.isArray(m.inputModalities) || Array.isArray(m.supportedParameters)) {
    // OpenRouter-style declared metadata
    let caps = ['chat']
    if ((m.inputModalities || []).includes('image')) caps.push('vision')
    const sp = m.supportedParameters || []
    if (sp.includes('reasoning') || sp.includes('include_reasoning')) caps.push('thinking')
    if (sp.includes('tools') || sp.includes('tool_choice')) caps.push('tools')
    if (/embed/i.test(m.id)) caps = ['embeddings']
    return caps
  }
  return null
}

export function capsOf(m) {
  const declared = declaredCaps(m)
  return declared ? { caps: declared, inferred: false } : { caps: inferCapsFromName(m.id), inferred: true }
}

const paramSizeNum = (s) => {
  const m = /([\d.]+)\s*[bB]/.exec(String(s || ''))
  return m ? Number(m[1]) : null
}

export function goodForOf(caps, id, parameterSize, description) {
  if (description) return description // real vendor text beats any heuristic
  const bits = []
  if (caps.includes('embeddings')) return 'Embeddings for semantic search / RAG — not a chat model.'
  if (caps.includes('reranker')) return 'Search-result reranking — not a chat model.'
  if (caps.includes('media-gen')) return 'Image/video generation — not served by the chat gateway.'
  if (caps.includes('speech')) return 'Speech synthesis/voice — not a chat model.'
  if (caps.includes('ocr')) bits.push('OCR / document text extraction')
  else if (caps.includes('audio')) bits.push('speech/audio input')
  else if (caps.includes('translation')) bits.push('translation')
  else if (caps.includes('code')) bits.push('code generation and editing')
  else if (caps.includes('vision') && caps.includes('thinking')) bits.push('multimodal reasoning (images + complex tasks)')
  else if (caps.includes('vision')) bits.push('image understanding + chat')
  else if (caps.includes('thinking')) bits.push('complex reasoning and agentic/tool work')
  else bits.push('general chat')
  const size = paramSizeNum(parameterSize)
  if (size != null) bits.push(size <= 5 ? 'small & fast — good for quick/cheap tasks' : size >= 20 ? 'large — quality-first, slower' : 'mid-size — balanced speed/quality')
  return bits.join(' · ')
}
