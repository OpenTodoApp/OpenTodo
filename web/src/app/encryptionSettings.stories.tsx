// settings-redesign: the End-to-end encryption card in each state.
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { EncryptionSnapshot } from '../lib/e2ee'
import { EncryptionView, type EncryptionViewProps, type Mode } from './EncryptionPanel'

const noop = () => {}
const off: EncryptionSnapshot = { enabled: false, unlocked: false, keyVersion: 0, migration: null, updateRequired: false, recordMissing: false }
const on: EncryptionSnapshot = { ...off, enabled: true, unlocked: true, keyVersion: 2 }
const key = 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567'
const view = (state: EncryptionSnapshot, mode: Mode = { kind: 'idle' }, over: Partial<EncryptionViewProps> = {}) => (
  <EncryptionView state={state} mode={mode} busy={false} error={null} notice={null} onMode={noop} onSubmitPassphrase={noop} onCopy={noop}
    onDownload={noop} onAcknowledge={noop} onEnable={noop} onChange={noop} onReset={noop} onPurge={noop} onLock={noop} onDisable={noop} onLost={noop} {...over} />
)

const meta: Meta = { title: 'Settings/Encryption' }
export default meta
export const Off: StoryObj = { render: () => view(off) }
export const Passphrase: StoryObj = { render: () => view(off, { kind: 'passphrase' }) }
export const RecoveryKey: StoryObj = { render: () => view(off, { kind: 'recovery', recoveryKey: key, copied: false, acknowledged: false }) }
export const On: StoryObj = { render: () => view(on, { kind: 'idle' }, { notice: 'Encryption is on.' }) }
export const Locked: StoryObj = { render: () => view({ ...on, unlocked: false }) }
export const Migrating: StoryObj = { render: () => view({ ...on, migration: { mode: 'encrypt', done: 340, total: 1200 } }) }
export const WithError: StoryObj = { render: () => view(on, { kind: 'change' }, { error: 'That passphrase is not correct.' }) }
export const ConfirmDisable: StoryObj = { render: () => view(on, { kind: 'confirmDisable' }) }
