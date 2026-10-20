// Settings → Data (OpenSpec trash-and-history, unarchive-projects; settings-redesign D3).
// The archived projects themselves are listed on the All projects page (sidebar-favourites
// D6); this section links there with the list open.
import { useLiveQuery } from 'dexie-react-hooks'
import { getAutoArchive, setAutoArchive } from '../lib/archive'
import { SettingRow, SettingsSection } from '../ui'
import { Switch } from '../ui'
import { navigate } from './router'
import { followLink } from './SettingsView'
import { t } from '../lib/i18n'
import { act } from './actionError'

/** Per-device opt-out of automatic archiving (trash-and-history), stored in local meta, and the way to the archived projects (unarchive-projects). */
export function AutoArchiveSection() {
  const on = useLiveQuery(getAutoArchive, [], true)
  return <AutoArchiveView on={on} onChange={(v) => act(setAutoArchive(v))} />
}

export function AutoArchiveView({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <SettingsSection title={t('Projects')} headingId="projects-heading" description={
      <>{t.rich('Deleted items stay in the <a>Trash</a> until restored or purged.', { a: (chunks) => <a className="text-accent underline" href="/trash" onClick={(e) => { e.preventDefault(); navigate({ view: 'trash' }) }}>{chunks}</a> })}</>
    }>
      <SettingRow label={t('Archive automatically')} description={t('Archive projects after 30 days without open tasks. Each device keeps its own setting.')}
        control={<Switch checked={on} onChange={onChange} label={t('Archive projects automatically after 30 days without open tasks (this device)')} hideLabel />} />
      <SettingRow label={t('Archived projects')} description={t('Listed on the All projects page, where each can be restored.')}
        control={<a className="ui-btn ui-btn--secondary ui-btn--sm" href="/projects#archived" data-archived-link
          onClick={(e) => followLink(e, { view: 'projects', archived: true })}>{t('Show archived projects')}</a>} />
    </SettingsSection>
  )
}
