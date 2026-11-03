// The `ot` command and the browser extension against the real server (OpenSpec
// change `stability-contract`, design D5). Like the sync client's contract tests,
// they run on every server build; with RECORD_V1_CLIENTS=1 the recorder in front
// of the server keeps their calls as internal/sync/testdata/v1_clients/ot.json and
// extension.json, which internal/tenant TestV1ClientsReplay replays against every
// later server.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { call } from '../test/contract'

const base = inject('serverUrl')
const otBin = path.resolve(process.env.OT_BIN ?? fileURLToPath(new URL('../../../bin/ot', import.meta.url)))
const extensionApi = fileURLToPath(new URL('../../../extension/api.js', import.meta.url))

/** The calls that follow belong to `name` in a recording (a no-op without the recorder). */
async function recordAs(name: string): Promise<void> {
  await fetch(`${base}/__record/client?name=${name}`, { method: 'POST' }).catch(() => undefined)
}

/** An account and a full-access API token for it. */
async function tokenAccount(name: string): Promise<string> {
  const session = { cookie: '' }
  await call(session, 'POST', '/api/v1/auth/register', { email: `${name}-${Date.now()}@example.com`, name, password: 'client contract password' })
  const { secret } = await call<{ secret: string }>(session, 'POST', '/api/v1/tokens', { name })
  return secret
}

describe('v1 clients against the server', () => {
  const config = mkdtempSync(path.join(tmpdir(), 'ot-contract-'))
  afterAll(async () => {
    await recordAs('web')
    rmSync(config, { recursive: true, force: true })
  })

  it.skipIf(!existsSync(otBin))('ot adds, lists, edits and completes a task with --json', async () => {
    await recordAs('ot')
    const token = await tokenAccount('ot')
    const env = { ...process.env, OPENTODO_URL: base, OPENTODO_TOKEN: token, OPENTODO_CONFIG: path.join(config, 'config.json'), NO_COLOR: '1' }
    const ot = (...args: string[]) => JSON.parse(execFileSync(otBin, ['--json', ...args], { env, encoding: 'utf8' }) || 'null')
    const project = ot('project', 'add', 'Garden')
    const task = ot('add', 'Call the plumber', '--project', 'Garden', '--due', '2026-12-01', '--priority', '2', '--label', 'home')
    expect(task.id).toBeTruthy()
    expect(task.project_id).toBe(project.id)
    expect(ot('list').map((t: { id: string }) => t.id)).toContain(task.id)
    ot('today')
    ot('task', 'show', task.id)
    expect(ot('edit', task.id, '--priority', '1').priority).toBe(1)
    ot('done', task.id)
    ot('project', 'list')
  })

  it('the extension reads projects and labels, parses a line and saves a task with a reminder and a time entry', async () => {
    await recordAs('extension')
    const token = await tokenAccount('extension')
    const { createApi } = (await import(/* @vite-ignore */ extensionApi)) as { createApi: (o: { server: string; token: string; key?: string }) => ExtensionApi }
    const api = createApi({ server: base, token, key: 'ext-contract' })
    await api.me()
    expect(await api.projects()).toEqual([])
    await api.labels()
    const parsed = await api.parse('Read the article tomorrow p2 #reading', 'https://example.com/a', '2026-11-03', '09:00')
    expect(parsed).toBeTruthy()
    const label = await api.createLabel('reading', 1)
    const task = await api.createTask({ title: 'Read the article', priority: 2, labels: [label.id], due: { date: '2026-11-04' }, origin: { kind: 'url', url: 'https://example.com/a', title: 'An article' } })
    await api.createReminder({ task_id: task.id, kind: 'relative', offset_minutes: 15 }, 1)
    await api.createTimeEntry({ taskId: task.id, startedAt: 1762160400000, endedAt: 1762162200000 })
  })
})

interface ExtensionApi {
  me: () => Promise<unknown>
  projects: () => Promise<unknown[]>
  labels: () => Promise<unknown[]>
  parse: (line: string, url: string, today: string, now: string) => Promise<unknown>
  createLabel: (name: string, n: number) => Promise<{ id: string }>
  createTask: (body: Record<string, unknown>) => Promise<{ id: string }>
  createReminder: (body: Record<string, unknown>, n: number) => Promise<unknown>
  createTimeEntry: (body: Record<string, unknown>) => Promise<unknown>
}
