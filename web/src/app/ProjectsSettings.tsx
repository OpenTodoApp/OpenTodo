// Settings → Data (OpenSpec trash-and-history, unarchive-projects; settings-redesign D3).
// The archived projects themselves are listed on the All projects page (sidebar-favourites
// D6); this section links there with the list open.
import { useLiveQuery } from 'dexie-react-hooks'
import { getAutoArchive, setAutoArchive } from '../lib/archive'
import { SettingRow, SettingsSection } from '../ui'
import { Switch } from '../ui'
import { navigate } from './router'
import { followLink } from './settingsLinks'
import { t } from '../lib/i18n'
import { act } from './actionError'
import { cardCopy, rowCopy, SETTINGS_COPY } from '../lib/settingsCopy'

/** Per-device opt-out of automatic archiving (trash-and-history), stored in local meta, and the way to the archived projects (unarchive-projects). */
export function AutoArchiveSection() {
  const on = useLiveQuery(getAutoArchive, [], true)
  return <AutoArchiveView on={on} onChange={(v) => act(setAutoArchive(v))} />
}

export function AutoArchiveView({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <SettingsSection {...cardCopy('projects')} description={
      <>{t.rich(SETTINGS_COPY.projects.description, { a: (chunks) => <a className="text-accent underline" href="/trash" onClick={(e) => { e.preventDefault(); navigate({ view: 'trash' }) }}>{chunks}</a> })}</>
    }>
      <SettingRow {...rowCopy('projects', 'auto')}
        control={<Switch checked={on} onChange={onChange} label={t('Archive projects automatically after 30 days without open tasks (this device)')} hideLabel />} />
      <SettingRow {...rowCopy('projects', 'archived')}
        control={<a className="ui-btn ui-btn--secondary ui-btn--sm" href="/projects#archived" data-archived-link
          onClick={(e) => followLink(e, { view: 'projects', archived: true })}>{t('Show archived projects')}</a>} />
    </SettingsSection>
  )
}
