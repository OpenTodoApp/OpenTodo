// Settings → Data: export, import and sync status (OpenSpec settings-navigation; settings-redesign D3).
import { HelpHeading } from './help/HelpLink'
import { useSyncStatus } from '../lib/sync'
import { DEMO_RESTRICTED_NOTE } from '../lib/demo'
import { followLink } from './SettingsView'

export function YourDataSection({ demo, isOwner }: { demo: boolean; isOwner: boolean }) {
  const sync = useSyncStatus()
  return (
    <section className="space-y-2">
      <HelpHeading screen="settings/data" className="font-semibold">Your data</HelpHeading>
      <p className="text-sm text-muted">
        Everything you see is stored on this device and on your server. Export it any time as JSON, or import an export,
        a CSV file or another task manager's JSON export (<span className="kbd">g</span> <span className="kbd">Shift+I</span>).
      </p>
      <div className="flex flex-wrap gap-2">
        <a className="btn-secondary" href="/api/v1/export" download="opentodo-export.json">Download export (JSON)</a>
        {demo ? (
          <button type="button" className="btn-secondary" disabled aria-describedby="demo-import-note">Import data…</button>
        ) : (
          <a className="btn-secondary" href="/settings/import"
            onClick={(e) => followLink(e, { view: 'import' })}>Import data…</a>
        )}
      </div>
      {demo && <p id="demo-import-note" className="text-xs text-muted">Import: {DEMO_RESTRICTED_NOTE}</p>}
      <p className="text-xs text-faint">
        Sync: {sync.state}{sync.pending ? `, ${sync.pending} change(s) waiting to upload` : ''}.
      </p>
      {isOwner && (
        <p className="text-sm" data-testid="backups-link">
          Backups of the whole server are under{' '}
          <a className="underline" href="/settings/backups" onClick={(e) => followLink(e, { view: 'settings', section: 'backups' })}>Settings → Backups</a>.
        </p>
      )}
    </section>
  )
}
