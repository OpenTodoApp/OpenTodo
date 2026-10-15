// Settings → Data (OpenSpec trash-and-history, unarchive-projects; settings-redesign D3).
import { useLiveQuery } from 'dexie-react-hooks'
import { getAutoArchive, setAutoArchive } from '../lib/archive'
import { SettingRow, SettingsSection } from '../ui'
import { Switch } from '../ui'
import { ArchivedProjectsSection } from './ArchivedProjects'
import { navigate } from './router'

/** Per-device opt-out of automatic archiving (trash-and-history), stored in local meta, and the archived projects list (unarchive-projects). */
export function AutoArchiveSection() {
  const on = useLiveQuery(getAutoArchive, [], true)
  return <AutoArchiveView on={on} onChange={(v) => void setAutoArchive(v)}><ArchivedProjectsSection /></AutoArchiveView>
}

export function AutoArchiveView({ on, onChange, children }: { on: boolean; onChange: (on: boolean) => void; children?: React.ReactNode }) {
  return (
    <SettingsSection title="Projects" headingId="projects-heading" description={
      <>Deleted items stay in the <a className="text-accent underline" href="/trash" onClick={(e) => { e.preventDefault(); navigate({ view: 'trash' }) }}>Trash</a> until restored or purged.</>
    }>
      <SettingRow label="Archive automatically" description="Archive projects after 30 days without open tasks. Each device keeps its own setting."
        control={<Switch checked={on} onChange={onChange} label="Archive projects automatically after 30 days without open tasks (this device)" hideLabel />} />
      {children && <div className="py-3">{children}</div>}
    </SettingsSection>
  )
}
