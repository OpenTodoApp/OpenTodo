// The native shell bridge (OpenSpec change native-shells, "The bridge is optional and versioned").
import { afterEach, describe, expect, it, vi } from 'vitest'
import { biometricRead, biometricStore, has, needsLightIcons, olderThan, openExternal, publishWidget, scheduleReminders, setSystemBars, shell, shellOutdated, testNotification, type OpenTodoShell } from './shell'

const g = globalThis as unknown as { window?: { opentodoShell?: OpenTodoShell } }

function install(s: Partial<OpenTodoShell> | undefined) {
  g.window = { opentodoShell: s as OpenTodoShell | undefined }
}

afterEach(() => { delete g.window })

describe('shell bridge', () => {
  it('is absent in a browser: every helper is a no-op', async () => {
    install(undefined)
    expect(shell()).toBeNull()
    expect(has('reminders')).toBe(false)
    expect(await scheduleReminders([])).toBeNull()
    expect(await testNotification()).toBeNull()
    expect(publishWidget({ updatedAt: 1, locked: false, count: 0, overdue: 0, tasks: [] })).toBe(false)
    expect(await biometricRead()).toBeNull()
    expect(openExternal('https://example.com')).toBe(false)
    expect(shellOutdated()).toBe(false)
  })

  it('ignores an object of the wrong shape', () => {
    install({ bridge: 'one' as unknown as number, capabilities: [] })
    expect(shell()).toBeNull()
  })

  it('never calls a method the shell does not list', async () => {
    const publish = vi.fn()
    const schedule = vi.fn(() => 'granted' as const)
    install({ bridge: 1, platform: 'android', app: '0.10.0', capabilities: ['reminders', 'share'], publishWidget: publish, scheduleReminders: schedule })
    expect(publishWidget({ updatedAt: 1, locked: false, count: 0, overdue: 0, tasks: [] })).toBe(false)
    expect(publish).not.toHaveBeenCalled()
    expect(await scheduleReminders([{ id: 'r', taskId: 't', fireAt: 5 }])).toBe('granted')
    expect(schedule).toHaveBeenCalledWith(JSON.stringify([{ id: 'r', taskId: 't', fireAt: 5 }]))
  })

  it('reports the permission the shell answers, and biometric results', async () => {
    install({
      bridge: 1, platform: 'android', app: '0.10.0', capabilities: ['reminders', 'biometric', 'links'],
      scheduleReminders: async () => 'denied' as const, biometricStore: async () => true, biometricRead: async () => 'a2V5', openExternal: vi.fn(),
    })
    expect(await scheduleReminders([])).toBe('denied')
    expect(await biometricStore('a2V5')).toBe(true)
    expect(await biometricRead()).toBe('a2V5')
    expect(openExternal('https://maps.example')).toBe(true)
  })

  it('an older shell works for the capabilities both know, and Settings says it is older', () => {
    install({ bridge: 1, platform: 'android', app: '0.9.2', capabilities: ['reminders', 'share'] })
    expect(has('reminders')).toBe(true)
    expect(has('widgets')).toBe(false)
    expect(shellOutdated()).toBe(true)
  })

  it('compares dotted versions numerically', () => {
    expect(olderThan('0.9.9', '0.10.0')).toBe(true)
    expect(olderThan('0.10.0', '0.10.0')).toBe(false)
    expect(olderThan('v1.0.0-rc.1', '0.10.0')).toBe(false)
  })
})

// theme-engine D8, task 6.1: the system bars follow the theme, only on a shell that lists them.
describe('system bars', () => {
  it('hands the colour over only when the shell lists system-bars', () => {
    const calls: string[] = []
    install({ bridge: 1, platform: 'android', app: '0.20.0', capabilities: ['reminders'], setSystemBars: (j) => void calls.push(j) })
    expect(setSystemBars('#2e3440')).toBe(false)
    expect(calls).toEqual([])
    install({ bridge: 1, platform: 'android', app: '0.20.0', capabilities: ['system-bars'], setSystemBars: (j) => void calls.push(j) })
    expect(setSystemBars('#2e3440')).toBe(true)
    expect(setSystemBars('#fdf6e3')).toBe(true)
    expect(calls).toEqual(['{"color":"#2e3440","dark":true}', '{"color":"#fdf6e3","dark":false}'])
    expect(setSystemBars('red')).toBe(false)
  })

  it('chooses light icons where white reads better than black', () => {
    expect(needsLightIcons('#047857')).toBe(true)
    expect(needsLightIcons('#0d0e10')).toBe(true)
    expect(needsLightIcons('#ffffff')).toBe(false)
    expect(needsLightIcons('#88c0d0')).toBe(false)
  })
})
