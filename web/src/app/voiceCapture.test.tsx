import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeRecognition } from '../lib/voice/fakeRecognition'
import { QuickAdd } from './QuickAdd'
import { VoiceSettingsSection } from './VoiceSettings'

const store = new Map<string, string>()
const g = globalThis as Record<string, unknown>

beforeEach(() => {
  store.clear()
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
})
afterEach(() => {
  delete g.localStorage
  delete g.SpeechRecognition
})

const quickAdd = () => renderToStaticMarkup(<QuickAdd placeholder="Add a task" onAdd={() => undefined} voiceShortcut />)

describe('voice capture UI', () => {
  it('shows no microphone button by default, even where recognition exists', () => {
    g.SpeechRecognition = FakeRecognition
    expect(quickAdd()).not.toContain('data-voice-button')
  })

  it('shows the microphone button once enabled on a supporting browser', () => {
    g.SpeechRecognition = FakeRecognition
    store.set('opentodo.voice', JSON.stringify({ enabled: true, lang: null }))
    const html = quickAdd()
    expect(html).toContain('data-voice-button')
    expect(html).toContain('aria-pressed="false"')
    expect(html).toContain('aria-label="Dictate a task"')
    expect(html).toContain('data-voice-status')
  })

  it('hides the button when the browser has no recognition, whatever the setting', () => {
    store.set('opentodo.voice', JSON.stringify({ enabled: true, lang: null }))
    expect(quickAdd()).not.toContain('data-voice-button')
  })

  it('disables the switch with an explanation when the browser has no recognition', () => {
    const html = renderToStaticMarkup(<VoiceSettingsSection />)
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*disabled=""/)
    expect(html).toContain('This browser does not provide speech recognition')
  })

  it('offers the switch, off, where recognition exists', () => {
    g.SpeechRecognition = FakeRecognition
    const html = renderToStaticMarkup(<VoiceSettingsSection />)
    expect(html).not.toMatch(/disabled=""/)
    expect(html).not.toMatch(/checked=""/)
    expect(html).toContain('Shift+V')
  })
})
