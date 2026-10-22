// @vitest-environment happy-dom
// Voice capture through the server's speech service (OpenSpec change
// settings-refresh, design D7; voice-capture "Privacy contract" and
// "Transcription route"): the statement names the host before the choice takes
// effect, a phrase is recorded with MediaRecorder and sent once, the text lands
// in quick add, and an error keeps the field. The browser path is unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// /me answers whether a service is connected; each test sets it.
const me = vi.hoisted(() => ({ speech: { connected: false } as { connected: boolean; host?: string } }))
vi.mock('../lib/api', async (orig) => {
  const real = await orig<typeof import('../lib/api')>()
  return { ...real, api: { ...real.api, me: async () => ({ speech: me.speech }) } }
})
import { click, flush, render } from '../ui/test-utils'
import { setSpeechService } from '../lib/voice/speechService'
import { startServerRecognition } from '../lib/voice/serverRecognition'
import { createDictation } from '../lib/voice/dictation'
import { ApiError } from '../lib/api'
import { loadVoiceSettings } from '../lib/voice/settings'
import { FakeRecognition } from '../lib/voice/fakeRecognition'
import { VoiceSettingsSection } from './VoiceSettings'

/** A MediaRecorder that hands back one chunk when stopped. */
class FakeRecorder {
  static isTypeSupported = (t: string) => t === 'audio/webm;codecs=opus'
  static last: FakeRecorder | null = null
  state = 'inactive'
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(_: unknown, opts?: { mimeType?: string }) { this.mimeType = opts?.mimeType ?? ''; FakeRecorder.last = this }
  start() { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['opus-bytes'], { type: 'audio/webm' }) })
    this.onstop?.()
  }
}
const track = { stop: vi.fn() }
const win = () => ({ MediaRecorder: FakeRecorder, navigator: { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) } } })
const g = globalThis as Record<string, unknown>

beforeEach(() => {
  localStorage.clear()
  track.stop.mockReset()
  setSpeechService({ connected: false })
})
afterEach(() => {
  document.body.innerHTML = ''
  delete g.SpeechRecognition
  delete g.MediaRecorder
})

describe('the server recogniser', () => {
  it('A phrase becomes text: recorded, sent once with its language, and written into quick add', async () => {
    const transcribe = vi.fn(async () => ({ text: 'call the dentist tomorrow at 9' }))
    let value = 'Buy milk'
    const updates: string[] = []
    const d = createDictation({
      getValue: () => value, getSelection: () => ({ start: value.length, end: value.length }),
      setValue: (v) => { value = v }, normalize: (x) => x, lang: () => 'it-IT', update: (v) => updates.push(v.status),
    }, (opts) => startServerRecognition(opts, win(), transcribe))
    d.start()
    await flush(10)
    expect(d.status).toBe('listening')
    d.stop()
    await flush(10)
    expect(transcribe).toHaveBeenCalledTimes(1)
    const [blob, lang] = transcribe.mock.calls[0] as unknown as [Blob, string]
    expect(blob.type).toBe('audio/webm')
    expect(lang).toBe('it')
    expect(value).toBe('Buy milk call the dentist tomorrow at 9')
    expect(d.status).toBe('idle')
    // The microphone is released after the phrase.
    expect(track.stop).toHaveBeenCalled()
  })

  it('Service down: the field keeps what was typed and says the service did not answer', async () => {
    const transcribe = vi.fn(async () => { throw new ApiError(502, 'stt_unavailable', 'the speech service did not answer') })
    let value = 'Buy milk'
    let message: string | null = null
    const d = createDictation({
      getValue: () => value, getSelection: () => ({ start: 8, end: 8 }), setValue: (v) => { value = v },
      normalize: (x) => x, lang: () => 'en-US', update: (v) => { message = v.message },
    }, (opts) => startServerRecognition(opts, win(), transcribe))
    d.start()
    await flush(10)
    d.stop()
    await flush(10)
    expect(value).toBe('Buy milk')
    expect(message).toBe('The speech service did not answer. Try again, or keep typing.')
  })

  it('a refused microphone is "denied"', async () => {
    const w = { ...win(), navigator: { mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }) } } } }
    const onError = vi.fn()
    const onEnd = vi.fn()
    startServerRecognition({ onResult: vi.fn(), onError, onEnd }, w, vi.fn())
    await flush(10)
    expect(onError).toHaveBeenCalledWith('denied', 'NotAllowedError')
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})

describe('Voice capture card', () => {
  const statement = () => document.querySelector('[data-testid="voice-statement"]')

  it('Statement for the server\'s service: it names the host and the choice takes effect only after confirming', async () => {
    g.SpeechRecognition = FakeRecognition
    g.MediaRecorder = FakeRecorder
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true })
    me.speech = { connected: true, host: 'stt.home.lan' }
    setSpeechService(me.speech)
    localStorage.setItem('opentodo.voice', JSON.stringify({ enabled: true, lang: null, recognizer: 'browser' }))
    const r = await render(<VoiceSettingsSection />)
    const select = document.querySelector<HTMLSelectElement>('#voice-recognizer')!
    expect([...select.options].map((o) => o.textContent)).toEqual(['This browser', 'This server’s speech service (stt.home.lan)'])
    select.value = 'server'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await flush(10)
    expect(statement()?.textContent).toContain('stt.home.lan')
    expect(statement()?.textContent).toContain('Neither the server nor the app keeps the audio or the text.')
    expect(loadVoiceSettings().recognizer).toBe('browser')
    await click(document.querySelector('[data-voice-confirm]')!)
    expect(loadVoiceSettings().recognizer).toBe('server')
    await r.unmount()
  })

  it('Not configured: only the browser is offered, and turning on shows the browser statement', async () => {
    g.SpeechRecognition = FakeRecognition
    const r = await render(<VoiceSettingsSection />)
    expect(document.querySelector('#voice-recognizer')).toBeNull()
    await click(document.querySelector('[role="switch"]')!)
    expect(statement()?.textContent).toContain('Speech is recognised by your browser')
    expect(loadVoiceSettings().enabled).toBe(false)
    await click(document.querySelector('[data-voice-confirm]')!)
    expect(loadVoiceSettings()).toEqual({ enabled: true, lang: null, recognizer: 'browser' })
    await r.unmount()
  })
})
