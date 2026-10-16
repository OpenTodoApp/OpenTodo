// Settings → Data: export, import and sync status (OpenSpec settings-navigation; settings-redesign D3).
import { useEffect } from 'react'
import { keysOf } from '../lib/shortcuts'
import { Kbd } from './shortcuts/Kbd'
import { formatBytes, refreshLimits, useAttachmentLimits } from '../lib/attachments'
import { useSyncStatus } from '../lib/sync'
import { DEMO_RESTRICTED_NOTE } from '../lib/demo'
import type { AttachmentLimits, SyncState } from '../lib/types'
import { Button } from '../ui'
import { Badge } from '../ui'
import { Icon } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import type { HueName } from '../ui'
import { followLink } from './SettingsView'
import { useDateTimeFormat } from './DateTimePrefsProvider'

const SYNC: Record<SyncState, { label: string; hue: HueName }> = {
  idle: { label: 'Up to date', hue: 'green' },
  syncing: { label: 'Syncing', hue: 'blue' },
  reseeding: { label: 'Reloading', hue: 'blue' },
  offline: { label: 'Offline', hue: 'slate' },
  error: { label: 'Error', hue: 'red' },
  unauthenticated: { label: 'Signed out', hue: 'orange' },
  restricted: { label: 'Restricted', hue: 'orange' },
  locked: { label: 'Locked', hue: 'orange' },
  limited: { label: 'Slowed down', hue: 'orange' },
}

export interface SyncSummary {
  state: SyncState
  pending: number
  lastSyncedAt: number | null
  error: string | null
}

const linkButton = 'ui-btn ui-btn--secondary ui-btn--sm'

/** Pure rendering of Settings → Data; `sync` comes from the live sync status. */
/** "230 MB of 1 GB used", "12 MB used (no total)". */
export function usageText(l: AttachmentLimits): string {
  return l.quota_bytes > 0 ? `${formatBytes(l.used_bytes)} of ${formatBytes(l.quota_bytes)} used` : `${formatBytes(l.used_bytes)} used (no total)`
}

export function YourDataView({ demo, isOwner, sync, attachments = null }: { demo: boolean; isOwner: boolean; sync: SyncSummary; attachments?: AttachmentLimits | null }) {
  const dt = useDateTimeFormat()
  const s = SYNC[sync.state] ?? { label: sync.state, hue: 'slate' as HueName }
  return (
    <SettingsSection title="Your data" headingId="data-heading" testId="data-panel"
      description="Everything you see is stored on this device and on your server.">
      <SettingRow label="Export"
        description="Everything you can see as one JSON file, including the Trash. Keep it as a personal copy or move to another server."
        control={(
          <>
            <a className={linkButton} href="/api/v1/export" download="opentodo-export.json"><Icon name="download" size="sm" />Download export (JSON)</a>
            {!demo && attachments && (attachments.enabled || attachments.used_bytes > 0) && (
              <a className={linkButton} href="/api/v1/export?format=zip" download="opentodo-export.zip"><Icon name="paperclip" size="sm" />Download export with files (ZIP)</a>
            )}
          </>
        )} />
      {!demo && attachments && (attachments.enabled || attachments.used_bytes > 0) && (
        <SettingRow label="Attachments"
          description={attachments.enabled ? `Files may be up to ${formatBytes(attachments.max_file_bytes)} each.` : 'Adding files is turned off on this server.'}
          status={<span data-testid="attachment-usage">{usageText(attachments)}</span>} />
      )}
      <SettingRow label="Import"
        description={<>An OpenTodo export, a CSV file or another task manager’s JSON export (open this with <Kbd k={keysOf('go.import')} />).</>}
        status={demo ? <span id="demo-import-note" className="text-muted">Import: {DEMO_RESTRICTED_NOTE}</span> : undefined}
        control={demo
          ? <Button size="sm" disabled aria-describedby="demo-import-note">Import data…</Button>
          : <a className={linkButton} href="/settings/import" onClick={(e) => followLink(e, { view: 'import' })}><Icon name="upload" size="sm" />Import data…</a>} />
      <SettingRow label="Sync"
        status={(
          <span className="flex flex-wrap items-center gap-2" data-testid="sync-summary">
            <Badge hue={s.hue}>{s.label}</Badge>
            <span className="text-muted">
              {sync.pending ? `${sync.pending} change(s) waiting to upload.` : 'No changes waiting.'}
              {sync.lastSyncedAt ? ` Last synced ${dt.formatInstant(sync.lastSyncedAt, 'datetime')}.` : ''}
            </span>
          </span>
        )} />
      {sync.error && sync.state === 'error' && <div className="py-3"><Notice tone="danger">{sync.error}</Notice></div>}
      {isOwner && (
        <SettingRow label="Backups"
          status={(
            <span data-testid="backups-link">
              Backups of the whole server are under{' '}
              <a className="text-accent underline" href="/settings/server" onClick={(e) => followLink(e, { view: 'settings', section: 'server' })}>Settings → Server</a>.
            </span>
          )} />
      )}
    </SettingsSection>
  )
}

export function YourDataSection({ demo, isOwner }: { demo: boolean; isOwner: boolean }) {
  const sync = useSyncStatus()
  const attachments = useAttachmentLimits()
  useEffect(() => { void refreshLimits() }, [])
  return <YourDataView demo={demo} isOwner={isOwner} sync={sync} attachments={attachments} />
}
