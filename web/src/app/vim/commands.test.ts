import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createProject, resetDeviceId } from '../../lib/ops'
import type { Project } from '../../lib/types'
import type { Route } from '../router'
import { complete, resolveCommand, runCommand, type CommandContext } from './commands'

let n = 0
beforeEach(() => {
  useDatabase(`vim-commands-${Date.now()}-${n++}`)
  resetDeviceId()
})

function ctx(over: Partial<CommandContext> = {}) {
  const log: string[] = []
  const c: CommandContext = {
    route: { view: 'inbox' },
    today: '2026-10-10',
    projects: [],
    navigate: (r: Route) => void log.push(`nav ${JSON.stringify(r)}`),
    closePanel: () => void log.push('close'),
    sync: () => void log.push('sync'),
    help: () => void log.push('help'),
    ...over,
  }
  return { c, log }
}

const project = (id: string, name: string, position: number, extra: Partial<Project> = {}): Project => ({
  id, name, color: '#000', position, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {}, ...extra,
})

describe('vim command line', () => {
  it(':tod completes to today', async () => {
    expect(complete('tod', [])).toEqual(['today'])
    expect(complete('', []).length).toBe(10)
    expect(complete('pro', [])).toEqual(['project '])
    const { c, log } = ctx()
    expect(await runCommand('tod', c)).toEqual({ ok: true })
    expect(log).toEqual(['nav {"view":"today"}'])
  })

  it(':project pre matches by prefix', async () => {
    const projects = [project('a', 'Errands', 1), project('b', 'Presentation', 2), project('c', 'Prep old', 3, { archived: true }), project('d', 'Preview', 0, { deleted_at: 1 })]
    expect(complete('project pre', projects)).toEqual(['project Presentation'])
    expect(complete('project ', projects)).toEqual(['project Errands', 'project Presentation'])
    const { c, log } = ctx({ projects })
    expect(await runCommand('project pre', c)).toEqual({ ok: true })
    expect(log).toEqual(['nav {"view":"project","id":"b"}'])
    expect(await runCommand('project zzz', c)).toEqual({ ok: false, message: 'No project starts with "zzz"' })
    expect(await runCommand('project', c)).toEqual({ ok: false, message: 'Usage: project <name>' })
  })

  it(':new creates task with view defaults', async () => {
    const p = await createProject({ name: 'Home' })
    const { c } = ctx({ route: { view: 'project', id: p } })
    expect(await runCommand('new Buy milk', c)).toEqual({ ok: true })
    const t = (await db.tasks.toArray()).find((x) => x.title === 'Buy milk')
    expect(t?.project_id).toBe(p)
    // Recorded as ops in the outbox, uploaded on the next sync like quick add.
    expect((await db.outbox.toArray()).some((o) => o.entityId === t?.id && o.field === 'title')).toBe(true)
    const today = ctx({ route: { view: 'today' } })
    await runCommand(':new Call Sam', today.c)
    expect((await db.tasks.toArray()).find((x) => x.title === 'Call Sam')?.due).toEqual({ date: '2026-10-10' })
    expect(await runCommand('new', c)).toEqual({ ok: false, message: 'Usage: new <title>' })
  })

  it(':frobnicate shows message and no op', async () => {
    const { c, log } = ctx()
    const before = await db.outbox.count()
    expect(await runCommand('frobnicate', c)).toEqual({ ok: false, message: 'Unknown command: frobnicate' })
    expect(log).toEqual([])
    expect(await db.outbox.count()).toBe(before)
  })

  it(':q closes panel', async () => {
    const { c, log } = ctx()
    await runCommand('q', c)
    await runCommand('sync', c)
    await runCommand('help', c)
    await runCommand('settings', c)
    expect(log).toEqual(['close', 'sync', 'help', 'nav {"view":"settings"}'])
  })

  it('resolves exact names before prefixes', () => {
    expect(resolveCommand('q')?.name).toBe('q')
    expect(resolveCommand('s')?.name).toBe('settings')
    expect(resolveCommand('sy')?.name).toBe('sync')
    expect(resolveCommand('')).toBeUndefined()
  })
})
