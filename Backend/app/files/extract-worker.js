// Parser child process — runs the document parsers (pdf-parse / mammoth / SheetJS) in
// a SEPARATE PROCESS so a pathological file that hangs or crashes a parser can be
// SIGKILLed without touching the server. A child process (not a worker thread) is
// deliberate: worker_threads teardown intermittently dies with 0xC0000005 on
// Windows/Node 24, while OS process isolation is boring and reliable. Forked per
// extraction by app/files/extract.js with serialization:'advanced' (Buffers pass
// through); all input guards (size, magic bytes, zip-bomb) already ran in the parent.
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

process.once('message', async ({ kind, buf }) => {
  const send = (msg) => new Promise((resolve) => process.send(msg, () => resolve()))
  try {
    const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
    let out
    if (kind === 'pdf') {
      const parser = new PDFParse({ data: new Uint8Array(buffer) })
      try {
        const r = await parser.getText()
        out = { text: r.text, note: `PDF, ${r.pages?.length ?? '?'} page(s)` }
      } finally {
        await parser.destroy?.().catch?.(() => {})
      }
    } else if (kind === 'docx') {
      const r = await mammoth.extractRawText({ buffer })
      out = { text: r.value, note: 'Word document' }
    } else { // xlsx / xls / ods / csv
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const parts = wb.SheetNames.map((s) => `## Sheet: ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s])}`)
      out = { text: parts.join('\n\n'), note: `Spreadsheet, ${wb.SheetNames.length} sheet(s)` }
    }
    await send({ ok: true, out })
  } catch (e) {
    await send({ ok: false, error: e?.message || String(e) })
  } finally {
    process.exit(0)
  }
})
