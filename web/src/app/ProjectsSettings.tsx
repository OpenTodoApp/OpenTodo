// Settings → Projects (OpenSpec trash-and-history, unarchive-projects; settings-redesign D3).
import { useLiveQuery } from 'dexie-react-hooks'
import { HelpHeading } from './help/HelpLink'
import { getAutoArchive, setAutoArchive } from '../lib/archive'
import { ArchivedProjectsSection } from './ArchivedProjects'
import { navigate } from './router'

/** Per-device opt-out of automatic archiving (trash-and-history), stored in local meta, and the archived projects list (unarchive-projects). */
export function AutoArchiveSection() {
  const on = useLiveQuery(getAutoArchive, [], true)
  return (
    <section className="space-y-2">
      <HelpHeading screen="settings/projects" className="font-semibold">Projects</HelpHeading>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => void setAutoArchive(e.target.checked)} />
        Archive projects automatically after 30 days without open tasks (this device)
      </label>
      <p className="text-sm text-muted">Each device keeps its own setting. Deleted items stay in the <a className="underline" href="/trash" onClick={(e) => { e.preventDefault(); navigate({ view: 'trash' }) }}>Trash</a> until restored or purged.</p>
      <ArchivedProjectsSection />
    </section>
  )
}
