// KaTeX, IN ITS OWN CHUNK — loaded only when a reply actually contains display maths.
//
// Why this file exists: adding remark-math + rehype-katex + katex took the chat bundle from 329 kB to 604 kB
// (gzip 99 -> 181 kB), and the overwhelming majority of replies contain no maths at all. Everyone paid 82 kB
// gzipped so the occasional formula could render. Vite splits this module into its own chunk — including KaTeX's
// stylesheet — so the cost lands on the replies that need it and nobody else.
//
// ⚠ THE STYLESHEET IMPORT BELONGS HERE, NOT IN THE PARENT. It is what drags KaTeX's CSS and its font files into
// this chunk rather than the main one. Moving it up to ChatApp would silently undo the whole point while
// everything still rendered correctly — the kind of regression only a bundle-size check catches.
// The fonts stay local assets served from our own origin; a CDN <link> would be blocked by the CSP outright.
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import type { Components } from 'react-markdown'

// ⚠⚠ `singleDollarTextMath: false` IS LOAD-BEARING — see the note beside hasDisplayMath in ChatApp.tsx.
// remark-math's default treats `$…$` as inline maths, and this platform's replies are wall-to-wall dollar
// amounts: measured before wiring any of it up, "$0.15/1M input, DeepSeek V3.2 at $0.11/1M." became an
// inlineMath node containing "0.15/1M input, DeepSeek V3.2 at " — an entire clause swallowed into a formula,
// on screen, in a pricing table. Display maths `$$…$$` is unaffected.
const REMARK_MATH: [typeof remarkMath, { singleDollarTextMath: boolean }] = [remarkMath, { singleDollarTextMath: false }]

/** The same ReactMarkdown call the plain path makes, plus the maths plugins. Components are passed in so the
 *  two paths cannot drift on link handling, source-offset blocks, copy buttons or heading anchors. */
export default function MathMarkdown({ text, components }: { text: string; components: Components }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, REMARK_MATH]} rehypePlugins={[rehypeKatex]} components={components}>
      {text}
    </ReactMarkdown>
  )
}
