/** @type {import('tailwindcss').Config} */
// Theme tokens map to the CSS variables in src/index.css (:root) so Tailwind utilities
// (text-ink, border-line, bg-panel-strong, …) and the hand-written chat/playground CSS
// share ONE source of truth for the palette.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        panel: 'var(--panel)',
        'panel-strong': 'var(--panel-strong)',
        surface: 'var(--surface)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-deep': 'var(--accent-deep)',
        mint: 'var(--mint)',
        'mint-ink': 'var(--mint-ink)',
        'mint-edge': 'var(--mint-edge)',
        edge: 'var(--edge)',
        wash: 'var(--wash)',
        overlay: 'var(--overlay)',
        danger: 'var(--danger)',
        'danger-soft': 'var(--danger-soft)',
        'danger-edge': 'var(--danger-edge)',
        warn: 'var(--warn)',
        'warn-soft': 'var(--warn-soft)',
        'warn-edge': 'var(--warn-edge)',
        ok: 'var(--ok)',
        'ok-soft': 'var(--ok-soft)',
        'ok-edge': 'var(--ok-edge)',
        info: 'var(--info)',
        'info-soft': 'var(--info-soft)',
        'info-edge': 'var(--info-edge)',
        think: 'var(--think)',
        'think-soft': 'var(--think-soft)',
        'think-edge': 'var(--think-edge)',
      },
      boxShadow: {
        modal: '0 20px 60px var(--shadow)',
      },
      keyframes: {
        // the "working…" text shimmer (a bright band sweeps across muted text via bg-clip-text)
        shimmer: { from: { backgroundPosition: '130% 0' }, to: { backgroundPosition: '-130% 0' } },
      },
      animation: {
        shimmer: 'shimmer 2.1s linear infinite',
      },
    },
  },
  plugins: [],
}
