import { beforeEach, describe, expect, it } from 'vitest'
import { createDictation, type DictationHost, type DictationView, insertTranscript, MESSAGES, resetLanguageFallbacks } from './dictation'
import { FakeRecognition, fakeWindow, flush } from './fakeRecognition'
import { startRecognition } from './recognition'
import { normalizeSpoken } from './spoken'

function setup(initial = '', opts: { lang?: string; selection?: [number, number] } = {}) {
  const state = { value: initial, caret: initial.length, views: [] as DictationView[], sets: [] as string[] }
  const win = fakeWindow()
  const host: DictationHost = {
    getValue: () => state.value,
    getSelection: () => ({ start: opts.selection?.[0] ?? state.caret, end: opts.selection?.[1] ?? state.caret }),
    setValue: (v, caret) => {
      state.value = v
      state.caret = caret
      state.sets.push(v)
    },
    normalize: (t) => normalizeSpoken(t, ['en']),
    lang: () => opts.lang ?? 'en-US',
    languageName: (tag) => (tag.startsWith('it') ? 'Italian' : tag),
    update: (v) => state.views.push(v),
  }
  const d = createDictation(host, (o) => startRecognition(o, win))
  const view = () => state.views.at(-1)
  return { d, state, view }
}

beforeEach(() => {
  FakeRecognition.reset()
  resetLanguageFallbacks()
})

describe('insertTranscript', () => {
  it('adds single spaces around the transcript and puts the caret after it', () => {
    expect(insertTranscript('', 'buy milk', '')).toEqual({ value: 'buy milk', caret: 8 })
    expect(insertTranscript('note:', 'buy milk', '')).toEqual({ value: 'note: buy milk', caret: 14 })
    expect(insertTranscript('a ', 'b', 'c')).toEqual({ value: 'a b c', caret: 3 })
    expect(insertTranscript('a', '', ' c')).toEqual({ value: 'a c', caret: 1 })
  })
})

describe('dictation state machine', () => {
  it('shows interim words, then inserts the normalised final transcript; never submits', async () => {
    const { d, state, view } = setup()
    d.start()
    expect(view()?.status).toBe('starting')
    await flush()
    expect(view()).toMatchObject({ status: 'listening', announcement: 'Listening' })
    const r = FakeRecognition.last
    r.hear('call the dentist', false)
    expect(state.value).toBe('call the dentist')
    r.hear('call the dentist tomorrow at nine', true)
    r.silence()
    expect(state.value).toBe('call the dentist tomorrow at 9')
    expect(state.caret).toBe(state.value.length)
    expect(view()).toMatchObject({ status: 'idle', announcement: 'Stopped', message: null })
  })

  it('inserts at the caret, keeping the text around it', async () => {
    const { d, state } = setup('buy  #home', { selection: [4, 4] })
    d.start()
    await flush()
    FakeRecognition.last.hear('oat milk', true)
    FakeRecognition.last.silence()
    expect(state.value).toBe('buy oat milk #home')
    expect(state.caret).toBe('buy oat milk'.length)
  })

  it('toggle (button, Escape) stops listening and keeps what was heard', async () => {
    const { d, state, view } = setup()
    d.toggle()
    await flush()
    FakeRecognition.last.hear('renew insurance hashtag home priority two', false)
    d.toggle()
    expect(state.value).toBe('renew insurance #home p2')
    expect(view()).toMatchObject({ status: 'idle', announcement: 'Stopped' })
  })

  it('permission denied: message, text preserved, can retry', async () => {
    const { d, state, view } = setup('draft')
    FakeRecognition.failWith = 'not-allowed'
    d.start()
    await flush()
    expect(state.value).toBe('draft')
    expect(view()).toMatchObject({ status: 'idle', message: MESSAGES.denied, announcement: MESSAGES.denied })
    d.start()
    expect(view()?.message).toBeNull()
    await flush()
    expect(view()?.status).toBe('listening')
  })

  it('no speech stops quietly', async () => {
    const { d, state, view } = setup('keep me')
    d.start()
    await flush()
    FakeRecognition.last.fail('no-speech')
    expect(state.value).toBe('keep me')
    expect(view()).toMatchObject({ status: 'idle', message: null, announcement: 'Stopped' })
  })

  it('offline with remote recognition: unavailable message, typed text kept', async () => {
    const { d, state, view } = setup('typed so far')
    d.start()
    await flush()
    FakeRecognition.last.hear('half a sen', false)
    FakeRecognition.last.fail('network')
    expect(state.value).toBe('typed so far')
    expect(view()).toMatchObject({ status: 'idle', message: MESSAGES.unavailable })
  })

  it('unsupported language: one notice, then the browser default language', async () => {
    const { d, view } = setup('', { lang: 'it-IT' })
    FakeRecognition.failWith = 'language-not-supported'
    d.start()
    await flush()
    expect(FakeRecognition.instances.map((r) => r.lang)).toEqual(['it-IT', ''])
    expect(view()).toMatchObject({ status: 'listening', message: MESSAGES.language('Italian') })
    FakeRecognition.last.silence()
    expect(view()).toMatchObject({ status: 'idle', message: MESSAGES.language('Italian') })
    // Later sessions go straight to the default language, without a new notice.
    d.start()
    expect(view()?.message).toBeNull()
    await flush()
    expect(FakeRecognition.last.lang).toBe('')
  })

  it('start while listening is a no-op; dispose stops the session', async () => {
    const { d } = setup()
    d.start()
    d.start()
    await flush()
    expect(FakeRecognition.instances).toHaveLength(1)
    d.dispose()
    expect(FakeRecognition.last.stopped).toBe(true)
  })
})
