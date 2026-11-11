// @vitest-environment happy-dom
// A section's overview (OpenSpec change settings-foundation, settings-navigation
// "Settings sub-pages", scenario "Warning on the overview"): a state the sub-page
// shows in the warning or danger tone has that tone on its overview row; neutral
// states stay plain text.
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import type { BackupStatus, SmtpSettings, User, Webhook } from '../lib/types'
import { render, waitFor } from '../ui/test-utils'
import { SettingsOverview } from './SettingsOverview'
import { pageStatus } from './settingsStatus'
import { SETTINGS_SECTIONS } from './settingsSections'

const owner: User = { id: 'u1', email: 'owner@example.com', name: 'Olive', role: 'owner', createdAt: 1 }
const section = (id: string) => SETTINGS_SECTIONS.find((s) => s.id === id)!

const noBackup: BackupStatus = {
  enabled: false, destination: 'local', schedule: { frequency: 'off', time: '03:00', weekday: 0 } as BackupStatus['schedule'],
  encrypted: false, running: null, nextRunAt: null, lastRun: null, history: [],
}
const noMail = { configured: false } as SmtpSettings

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

/** The state shown on one overview row: its text and its tone, or null for none. */
function row(root: HTMLElement, page: string): { text: string; tone: string | null } | null {
  const el = root.querySelector(`[data-settings-subpage="${page}"] [data-settings-status]`)
  if (!el) return null
  return { text: el.textContent ?? '', tone: el.querySelector('[data-status]')?.getAttribute('data-status') ?? null }
}

describe('Warning on the overview', () => {
  it('no backup and no outgoing email show a warning dot; other rows keep the neutral style', async () => {
    // The rows without a mock below are refused: they show no state.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })))
    vi.spyOn(api, 'backupStatus').mockResolvedValue(noBackup)
    vi.spyOn(api, 'smtpSettings').mockResolvedValue(noMail)
    vi.spyOn(api, 'attachmentSettings').mockResolvedValue({ enabled: true, max_file_mb: 25, quota_mb: 0 })
    const r = await render(<SettingsOverview section={section('server')} user={owner} />)
    await waitFor(() => !!row(r.container, 'backups'), 'the states')
    expect(row(r.container, 'backups')).toEqual({ text: 'No backup yet', tone: 'warn' })
    expect(row(r.container, 'outgoing-email')).toEqual({ text: 'Not configured', tone: 'warn' })
    expect(row(r.container, 'attachments')).toEqual({ text: 'On', tone: null })
  })

  it('a failed last backup is the danger tone; a working one is plain', async () => {
    const run = { id: 'r1', status: 'failed', startedAt: 1, finishedAt: 2 } as NonNullable<BackupStatus['lastRun']>
    vi.spyOn(api, 'backupStatus').mockResolvedValueOnce({ ...noBackup, lastRun: run })
    expect(await pageStatus(owner, 'server', 'backups')).toEqual({ text: 'Failed', tone: 'danger' })
    vi.spyOn(api, 'backupStatus').mockResolvedValueOnce({ ...noBackup, enabled: true, lastRun: { ...run, status: 'succeeded' } })
    expect(await pageStatus(owner, 'server', 'backups')).toEqual({ text: 'On' })
  })

  it('two-factor off warns; a failing webhook is the danger tone', async () => {
    vi.spyOn(api, 'mfaStatus').mockResolvedValue({ mfa: { enrolled: false } } as Awaited<ReturnType<typeof api.mfaStatus>>)
    expect(await pageStatus(owner, 'account', 'security')).toEqual({ text: 'Two-factor off', tone: 'warn' })
    const hook = (over: Partial<Webhook>) => ({ id: 'w', enabled: true, consecutiveFailures: 0, disabledReason: '', ...over }) as Webhook
    vi.spyOn(api, 'listWebhooks').mockResolvedValueOnce({ webhooks: [hook({}), hook({ consecutiveFailures: 2 })] } as Awaited<ReturnType<typeof api.listWebhooks>>)
    expect(await pageStatus(owner, 'integrations', 'webhooks')).toEqual({ text: '2', tone: 'danger' })
    vi.spyOn(api, 'listWebhooks').mockResolvedValueOnce({ webhooks: [hook({})] } as Awaited<ReturnType<typeof api.listWebhooks>>)
    expect(await pageStatus(owner, 'integrations', 'webhooks')).toEqual({ text: '1' })
  })

  it('a refused loader shows no state', async () => {
    vi.spyOn(api, 'backupStatus').mockRejectedValue(new Error('forbidden'))
    expect(await pageStatus(owner, 'server', 'backups')).toBeNull()
  })
})
