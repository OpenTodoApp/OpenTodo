// Settings → End-to-end encryption and the unlock screen without a DOM (OpenSpec
// e2ee, tasks 4.1 and 4.2): the pure views are rendered to static markup for
// each state.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WrongSecretError } from '../lib/crypto'
import type { EncryptionSnapshot } from '../lib/e2ee'
import { UnlockThrottledError } from '../lib/e2ee'
import { encryptionMessage, EncryptionView, type EncryptionViewProps, type Mode } from './EncryptionPanel'
import { RecordMissingView, type RecordMissingViewProps, UnlockView, type UnlockViewProps } from './UnlockScreen'

const noop = () => {}
const off: EncryptionSnapshot = { enabled: false, unlocked: false, keyVersion: 0, migration: null, updateRequired: false, recordMissing: false }
const on: EncryptionSnapshot = { ...off, enabled: true, unlocked: true, keyVersion: 2 }

function render(state: EncryptionSnapshot, mode: Mode = { kind: 'idle' }, over: Partial<EncryptionViewProps> = {}) {
  const props: EncryptionViewProps = {
    state, mode, busy: false, error: null, notice: null, onMode: noop, onSubmitPassphrase: noop, onCopy: noop, onDownload: noop,
    onAcknowledge: noop, onEnable: noop, onChange: noop, onReset: noop, onPurge: noop, onLock: noop, onDisable: noop, onLost: noop, ...over,
  }
  return renderToStaticMarkup(<EncryptionView {...props} />)
}
// Button labels without their icons; Help links are not actions of the panel.
const buttons = (html: string) => [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)]
  .filter((m) => !m[1].includes('data-help-screen')).map((m) => ({ html: m[0], label: m[2].replace(/<[^>]+>/g, '') }))
const labels = (html: string) => buttons(html).map((b) => b.label)
const button = (html: string, label: string) => buttons(html).find((b) => b.label === label)?.html

describe('EncryptionView', () => {
  it('off: explains the boundary and offers set-up', () => {
    const html = render(off)
    expect(html).toContain('Your task text is encrypted on your devices')
    expect(html).toContain('due dates, priority')
    expect(html).toContain('Shared projects are not encrypted')
    expect(labels(html)).toEqual(['Set up encryption'])
  })

  it('passphrase step asks twice with the minimum length', () => {
    const html = render(off, { kind: 'passphrase' })
    expect(html.match(/type="password"/g)).toHaveLength(2)
    expect(html).toContain('minLength="12"')
    expect(labels(html)).toContain('Next')
  })

  it('recovery step shows the key once and needs the acknowledgement', () => {
    const mode: Mode = { kind: 'recovery', recoveryKey: 'ABCD-EFGH', copied: false, acknowledged: false }
    let html = render(off, mode)
    expect(html).toContain('ABCD-EFGH')
    expect(html).toContain('cannot be recovered by anyone')
    expect(button(html, 'Turn on encryption')).toContain('disabled')
    html = render(off, { ...mode, acknowledged: true, copied: true })
    expect(button(html, 'Turn on encryption')).not.toContain('disabled')
    expect(labels(html)).toContain('Copied')
  })

  it('on and unlocked: management actions, keyboard reachable buttons', () => {
    const html = render(on)
    expect(html).toContain('Unlocked on this device')
    expect(html).toContain('data-testid="e2ee-status"')
    expect(labels(html)).toEqual(['Change passphrase', 'Reset passphrase with recovery key', 'Purge plaintext history', 'Lock this device', 'Turn off encryption'])
    expect(html).not.toContain('tabindex="-1"')
  })

  it('on but locked: no change or disable, offers the both-lost path', () => {
    const html = render({ ...on, unlocked: false })
    expect(labels(html)).toEqual(['Reset passphrase with recovery key', 'Purge plaintext history', 'I lost my passphrase and recovery key'])
    expect(render({ ...on, unlocked: false }, { kind: 'confirmLost' })).toContain('cannot be recovered')
  })

  it('progress, purge warning, change, reset, new recovery key, disable', () => {
    expect(render({ ...on, migration: { mode: 'encrypt', done: 3, total: 10 } })).toContain('Encrypting your data: 3 of 10')
    expect(render(on, { kind: 'confirmPurge' })).toContain('Backups made before now')
    expect(render(on, { kind: 'change' })).toContain('Current passphrase')
    expect(render(on, { kind: 'reset' })).toContain('Recovery key')
    expect(render(on, { kind: 'newRecovery', recoveryKey: 'WXYZ-2345', copied: false })).toContain('old recovery key no longer works')
    expect(render(on, { kind: 'confirmDisable' })).toContain('plaintext again')
  })

  it('shows errors and notices', () => {
    const html = render(on, { kind: 'idle' }, { error: 'nope', notice: 'done' })
    expect(html).toMatch(/role="alert".*nope.*role="status".*done/)
    expect(encryptionMessage(new WrongSecretError())).toMatch(/not correct/)
    expect(encryptionMessage(new UnlockThrottledError(Date.now() + 30_000))).toMatch(/Try again in 30 seconds/)
  })
})

describe('UnlockView', () => {
  const props = (over: Partial<UnlockViewProps> = {}): UnlockViewProps => ({
    kind: 'passphrase', busy: false, error: null, lost: false, onKind: noop, onSubmit: noop, onLost: noop, onConfirmLost: noop, onLogout: noop, ...over,
  })
  it('asks for the passphrase, can switch to the recovery key, and signs out', () => {
    const html = renderToStaticMarkup(<UnlockView {...props()} />)
    expect(html).toContain('type="password"')
    expect(html).toContain('Sync stays paused')
    expect(labels(html)).toEqual(expect.arrayContaining(['Unlock', 'Use the recovery key instead', 'Sign out', 'I lost both my passphrase and my recovery key']))
    const rec = renderToStaticMarkup(<UnlockView {...props({ kind: 'recovery', error: 'this is not a valid recovery key' })} />)
    expect(rec).toContain('Recovery key')
    expect(rec).toContain('role="alert"')
  })
  it('the both-lost path states the loss before acting', () => {
    const html = renderToStaticMarkup(<UnlockView {...props({ lost: true })} />)
    expect(html).toContain('cannot be recovered')
    expect(labels(html)).toContain('Turn off and delete encrypted content')
  })
})

describe('RecordMissingView (encryption-state-integrity)', () => {
  const props = (over: Partial<RecordMissingViewProps> = {}): RecordMissingViewProps => ({
    unlocked: true, busy: false, error: null, confirmOff: false, onRestore: noop, onConfirmOff: noop, onTurnOff: noop, onLogout: noop, ...over,
  })
  it('explains the pause and offers restore, turning off, and signing out', () => {
    const html = renderToStaticMarkup(<RecordMissingView {...props()} />)
    expect(html).toContain('Sync is paused')
    expect(labels(html)).toEqual(['Restore the key record from this device', 'Turn off encryption on this device…', 'Sign out'])
    expect(html).not.toContain('type="password"')
  })
  it('without the key, the passphrase restores the record', () => {
    const html = renderToStaticMarkup(<RecordMissingView {...props({ unlocked: false, error: 'not correct' })} />)
    expect(html).toContain('type="password"')
    expect(labels(html)).toContain('Restore the key record')
    expect(html).toContain('role="alert"')
  })
  it('turning off states the consequence before acting', () => {
    const html = renderToStaticMarkup(<RecordMissingView {...props({ confirmOff: true })} />)
    expect(html).toContain('in plaintext again')
    expect(labels(html)).toEqual(['Restore the key record from this device', 'Turn off encryption', 'Cancel'])
  })
})
