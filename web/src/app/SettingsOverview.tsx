// A section's overview (OpenSpec change settings-subpages, design D1–D2): one row
// per sub-page with its icon, its name and its state in a word ("Webhooks · 2",
// "Calendar feeds · Off"), each a link to /settings/<section>/<page>. Flat hairline
// rows like a settings card, no card surface (Precision). The states load once,
// together, under the page's pending gate; offline they are left out.
import { useEffect, useState } from 'react'
import type { User } from '../lib/types'
import { Icon } from '../ui'
import { useOnline } from '../lib/online'
import { routePath } from './router'
import { followLink } from './settingsLinks'
import { useSettingsPending } from './settingsPending'
import { pageStatus } from './settingsStatus'
import { visiblePages, type SettingsSection } from './settingsSections'

export function SettingsOverview({ section, user }: { section: SettingsSection; user: User }) {
  const pages = visiblePages(user, section)
  const online = useOnline()
  const [status, setStatus] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(online)
  useSettingsPending(loading)
  const key = pages.map((p) => p.id).join(',')
  useEffect(() => {
    if (!online) { setLoading(false); return }
    let live = true
    setLoading(true)
    void Promise.all(pages.map(async (p) => [p.id, await pageStatus(user, section.id, p.id)] as const)).then((pairs) => {
      if (!live) return
      setStatus(Object.fromEntries(pairs.filter((x): x is readonly [string, string] => !!x[1])))
      setLoading(false)
    })
    return () => { live = false }
    // The page list is keyed by its ids; the user only matters by identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id, key, online, user.id])
  return (
    <nav aria-label={section.label} data-settings-overview-list={section.id}>
      <ul className="divide-y divide-soft border-y border-soft">
        {pages.map((p) => {
          const href = routePath({ view: 'settings', section: section.id, page: p.id })
          return (
            <li key={p.id}>
              <a href={href} data-settings-subpage={p.id}
                className="flex min-h-11 items-center gap-3 rounded-control px-1 py-2 text-body hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                onClick={(e) => followLink(e, { view: 'settings', section: section.id, page: p.id })}>
                <span className="shrink-0 text-muted"><Icon name={p.icon} /></span>
                <span className="min-w-0 flex-1 font-medium text-default">{p.label}</span>
                {status[p.id] && <span className="user-text max-w-[45%] truncate text-meta text-muted" data-settings-status>{status[p.id]}</span>}
                <span className="shrink-0 text-faint"><Icon name="chevron-right" size="sm" /></span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
