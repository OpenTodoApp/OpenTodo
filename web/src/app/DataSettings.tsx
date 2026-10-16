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
import { t } from '../lib/i18n'

const SYNC: Record<SyncState, { label: string; hue: HueName }> = {
  idle: { get label() { return t('Up to date') }, hue: 'green' },
  syncing: { get label() { return t('Syncing') }, hue: 'blue' },
  reseeding: { get label() { return t('Reloading') }, hue: 'blue' },
  offline: { get label() { return t('Offline') }, hue: 'slate' },
  error: { get label() { return t('Error') }, hue: 'red' },
  unauthenticated: { get label() { return t('Signed out') }, hue: 'orange' },
  restricted: { get label() { return t('Restricted') }, hue: 'orange' },
  locked: { get label() { return t('Locked') }, hue: 'orange' },
  limited: { get label() { return t('Slowed down') }, hue: 'orange' },
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
  return l.quota_bytes > 0 ? t('{used} of {total} used', { used: formatBytes(l.used_bytes), total: formatBytes(l.quota_bytes) }) : t('{used} used (no total)', { used: formatBytes(l.used_bytes) })
}

export function YourDataView({ demo, isOwner, sync, attachments = null }: { demo: boolean; isOwner: boolean; sync: SyncSummary; attachments?: AttachmentLimits | null }) {
  const dt = useDateTimeFormat()
  const s = SYNC[sync.state] ?? { label: sync.state, hue: 'slate' as HueName }
  return (
    <SettingsSection title={t('Your data')} headingId="data-heading" testId="data-panel"
      description={t('Everything you see is stored on this device and on your server.')}>
      <SettingRow label={t('Export')}
        description={t('Everything you can see as one JSON file, including the Trash. Keep it as a personal copy or move to another server.')}
        control={(
          <>
            <a className={linkButton} href="/api/v1/export" download="opentodo-export.json"><Icon name="download" size="sm" />{t('Download export (JSON)')}</a>
            {!demo && attachments && (attachments.enabled || attachments.used_bytes > 0) && (
              <a className={linkButton} href="/api/v1/export?format=zip" download="opentodo-export.zip"><Icon name="paperclip" size="sm" />{t('Download export with files (ZIP)')}</a>
            )}
          </>
        )} />
      {!demo && attachments && (attachments.enabled || attachments.used_bytes > 0) && (
        <SettingRow label={t('Attachments')}
          description={attachments.enabled ? t('Files may be up to {bytes} each.', { bytes: formatBytes(attachments.max_file_bytes) }) : t('Adding files is turned off on this server.')}
          status={<span data-testid="attachment-usage">{usageText(attachments)}</span>} />
      )}
      <SettingRow label={t('Import')}
        description={<>{t.rich('An OpenTodo export, a CSV file or another task manager’s JSON export (open this with {kbd}).', { kbd: <Kbd k={keysOf('go.import')} /> })}</>}
        status={demo ? <span id="demo-import-note" className="text-muted">{t('Import: {DEMO_RESTRICTED_NOTE}', { DEMO_RESTRICTED_NOTE })}</span> : undefined}
        control={demo
          ? <Button size="sm" disabled aria-describedby="demo-import-note">{t('Import data…')}</Button>
          : <a className={linkButton} href="/settings/import" onClick={(e) => followLink(e, { view: 'import' })}><Icon name="upload" size="sm" />{t('Import data…')}</a>} />
      <SettingRow label={t('Sync')}
        status={(
          <span className="flex flex-wrap items-center gap-2" data-testid="sync-summary">
            <Badge hue={s.hue}>{s.label}</Badge>
            <span className="text-muted">
              {sync.pending ? t('{n, plural, one {# change waiting to upload.} other {# changes waiting to upload.}}', { n: sync.pending }) : t('No changes waiting.')}
              {sync.lastSyncedAt ? ` ${t('Last synced {instant}.', { instant: dt.formatInstant(sync.lastSyncedAt, 'datetime') })}` : ''}
            </span>
          </span>
        )} />
      {sync.error && sync.state === 'error' && <div className="py-3"><Notice tone="danger">{sync.error}</Notice></div>}
      {isOwner && (
        <SettingRow label={t('Backups')}
          status={(
            <span data-testid="backups-link">
              {t.rich('Backups of the whole server are under <a>Settings → Server</a>.', { a: (chunks) => <a className="text-accent underline" href="/settings/server" onClick={(e) => followLink(e, { view: 'settings', section: 'server' })}>{chunks}</a> })}
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
