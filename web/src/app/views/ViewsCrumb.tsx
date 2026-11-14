// The title of a view page (OpenSpec change views-and-display, design D1): "Views ›
// <name>", where "Views" goes back to the overview. The name is the page's heading text.
// It stays one line; a cut name shows in full on hover and on keyboard focus.
import { Icon, TruncatedText } from '../../ui'
import { t } from '../../lib/i18n'
import { navigate, routePath } from '../router'

export function ViewsCrumb({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5" data-views-crumb>
      <a href={routePath({ view: 'views' })} className="touch-target inline-flex shrink-0 items-center justify-center rounded-control text-muted hover:text-default"
        onClick={(e) => { if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); navigate({ view: 'views' }) }}>
        {t('Views')}
      </a>
      <Icon name="chevron-right" size="xs" className="shrink-0 text-faint" />
      {/* One line in the bar and the header (phone-bar-overflow); a cut name stays reachable (phone-stats-period). */}
      <TruncatedText text={name} className="min-w-0" />
    </span>
  )
}
