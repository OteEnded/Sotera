import { useState } from 'react'
import UsageStatsPanel from '../components/UsageStatsPanel'
import RefreshButton from '../components/RefreshButton'
import { ui } from './admin/ui'

// The user's own usage dashboard (developer tier) — same panel the chat Options
// modal embeds, on a full console page. Everything metered to this user: chat
// turns plus calls made with their API keys.

export default function MyUsagePage() {
  const [statsKey, setStatsKey] = useState(0) // bump remounts the panel = fresh fetch

  return (
    <div className={ui.page}>
      <div className="flex items-center gap-2">
        <h2 className={`${ui.h2} !mb-0`}>My Usage</h2>
        <RefreshButton className="ml-auto" onRefresh={() => setStatsKey((k) => k + 1)} />
      </div>
      <p className="adm-dim">
        Everything metered to you — chat turns plus calls made with your API keys (see <b>My API Keys</b>).
        Tokens in = prompt, out = completion.
      </p>
      <section className="gw-card" data-ui="myusage-card">
        <UsageStatsPanel key={statsKey} endpoint="/v1/me/usage/stats" />
      </section>
    </div>
  )
}
