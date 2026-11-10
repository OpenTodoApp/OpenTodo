// The brand line (OpenSpec change sidebar-brand-and-row-grid, design D1; app-shell
// "Brand line in the sidebar footer"): one quiet line under the footer row with the
// instance's mark, its name and the running version. It opens Settings › About, where
// What's new lives, and carries the accent dot while What's new has unread notes. A
// branded server shows its logo and name. The rail shows the mark alone. It reads the
// version this device last received, so it makes no request and looks the same offline.
import { t } from '../lib/i18n'
import { lastServerVersion } from '../lib/serverVersion'
import { useNewsDot } from '../lib/whatsNew'
import { Tooltip } from '../ui'
import { InstanceMark, useInstanceName } from './InstanceBrand'
import { NewsDot } from './NewsDot'
import { navigate } from './router'

export function SidebarBrandLine({ collapsed = false }: { collapsed?: boolean }) {
  const version = lastServerVersion.use()
  const news = useNewsDot(version)
  const name = useInstanceName()
  const text = version ? `${name} ${version}` : name
  const tip = t("About and What's new")
  return (
    <Tooltip label={collapsed ? `${text} · ${tip}` : tip} side={collapsed ? 'right' : 'top'}>
      <button type="button" onClick={() => navigate({ view: 'settings', section: 'about' })} data-brand-line
        aria-label={news ? t('{name}, new notes', { name: text }) : text}
        className={`touch-target relative mt-1 flex h-6 w-full min-w-0 items-center gap-1.5 rounded-control text-meta text-faint transition-colors duration-(--duration-ui) hover:text-muted focus-visible:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${collapsed ? 'justify-center' : 'px-1.5'}`}>
        <InstanceMark size={14} />
        {!collapsed && <span className="user-text min-w-0 truncate tabular-nums" data-brand-text>{text}</span>}
        {news && (collapsed
          ? <span aria-hidden="true" className="absolute right-1 top-0.5 size-1.5 rounded-full bg-accent" data-news-dot />
          : <span className="ml-auto flex"><NewsDot /></span>)}
      </button>
    </Tooltip>
  )
}
