import { beforeEach, describe, expect, it } from 'vitest'
import { FakeRecognition, fakeWindow, flush } from './fakeRecognition'
import { errorKind, isSupported, type RecognitionCallbacks, startRecognition, type VoiceErrorKind } from './recognition'

function recorder() {
  const log: string[] = []
  const errors: VoiceErrorKind[] = []
  const results: { final: string; interim: string }[] = []
  const cb: RecognitionCallbacks = {
    onStart: () => log.push('start'),
    onResult: (r) => results.push(r),
    onError: (k) => errors.push(k),
    onEnd: () => log.push('end'),
  }
  return { log, errors, results, cb }
}

beforeEach(() => FakeRecognition.reset())

describe('feature detection', () => {
  it('finds the standard and the prefixed constructor, and nothing elsewhere', () => {
    expect(isSupported(fakeWindow())).toBe(true)
    expect(isSupported(fakeWindow({ prefixed: true }))).toBe(true)
    expect(isSupported({})).toBe(false)
    // The vitest environment (node) has no speech recognition, like Firefox.
    expect(isSupported()).toBe(false)
  })
})

describe('startRecognition', () => {
  it('configures a single utterance with interim results and the language', async () => {
    const { log, cb } = recorder()
    startRecognition({ lang: 'de-DE', ...cb }, fakeWindow())
    await flush()
    const r = FakeRecognition.last
    expect(r.started).toBe(true)
    expect(r.lang).toBe('de-DE')
    expect(r.continuous).toBe(false)
    expect(r.interimResults).toBe(true)
    expect(r.maxAlternatives).toBe(1)
    expect(r.processLocally).toBe(false)
    expect(log).toEqual(['start'])
  })

  it('leaves the language to the browser when none is given', async () => {
    startRecognition({ ...recorder().cb }, fakeWindow())
    await flush()
    expect(FakeRecognition.last.lang).toBe('')
  })

  it('delivers interim and final text, and ends on silence', async () => {
    const { log, results, errors, cb } = recorder()
    startRecognition({ lang: 'en-US', ...cb }, fakeWindow())
    await flush()
    const r = FakeRecognition.last
    r.hear('call the', false)
    r.hear('call the dentist', false)
    r.hear('call the dentist', true)
    r.hear('tomorrow at nine', true)
    r.silence()
    expect(results).toEqual([
      { final: '', interim: 'call the' },
      { final: '', interim: 'call the dentist' },
      { final: 'call the dentist', interim: '' },
      { final: 'call the dentist tomorrow at nine', interim: '' },
    ])
    expect(errors).toEqual([])
    expect(log).toEqual(['start', 'end'])
  })

  it('stop() settles pending words before ending', async () => {
    const { results, log, cb } = recorder()
    const s = startRecognition({ lang: 'en-US', ...cb }, fakeWindow())
    await flush()
    FakeRecognition.last.hear('buy milk', false)
    s.stop()
    expect(results.at(-1)).toEqual({ final: 'buy milk', interim: '' })
    expect(log).toEqual(['start', 'end'])
  })

  it('stop() before the engine was created ends without starting it', () => {
    const { log, cb } = recorder()
    const s = startRecognition({ lang: 'en-US', ...cb }, fakeWindow())
    s.stop()
    expect(log).toEqual(['end'])
    expect(FakeRecognition.instances).toHaveLength(0)
  })

  it.each([
    ['not-allowed', 'denied'],
    ['no-speech', 'no-speech'],
    ['network', 'unavailable'],
    ['language-not-supported', 'language'],
    ['audio-capture', 'no-microphone'],
    ['service-not-allowed', 'unavailable'],
    ['aborted', 'aborted'],
  ])('maps the %s error to %s and still ends once', async (code, kind) => {
    const { errors, log, cb } = recorder()
    FakeRecognition.failWith = code
    startRecognition({ lang: 'en-US', ...cb }, fakeWindow())
    await flush()
    expect(errors).toEqual([kind])
    expect(log).toEqual(['end'])
    expect(errorKind(code)).toBe(kind)
  })

  it('reports an unsupported browser as unavailable', () => {
    const { errors, log, cb } = recorder()
    startRecognition({ ...cb }, {})
    expect(errors).toEqual(['unavailable'])
    expect(log).toEqual(['end'])
  })

  it('requests on-device recognition only when the engine says it is available', async () => {
    FakeRecognition.availability = 'available'
    const s = startRecognition({ lang: 'it-IT', ...recorder().cb }, fakeWindow({ available: true }))
    await flush()
    expect(FakeRecognition.availableCalls).toEqual([{ langs: ['it-IT'], processLocally: true }])
    expect(FakeRecognition.last.processLocally).toBe(true)
    expect(s.local).toBe(true)
  })

  it('falls back silently to the default engine when on-device is not ready', async () => {
    FakeRecognition.availability = 'downloadable'
    const s = startRecognition({ lang: 'it-IT', ...recorder().cb }, fakeWindow({ available: true }))
    await flush()
    expect(FakeRecognition.last.processLocally).toBe(false)
    expect(s.local).toBe(false)
  })
})
