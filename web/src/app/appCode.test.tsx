// Settings → About → App code and the refusal banner (OpenSpec change
// signed-web-app, design D10 and D18).
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { diagnosticsLine, officialFingerprints, type TrustRecord } from '../lib/appTrust'
import { AppCodeView } from './AppCodeRow'
import { UpdateBanner } from './UpdateBanner'
import RefusedBanner from './RefusedBanner'
import { currentRefusal, dismissRefusal, resetAppUpdate, updateReason, watchAppUpdates } from '../lib/appUpdate'

const FP = 'aeca03a5fc4a754f6d9b9b66c61771f3375ce1d563b9a68e7efa36752b5b8b87'
const files = { 'index.html': { sha256: 'a', size: 1, load: 'install' as const } }
const signed: TrustRecord = {
  mode: 'signed', keys: ['k'], signer: FP, refuse: false, announced: [],
  current: { version: '1.3.0', payloadHash: 'p', cache: 'c', files, at: 0 },
  lastCheck: { at: Date.UTC(2026, 10, 8, 10, 12), version: '1.3.0', passed: true, refused: false },
}

describe('the App code row', () => {
  it('names an official key with its short fingerprint, the Security page and Verify', () => {
    const html = renderToStaticMarkup(<AppCodeView record={signed} official serverVersion="1.3.0" />)
    expect(html).toContain('Signed by OpenTodo')
    expect(html).toContain('AECA 03A5 FC4A 754F')
    expect(html).toContain('href="https://open-todo.app/security#app-signing"')
    expect(html).toContain(`href="https://open-todo.app/security/verify#${FP}"`)
    expect(html).toContain('Version 1.3.0')
    expect(html).not.toContain('This server runs')
    expect(html).not.toContain('data-app-code-check')
  })

  it("names another key as this server's, and says when the server runs another version", () => {
    const html = renderToStaticMarkup(<AppCodeView record={signed} official={false} serverVersion="1.4.0" />)
    expect(html).toContain('Signed with this server&#x27;s key')
    expect(html).toContain('This server runs 1.4.0')
  })

  it('says a self-built or preview build is not checked, without Verify', () => {
    for (const [mode, label] of [['self-built', 'Self-built'], ['preview', 'Preview build']] as const) {
      const html = renderToStaticMarkup(<AppCodeView record={{ ...signed, mode, keys: [], signer: undefined }} official={false} serverVersion={null} />)
      expect(html).toContain(label)
      expect(html).toContain('Updates are not signature-checked.')
      expect(html).not.toContain('data-app-code-verify')
      expect(html).toContain('Copy diagnostics')
    }
  })

  it('shows a failed check while reporting with its cause and What to do', () => {
    const record = { ...signed, lastCheck: { at: 0, version: '1.4.0', passed: false, cause: 'changed-file' as const, path: 'assets/index-1.js', refused: false } }
    const html = renderToStaticMarkup(<AppCodeView record={record} official serverVersion={null} />)
    expect(html).toContain('data-app-code-check="reported"')
    expect(html).toContain('The last update didn&#x27;t pass the check. It was installed: checks only report for now.')
    expect(html).toContain('A proxy or the server changed the app&#x27;s files.')
    expect(html).toContain('What to do')
  })

  it("shows a refusal, naming the device's own key", () => {
    const record = { ...signed, refuse: true, lastCheck: { at: 0, version: '1.4.0', passed: false, cause: 'unsigned' as const, refused: true } }
    const html = renderToStaticMarkup(<AppCodeView record={record} official={false} serverVersion={null} />)
    expect(html).toContain('This update wasn&#x27;t installed.')
    expect(html).toContain('It isn&#x27;t signed with this app&#x27;s key.')
  })

  it('computes the official fingerprints from the build keys', async () => {
    expect(await officialFingerprints([])).toEqual([])
  })
})

describe('the diagnostics line', () => {
  it('holds the version, mode, key, switch and the last check, nothing else', () => {
    expect(diagnosticsLine(signed)).toBe('opentodo-app-code version=1.3.0 mode=signed key=AECA03A5FC4A754F refuse=off check=passed at=2026-11-08T10:12:00Z')
    const failed = { ...signed, lastCheck: { at: Date.UTC(2026, 10, 8, 10, 12), version: '1.4.0', passed: false, cause: 'changed-file' as const, path: 'assets/index-3fa1c2.js', refused: false } }
    expect(diagnosticsLine(failed)).toBe('opentodo-app-code version=1.3.0 mode=signed key=AECA03A5FC4A754F refuse=off check=failed cause=changed-file path=assets/index-3fa1c2.js offered=1.4.0 at=2026-11-08T10:12:00Z')
    expect(diagnosticsLine({ mode: 'self-built', keys: [], refuse: false, announced: [] })).toBe('opentodo-app-code version=none mode=self-built key=none refuse=off')
  })
})

describe('the refusal banner', () => {
  afterEach(() => { resetAppUpdate(); dismissRefusal() })

  it('shows what the worker refused, with its cause and the help page, and no reload', () => {
    const sw = Object.assign(new EventTarget(), { controller: null }) as unknown as ServiceWorkerContainer
    watchAppUpdates(Object.assign(new EventTarget(), { location: { reload: () => {} } }), sw)
    expect(renderToStaticMarkup(<UpdateBanner />)).toBe('')
    sw.dispatchEvent(Object.assign(new Event('message'), { data: { type: 'opentodo-app', state: 'refused', ownKey: false, check: { at: 0, version: '1.4.0', passed: false, cause: 'older', refused: true } } }))
    const html = renderToStaticMarkup(<RefusedBanner refused={currentRefusal()!} />)
    expect(html).toContain('data-update-banner="refused"')
    expect(html).toContain('This update wasn&#x27;t installed. The server went back to an older version.')
    expect(html).toContain('What to do')
    expect(html).not.toContain('Reload to update')
    dismissRefusal()
    expect(currentRefusal()).toBeNull()
    expect(renderToStaticMarkup(<UpdateBanner />)).toBe('')
  })

  it('shows the reload prompt when the worker installed a new version', () => {
    const sw = Object.assign(new EventTarget(), { controller: { postMessage: () => {} } }) as unknown as ServiceWorkerContainer
    watchAppUpdates(Object.assign(new EventTarget(), { location: { reload: () => {} } }), sw)
    sw.dispatchEvent(Object.assign(new Event('message'), { data: { type: 'opentodo-app', state: 'ready', version: '1.4.0' } }))
    expect(updateReason()).toBe('release')
  })

  it('asks the worker to check on start and when the tab comes back online or into focus', () => {
    const sent: unknown[] = []
    const sw = Object.assign(new EventTarget(), { controller: { postMessage: (m: unknown) => sent.push(m) } }) as unknown as ServiceWorkerContainer
    const win = Object.assign(new EventTarget(), { location: { reload: () => {} } })
    watchAppUpdates(win, sw)
    win.dispatchEvent(new Event('online'))
    win.dispatchEvent(new Event('focus'))
    expect(sent).toEqual([{ type: 'opentodo-app', check: true }, { type: 'opentodo-app', check: true }, { type: 'opentodo-app', check: true }])
  })

  it('shows each refusal once, though the worker answers every check with it', () => {
    const sw = Object.assign(new EventTarget(), { controller: { postMessage: () => {} } }) as unknown as ServiceWorkerContainer
    watchAppUpdates(Object.assign(new EventTarget(), { location: { reload: () => {} } }), sw)
    const refused = () => sw.dispatchEvent(Object.assign(new Event('message'), { data: { type: 'opentodo-app', state: 'refused', ownKey: false, check: { at: 42, version: '1.4.0', passed: false, cause: 'changed-file', path: 'index.html', refused: true } } }))
    refused()
    expect(renderToStaticMarkup(<RefusedBanner refused={currentRefusal()!} />)).toContain('This update wasn&#x27;t installed. A proxy or the server changed the app&#x27;s files.')
    dismissRefusal()
    refused()
    expect(currentRefusal()).toBeNull()
  })
})
