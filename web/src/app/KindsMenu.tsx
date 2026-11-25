// The kind filter of Updates and a workspace's Activity (OpenSpec change
// workspace-activity, design D4): several feed categories at once, an event
// shown when it has any of them; none chosen means all. The menu stays open
// while kinds are toggled.
import { FEED_KINDS, type FeedKind } from '../lib/feed'
import { t } from '../lib/i18n'
import { Icon, Menu, MenuItem, MenuSeparator } from '../ui'

export function kindsLabel(kinds: readonly FeedKind[]): string {
  if (kinds.length === 0) return t('All changes')
  if (kinds.length === 1) return FEED_KINDS.find((k) => k.value === kinds[0])?.label ?? kinds[0]
  return t('{n, plural, one {# kind} other {# kinds}}', { n: kinds.length })
}

export function KindsMenu({ kinds, onChange, label }: { kinds: readonly FeedKind[]; onChange: (kinds: FeedKind[]) => void; label: string }) {
  const chosen = new Set(kinds)
  const toggle = (k: FeedKind) => onChange(FEED_KINDS.map((x) => x.value).filter((v) => (v === k ? !chosen.has(v) : chosen.has(v))))
  const text = kindsLabel(kinds)
  return (
    <Menu kind="menu" label={t('{label}: {kinds}', { label, kinds: text })} align="end" width="sm:w-56"
      triggerProps={{ 'data-kinds-menu': true }}
      triggerClassName="ui-input flex w-40 items-center gap-1 py-0.5 text-start text-meta"
      trigger={<><span className="min-w-0 flex-1 truncate">{text}</span><Icon name="chevron-down" size="xs" /></>}>
      {FEED_KINDS.map((k) => (
        <MenuItem key={k.value} label={k.label} checked={chosen.has(k.value)} keepOpen onSelect={() => toggle(k.value)} data-kind-item={k.value} />
      ))}
      <MenuSeparator />
      <MenuItem label={t('All changes')} checked={kinds.length === 0} onSelect={() => onChange([])} data-kind-item="all" />
    </Menu>
  )
}
