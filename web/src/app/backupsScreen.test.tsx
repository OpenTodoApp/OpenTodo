import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { defaultBackupSettings } from '../lib/backups'
import type { BackupSettings, BackupStatus } from '../lib/types'
import { BackupsPanelView, type BackupsPanelViewProps, type SecretInputs } from './BackupsPanel'

const noop = () => {}
const noSecrets: SecretInputs = { s3SecretKey: '', webdavPassword: '', passphrase: '', removePassphrase: false, acknowledged: false }

function status(patch: Partial<BackupStatus> = {}): BackupStatus {
  return {
    enabled: true,
    destination: 'local',
    schedule: { frequency: 'daily', time: '03:00', weekday: 0 },
    encrypted: false,
    running: null,
    nextRunAt: Date.UTC(2026, 9, 11, 3, 0),
    lastRun: {
      id: 'r1', kind: 'scheduled', startedAt: Date.UTC(2026, 9, 10, 3, 0), finishedAt: Date.UTC(2026, 9, 10, 3, 0, 1),
      status: 'succeeded', bytes: 182344, destination: 'local: /data/backups', archiveName: 'opentodo-20261010-030000-4f1c0a9e.tar.gz',
      error: '', durationMs: 412,
    },
    history: [],
    ...patch,
  }
}

function render(patch: Partial<BackupsPanelViewProps> = {}, settings: Partial<BackupSettings> = {}): string {
  const props: BackupsPanelViewProps = {
    draft: { ...defaultBackupSettings(), ...settings },
    flags: { hasS3SecretKey: false, hasWebdavPassword: false, hasPassphrase: false },
    status: status(),
    secrets: noSecrets,
    offline: false,
    busy: null,
    message: null,
    error: null,
    onDraft: noop, onSecrets: noop, onSave: noop, onTest: noop, onRun: noop,
    ...patch,
  }
  return renderToStaticMarkup(<BackupsPanelView {...props} />)
}

/** Every element carrying `disabled` (buttons and fieldsets). */
function disabledCount(html: string): number {
  return (html.match(/ disabled=""/g) ?? []).length
}

describe('Settings → Backups', () => {
  it('renders the local destination form', () => {
    const html = render()
    expect(html).toContain('name="local-dir"')
    expect(html).not.toContain('name="s3-bucket"')
    expect(html).not.toContain('name="webdav-url"')
    expect(html).toContain('Every day at 03:00')
    expect(html).toContain('178.1 KB')
  })

  it('renders the S3 form with secret presence, never a value', () => {
    const html = render({ flags: { hasS3SecretKey: true, hasWebdavPassword: false, hasPassphrase: false } }, {
      destination: 's3',
      s3: { endpoint: 'https://s3.example.com', region: 'eu-central-1', bucket: 'b', prefix: 'p', accessKey: 'AK', pathStyle: true },
    })
    for (const name of ['s3-endpoint', 's3-region', 's3-bucket', 's3-prefix', 's3-access-key', 's3-secret-key', 's3-path-style']) {
      expect(html).toContain(`name="${name}"`)
    }
    expect(html).not.toContain('name="local-dir"')
    expect(html).toContain('Stored. Leave empty to keep it.')
    expect(html).toMatch(/type="password"[^>]*name="s3-secret-key" value=""/)
  })

  it('renders the WebDAV form', () => {
    const html = render({}, { destination: 'webdav', webdav: { url: 'https://dav.example.com/x/', username: 'me', allowHttp: false } })
    for (const name of ['webdav-url', 'webdav-username', 'webdav-password', 'webdav-allow-http']) {
      expect(html).toContain(`name="${name}"`)
    }
    expect(html).toContain('Not set.')
    expect(html).not.toContain('name="s3-bucket"')
  })

  it('shows the weekday only for weekly schedules', () => {
    expect(render({}, { schedule: { frequency: 'daily', time: '03:00', weekday: 1 } })).not.toContain('name="schedule-weekday"')
    expect(render({}, { schedule: { frequency: 'weekly', time: '03:00', weekday: 1 } })).toContain('name="schedule-weekday"')
    expect(render({}, { schedule: { frequency: 'off', time: '03:00', weekday: 1 } })).not.toContain('name="schedule-time"')
  })

  it('warns that a passphrase is irrecoverable and blocks saving until acknowledged', () => {
    const typed = render({ secrets: { ...noSecrets, passphrase: 'secret words' } })
    expect(typed).toContain('A forgotten passphrase cannot be recovered')
    expect(typed).toMatch(/<button class="btn-primary" disabled="">Save backup settings/)
    const acked = render({ secrets: { ...noSecrets, passphrase: 'secret words', acknowledged: true } })
    expect(acked).toMatch(/<button class="btn-primary">Save backup settings/)
    expect(render()).not.toContain('cannot be recovered')
  })

  it('shows a run in progress, then failures with the destination error', () => {
    const running = render({ status: status({ running: { ...status().lastRun!, id: 'r2', status: 'running', finishedAt: null } }) })
    expect(running).toContain('Backup in progress')
    expect(running).toMatch(/<button type="button" class="btn-primary" disabled="">Backing up/)
    const failed = render({ status: status({ lastRun: { ...status().lastRun!, status: 'failed', error: 'webdav put: connection refused' } }) })
    expect(failed).toContain('connection refused')
  })

  it('offline: shows the cached status and disables every action', () => {
    const online = render()
    const offline = render({ offline: true })
    expect(offline).toContain('You are offline')
    expect(offline).toContain('Every day at 03:00') // the cached status is still shown
    expect(offline).toMatch(/<button type="button" class="btn-primary" disabled="">Back up now/)
    expect(offline).toMatch(/disabled="">Test destination/)
    expect(offline).toMatch(/<button class="btn-primary" disabled="">Save backup settings/)
    // Every fieldset of the form is disabled too.
    expect(disabledCount(offline)).toBeGreaterThan(disabledCount(online))
    expect(online).not.toContain('You are offline')
    // Nothing cached yet.
    expect(render({ offline: true, status: null })).toContain('No status fetched yet')
  })
})
