// The title of a view page (OpenSpec change views-and-display, design D1): "Views ›
// <name>", where "Views" goes back to the overview. The name is the page's heading text.
import { Icon } from '../../ui'
import { t } from '../../lib/i18n'
import { navigate, routePath } from '../router'

export function ViewsCrumb({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5" data-views-crumb>
      <a href={routePath({ view: 'views' })} className="shrink-0 rounded-control text-muted hover:text-default"
        onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); navigate({ view: 'views' }) }}>
        {t('Views')}
      </a>
      <Icon name="chevron-right" size="xs" className="shrink-0 text-faint" />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  )
}
