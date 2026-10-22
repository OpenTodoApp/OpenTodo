// settings-refresh D7, D8: the owner's Speech to text card and the server recogniser statement.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { cardCopy } from '../lib/settingsCopy'
import type { SpeechSettings } from '../lib/types'
import { SettingsSection } from '../ui'
import { SpeechServerView } from './SpeechServerPanel'
import { ServerSpeechStatement } from './VoiceSettings'

const meta: Meta = { title: 'Settings/Speech to text' }
export default meta

const empty: SpeechSettings = { url: '', model: '', keySet: false, locked: [], connected: false }
const connected: SpeechSettings = { url: 'http://stt.home.lan:8000', model: 'Systran/faster-whisper-small', keySet: true, locked: [], connected: true, host: 'stt.home.lan:8000' }
const card = (s: SpeechSettings) => (
  <div className="max-w-2xl">
    <SettingsSection {...cardCopy('speech-server')}>
      <SpeechServerView settings={s} onSave={async () => undefined} onTest={async () => ({ ok: true, text: '' })} />
    </SettingsSection>
  </div>
)

export const NotConnected: StoryObj = { render: () => card(empty) }
export const Connected: StoryObj = { render: () => card(connected) }
export const SetByVariables: StoryObj = { render: () => card({ ...connected, locked: ['url', 'model', 'key'] }) }
export const Statement: StoryObj = { render: () => <div className="max-w-lg"><ServerSpeechStatement host="stt.home.lan:8000" encrypted /></div> }
