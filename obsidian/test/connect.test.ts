// @vitest-environment happy-dom
// Spec "The plugin connects to the user's server only".
import { describe, expect, it } from 'vitest'
import { checkAddress, serverVersionOK } from '../src/address'
import { ConnectError } from '../src/connect'
import { pickSettings } from '../src/main'
import { connected, loaded } from './harness'
import { App, requests } from './obsidian'

describe('connect', () => {
  it('Connect: shows the account, the version and encryption; data.json holds no token', async () => {
    const { plugin, app, server } = await connected()
    expect(plugin.account()).toMatchObject({ name: 'Ada', serverVersion: '0.20.0', encrypted: false })
    expect(plugin.server()).toBe('https://todo.example.com')
    // The token lives in per-device storage only.
    expect(app.local.get('opentodo:token')).toBe(server.token)
    plugin.settings.afterSending = 'remove'
    await plugin.saveSettings()
    const saved = (plugin as unknown as { saved: unknown[] }).saved
    expect(saved.length).toBeGreaterThan(0)
    for (const s of saved) expect(JSON.stringify(s)).not.toContain(server.token)
    expect(Object.keys(saved.at(-1) as object).sort()).toEqual(['afterSending', 'defaultProject', 'sendWithoutAsking'])
    // Every request went to the configured server.
    for (const r of requests) expect(r.url.startsWith('https://todo.example.com/')).toBe(true)
  })

  it('Read token refused: the tab says why, and nothing is stored', async () => {
    const { plugin, app, server } = await loaded({ scope: 'read' })
    const err = await plugin.connectWith('todo.example.com', server.token).catch((e) => e)
    expect(err).toBeInstanceOf(ConnectError)
    expect(err.message).toMatch(/needs a full token/)
    expect(err.message).toMatch(/writes tasks/)
    expect([...app.local.keys()].filter((k) => k !== 'opentodo:installId')).toEqual([])
  })

  it('an agent token is refused too', async () => {
    const { plugin, server } = await loaded({ scope: 'agent' })
    await expect(plugin.connectWith('todo.example.com', server.token)).rejects.toThrow(/AI assistants/)
    expect(plugin.account()).toBeNull()
  })

  it('Old server: names the minimum version and sends nothing', async () => {
    const { plugin, server } = await loaded({ version: '0.18.1' })
    await expect(plugin.connectWith('todo.example.com', server.token)).rejects.toThrow(/0\.18\.1.*0\.19\.1 or newer/)
    expect(plugin.server()).toBeNull()
    expect(server.pushes).toEqual([])
  })

  it('Plain http to a public host: refused, https offered', async () => {
    const { plugin, server } = await loaded()
    const err = await plugin.connectWith('http://todo.example.com', server.token).catch((e) => e)
    expect(err).toBeInstanceOf(ConnectError)
    expect(err.suggestion).toBe('https://todo.example.com')
    expect(requests).toEqual([])
  })

  it('Vault synced to another device: the copy is not connected', async () => {
    const first = await connected()
    // A file-sync service carries the vault and data.json, not Obsidian's local storage.
    const second = new App()
    const { plugin } = await loaded({ app: second })
    ;(plugin as unknown as { data: unknown }).data = (first.plugin as unknown as { data: unknown }).data
    await plugin.onload()
    expect(plugin.server()).toBeNull()
    expect(plugin.account()).toBeNull()
  })

  it('Disconnect removes the token, the lists and a remembered key', async () => {
    const { plugin, app } = await connected()
    app.saveLocalStorage('opentodo:key', 'raw')
    plugin.disconnect()
    expect([...app.local.keys()]).toEqual(['opentodo:installId'])
  })

  it('a settings file edited by hand keeps only the three settings', () => {
    expect(pickSettings({ afterSending: 'done', token: 'x' } as never)).toEqual({ defaultProject: null, afterSending: 'done', sendWithoutAsking: false })
  })
})

describe('address and version rules', () => {
  it('reads addresses', () => {
    expect(checkAddress('todo.example.com')).toEqual({ ok: true, url: 'https://todo.example.com' })
    expect(checkAddress('https://example.com/todo/')).toEqual({ ok: true, url: 'https://example.com/todo' })
    expect(checkAddress('http://localhost:8080')).toEqual({ ok: true, url: 'http://localhost:8080', warning: 'plain_http' })
    expect(checkAddress('http://192.168.1.20')).toMatchObject({ ok: true, warning: 'plain_http' })
    expect(checkAddress('http://10.0.0.5:8080')).toMatchObject({ ok: true })
    expect(checkAddress('http://8.8.8.8')).toEqual({ ok: false, reason: 'insecure', suggestion: 'https://8.8.8.8' })
    expect(checkAddress('ftp://x')).toMatchObject({ ok: false, reason: 'invalid' })
    expect(checkAddress('https://user:pw@x.com')).toMatchObject({ ok: false })
    expect(checkAddress('')).toMatchObject({ ok: false })
  })

  it('compares versions', () => {
    expect(serverVersionOK('0.20.0')).toBe(true)
    expect(serverVersionOK('v0.19.1')).toBe(true)
    expect(serverVersionOK('v0.19.0-12-gabc1234')).toBe(true)
    expect(serverVersionOK('v0.19.0-12-gabc1234-dirty')).toBe(true)
    expect(serverVersionOK('0.19.0')).toBe(false)
    expect(serverVersionOK('v0.18.9-3-g0000000')).toBe(false)
    expect(serverVersionOK('dev')).toBe(true)
    expect(serverVersionOK('3c3f390')).toBe(true)
    expect(serverVersionOK('1.0.0')).toBe(true)
  })
})
