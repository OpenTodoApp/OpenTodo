// @vitest-environment happy-dom
// Settings → Server → Speech to text (OpenSpec change settings-refresh, design
// D7 and D8): Test shows the text or the failed stage; fields set by a variable
// are read-only and name it; the key is never shown.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { click, flush, render, type } from '../ui/test-utils'
import type { SpeechSettings } from '../lib/types'
import { SpeechServerView } from './SpeechServerPanel'

const base: SpeechSettings = { url: '', model: '', keySet: false, locked: [], connected: false }
const field = (f: string) => document.querySelector<HTMLInputElement>(`[data-speech-field="${f}"]`)!

afterEach(() => { document.body.innerHTML = '' })

describe('SpeechServerView', () => {
  it('tests the draft address and shows the text, then the failed stage', async () => {
    const onTest = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: 'hello' })
      .mockResolvedValueOnce({ ok: false, error: 'the speech service did not answer: the address is on a private network; allow private network targets in Settings → Server' })
    const onSave = vi.fn(async () => undefined)
    const r = await render(<SpeechServerView settings={base} onSave={onSave} onTest={onTest} />)
    await type(field('url'), 'http://stt.home.lan:8000')
    await type(field('model'), 'Systran/faster-whisper-small')
    await click(document.querySelector('[data-speech-run-test]')!)
    await flush(10)
    expect(onTest).toHaveBeenCalledWith({ url: 'http://stt.home.lan:8000', model: 'Systran/faster-whisper-small' })
    expect(document.querySelector('[data-speech-test="ok"]')?.textContent).toBe('The service answered: “hello”')
    await click(document.querySelector('[data-speech-run-test]')!)
    await flush(10)
    expect(document.querySelector('[data-speech-test="failed"]')?.textContent).toContain('private network')
    await click(document.querySelector('[data-speech-save]')!)
    await flush(10)
    expect(onSave).toHaveBeenCalledWith({ url: 'http://stt.home.lan:8000', model: 'Systran/faster-whisper-small' })
    await r.unmount()
  })

  it('names the variable for a locked field and never shows the key', async () => {
    const r = await render(<SpeechServerView settings={{ ...base, url: 'http://stt:8000', model: 'small', keySet: true, locked: ['url', 'key'], connected: true, host: 'stt:8000' }} onSave={vi.fn()} onTest={vi.fn()} />)
    expect(field('url').readOnly).toBe(true)
    expect(field('key').readOnly).toBe(true)
    expect(field('key').value).toBe('')
    expect(field('model').readOnly).toBe(false)
    const text = document.querySelector('[data-speech-server]')!.textContent
    expect(text).toContain('Set by OPENTODO_STT_URL')
    expect(text).toContain('Set by OPENTODO_STT_KEY_FILE')
    await r.unmount()
  })
})
