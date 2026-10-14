import type { Meta, StoryObj } from '@storybook/react-vite'
import { defaultBackupSettings } from '../lib/backups'
import type { BackupRun, BackupStatus } from '../lib/types'
import { BackupsPanelView, type BackupsPanelViewProps } from './BackupsPanel'

const noop = () => {}
const now = 1_760_000_000_000
const hour = 3_600_000
const ok: BackupRun = {
  id: 'r1', kind: 'scheduled', startedAt: now - 9 * hour, finishedAt: now - 9 * hour + 1200, status: 'succeeded', bytes: 182_344,
  destination: 'local: /data/backups', archiveName: 'opentodo-20261010-030000-4f1c0a9e.tar.gz', error: '', durationMs: 412,
}
const failed: BackupRun = { ...ok, id: 'r0', status: 'failed', bytes: 0, error: 'webdav put: dial tcp 10.0.0.4:443: connection refused', archiveName: '' }
const status = (patch: Partial<BackupStatus> = {}): BackupStatus => ({
  enabled: true, destination: 'local', schedule: { frequency: 'daily', time: '03:00', weekday: 0 }, encrypted: false, running: null,
  nextRunAt: now + 15 * hour, lastRun: ok, history: [ok, { ...ok, id: 'r2', kind: 'manual', startedAt: now - 30 * hour }], ...patch,
})
const base: BackupsPanelViewProps = {
  draft: defaultBackupSettings(), flags: { hasS3SecretKey: false, hasWebdavPassword: false, hasPassphrase: false }, status: status(),
  secrets: { s3SecretKey: '', webdavPassword: '', passphrase: '', removePassphrase: false, acknowledged: false },
  offline: false, busy: null, message: null, error: null, onDraft: noop, onSecrets: noop, onSave: noop, onTest: noop, onRun: noop,
}

const meta: Meta = { title: 'Settings/Backups' }
export default meta
export const Succeeded: StoryObj = { render: () => <BackupsPanelView {...base} message="Destination works: a test file was written and deleted." /> }
export const Failed: StoryObj = { render: () => <BackupsPanelView {...base} status={status({ lastRun: failed, history: [failed, ok] })} error="webdav put: connection refused" /> }
export const Running: StoryObj = { render: () => <BackupsPanelView {...base} status={status({ running: { ...ok, id: 'r3', status: 'running', finishedAt: null }, history: [{ ...ok, id: 'r3', status: 'running', finishedAt: null }, ok] })} /> }
export const NeverRun: StoryObj = { render: () => <BackupsPanelView {...base} status={status({ enabled: false, nextRunAt: null, lastRun: null, history: [] })} draft={{ ...defaultBackupSettings(), schedule: { frequency: 'off', time: '03:00', weekday: 0 } }} /> }
export const Offline: StoryObj = { render: () => <BackupsPanelView {...base} offline /> }
export const OfflineNothingCached: StoryObj = { render: () => <BackupsPanelView {...base} offline status={null} /> }
export const Encrypted: StoryObj = { render: () => <BackupsPanelView {...base} status={status({ encrypted: true })} flags={{ ...base.flags, hasPassphrase: true }} /> }
export const ManyRuns: StoryObj = { render: () => <BackupsPanelView {...base} status={status({ history: Array.from({ length: 14 }, (_, i) => (i % 5 === 2 ? { ...failed, id: `f${i}`, startedAt: now - i * 24 * hour } : { ...ok, id: `h${i}`, startedAt: now - i * 24 * hour })) })} /> }
export const EditingS3: StoryObj = {
  render: () => <BackupsPanelView {...base} editing flags={{ ...base.flags, hasS3SecretKey: true }}
    draft={{ ...defaultBackupSettings(), destination: 's3', s3: { endpoint: 'https://s3.eu-central-1.amazonaws.com', region: 'eu-central-1', bucket: 'opentodo-backups', prefix: 'nas', accessKey: 'AKIA…', pathStyle: false } }} />,
}
export const PassphraseWarning: StoryObj = { render: () => <BackupsPanelView {...base} editing secrets={{ ...base.secrets, passphrase: 'correct horse battery staple' }} /> }
