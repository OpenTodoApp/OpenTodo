import { describe, expect, it } from 'vitest'
import type { Task } from './types'
import { creatorDevice, taskSource } from './taskSource'

const made = (device: string, origin: Task['origin'] = null) =>
  ({ origin, _clock: { created_at: { ts: 1, device }, title: { ts: 1, device } } }) as Pick<Task, 'origin' | '_clock'>

describe('taskSource', () => {
  it('reads the origin first', () => {
    expect(taskSource(made('server', { kind: 'email', id: '<a@b>' }))).toEqual({ kind: 'email', text: 'From email' })
    expect(taskSource(made('d1', { kind: 'email', id: 'x', url: 'https://mail.google.com/x', provider: 'gmail' })).text).toBe('From email (Gmail)')
    expect(taskSource(made('d1', { kind: 'url', url: 'https://www.example.org/a' }))).toEqual({ kind: 'web', text: 'From example.org' })
    expect(taskSource(made('issues:c1', { kind: 'issue', provider: 'github', id: 'acme/app#12', url: 'https://github.com/acme/app/issues/12' })).text).toBe('From acme/app#12')
    expect(taskSource(made('import', { kind: 'import', provider: 'todoist', id: '9' })).text).toBe('Imported from todoist')
  })

  it('falls back to the device that created the task', () => {
    expect(taskSource(made('caldav:p1')).kind).toBe('calendar')
    expect(taskSource(made('agent:tok')).kind).toBe('assistant')
    expect(taskSource(made('assistant:dev')).kind).toBe('assistant')
    expect(taskSource(made('import')).kind).toBe('import')
    expect(taskSource(made('vault:v1')).kind).toBe('vault')
    expect(taskSource(made('server')).kind).toBe('api')
  })

  it('says only "Added" for a task made in the app', () => {
    expect(taskSource(made('a-device-uuid'))).toEqual({ kind: 'app', text: 'Added' })
    expect(taskSource({ origin: undefined, _clock: {} } as Pick<Task, 'origin' | '_clock'>).kind).toBe('app')
  })

  it('takes the title clock when there is no created_at clock', () => {
    expect(creatorDevice({ _clock: { title: { ts: 1, device: 'caldav:x' } } })).toBe('caldav:x')
  })
})
