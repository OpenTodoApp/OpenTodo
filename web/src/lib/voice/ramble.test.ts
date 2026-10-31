// Long dictation into the assistant composer (voice-ramble 3.1): the continuous
// browser mode, the server pieces and the ramble's limit, silence and errors.
import { beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import { FakeRecognition, fakeWindow, flush } from './fakeRecognition'
import type { RecognitionCallbacks } from './recognition'
import { appendTranscript, createRamble, elapsedLabel, PIECE_TIMING, RAMBLE_MAX_MS, startLongRecognition, startServerPieces, type Clock, type LongRecognizer, type RambleView } from './ramble'

beforeEach(() => FakeRecognition.reset())

function callbacks() {
  const out = { results: [] as { final: string; interim: string }[], errors: [] as string[], ended: 0, activity: 0 }
  const cb: RecognitionCallbacks & { onActivity: () => void } = {
    onResult: (r) => out.results.push(r),
    onError: (k, raw) => out.errors.push(`${k}:${raw}`),
    onEnd: () => { out.ended++ },
    onActivity: () => { out.activity++ },
  }
  return { out, cb }
}

describe('startLongRecognition', () => {
  it('listens continuously and keeps the text across the browser’s segment ends', async () => {
    const { out, cb } = callbacks()
    const s = startLongRecognition({ lang: 'en-US', ...cb }, fakeWindow())
    await flush()
    const first = FakeRecognition.last
    expect(first.continuous).toBe(true)
    expect(first.interimResults).toBe(true)
    first.hear('buy printer paper', true)
    first.silence() // the browser ended the segment on its own
    await flush()
    expect(FakeRecognition.instances).toHaveLength(2)
    const second = FakeRecognition.last
    second.hear('call Marta', false)
    expect(out.results.at(-1)).toEqual({ final: 'buy printer paper', interim: 'call Marta' })
    second.hear('call Marta on Friday', true)
    expect(out.results.at(-1)).toEqual({ final: 'buy printer paper call Marta on Friday', interim: '' })
    expect(out.activity).toBeGreaterThan(0)
    s.stop()
    expect(out.ended).toBe(1)
    expect(FakeRecognition.instances).toHaveLength(2)
  })

  it('restarts quietly after no-speech, and stops on a real error', async () => {
    const { out, cb } = callbacks()
    startLongRecognition({ ...cb }, fakeWindow())
    await flush()
    FakeRecognition.last.fail('no-speech')
    await flush()
    expect(FakeRecognition.instances).toHaveLength(2)
    expect(out.errors).toEqual([])
    FakeRecognition.last.fail('network')
    await flush()
    expect(out.errors).toEqual(['unavailable:network'])
    expect(out.ended).toBe(1)
    expect(FakeRecognition.instances).toHaveLength(2)
  })
})

// ------------------------------------------------------------------ server pieces

class FakeRecorder {
  static instances: FakeRecorder[] = []
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor() { FakeRecorder.instances.push(this) }
  start() { this.state = 'recording' }
  stop() {
    if (this.state !== 'recording') return
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob([`piece-${FakeRecorder.instances.indexOf(this) + 1}`]) })
    this.onstop?.()
  }
  static isTypeSupported() { return true }
}

function serverWindow() {
  FakeRecorder.instances = []
  const track = { stopped: false, stop() { this.stopped = true } }
  const stream = { getTracks: () => [track] }
  return { win: { MediaRecorder: FakeRecorder, navigator: { mediaDevices: { getUserMedia: () => Promise.resolve(stream) } } }, track }
}

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 50 && !cond(); i++) await flush()
  expect(cond()).toBe(true)
}

describe('startServerPieces', () => {
  it('sends pieces one after another and joins their text in order', async () => {
    const { win, track } = serverWindow()
    const sent: string[] = []
    let release: (() => void) | null = null
    const transcribe = async (piece: Blob) => {
      const name = await piece.text()
      sent.push(name)
      // The first piece answers slowly: the second still waits its turn.
      if (name === 'piece-1') await new Promise<void>((r) => { release = r })
      return { text: name === 'piece-1' ? 'buy printer paper' : 'call Marta on Friday' }
    }
    const { out, cb } = callbacks()
    const s = startServerPieces({ lang: 'en-US', ...cb }, win, transcribe, { ...PIECE_TIMING, pieceMs: 60_000 }, () => null)
    await flush()
    FakeRecorder.instances[0].stop() // a cut: the next piece starts at once
    await until(() => FakeRecorder.instances.length === 2)
    expect(FakeRecorder.instances[1].state).toBe('recording')
    s.stop()
    await until(() => sent.length === 1)
    expect(sent).toEqual(['piece-1'])
    release!()
    await until(() => out.ended === 1)
    expect(sent).toEqual(['piece-1', 'piece-2'])
    expect(out.results.at(-1)).toEqual({ final: 'buy printer paper call Marta on Friday', interim: '' })
    expect(track.stopped).toBe(true)
  })

  it('cuts a piece at 55 seconds at the latest', async () => {
    expect(PIECE_TIMING.pieceMs).toBe(55_000)
    const { win } = serverWindow()
    const { cb } = callbacks()
    const s = startServerPieces({ ...cb }, win, async () => ({ text: 'x' }), { ...PIECE_TIMING, pieceMs: 5 }, () => null)
    await until(() => FakeRecorder.instances.length >= 3)
    s.stop()
  })

  it('cuts at a pause and skips a piece without speech', async () => {
    const { win } = serverWindow()
    let level = 0.5
    const sent: string[] = []
    const { out, cb } = callbacks()
    const s = startServerPieces({ ...cb }, win, async (p) => { sent.push(await p.text()); return { text: 'said' } },
      { ...PIECE_TIMING, pieceMs: 60_000, minPieceMs: 0, pauseMs: 20, tickMs: 5 }, () => ({ level: () => level, close: () => {} }))
    await until(() => out.activity > 0)
    level = 0
    await until(() => FakeRecorder.instances.length === 2) // the pause cut the first piece
    s.stop() // the second piece heard nothing and is not sent
    await until(() => out.ended === 1)
    expect(sent).toEqual(['piece-1'])
  })

  it('a failing third piece keeps the first two and stops listening', async () => {
    const { win } = serverWindow()
    let n = 0
    const transcribe = async () => {
      n++
      if (n === 3) throw new ApiError(503, 'stt_unavailable', 'the speech service did not answer')
      return { text: `part ${n}` }
    }
    const { out, cb } = callbacks()
    startServerPieces({ ...cb }, win, transcribe, { ...PIECE_TIMING, pieceMs: 60_000 }, () => null)
    await flush()
    for (let i = 0; i < 3; i++) {
      FakeRecorder.instances[i].stop()
      await until(() => FakeRecorder.instances.length > i + 1 || out.ended > 0)
    }
    await until(() => out.ended === 1)
    expect(out.results.at(-1)).toEqual({ final: 'part 1 part 2', interim: '' })
    expect(out.errors).toEqual(['service:stt_unavailable'])
    expect(FakeRecorder.instances.every((r) => r.state === 'inactive')).toBe(true)
  })
})

// ------------------------------------------------------------------ the ramble

function manualClock() {
  let now = 0
  const fns = new Map<number, () => void>()
  let id = 0
  const clock: Clock = {
    now: () => now,
    setInterval: (fn) => { fns.set(++id, fn); return id as unknown as ReturnType<typeof setInterval> },
    clearInterval: (i) => { fns.delete(i as unknown as number) },
  }
  return { clock, advance: (ms: number) => { now += ms; for (const fn of [...fns.values()]) fn() } }
}

/** A long recogniser driven by the test. */
function scripted() {
  let cb: (RecognitionCallbacks & { onActivity?: () => void }) | null = null
  let stops = 0
  const recognize: LongRecognizer = (opts) => {
    cb = opts
    queueMicrotask(() => opts.onStart?.())
    return { local: false, stop: () => { stops++; cb?.onEnd() } }
  }
  return { recognize, get cb() { return cb! }, get stops() { return stops } }
}

function host(initial = '') {
  const views: RambleView[] = []
  const h = { value: initial, views, getValue: () => h.value, setValue: (v: string) => { h.value = v }, lang: () => 'en-US', update: (v: RambleView) => views.push(v) }
  return h
}

describe('createRamble', () => {
  it('writes the transcript after the field’s text, unnormalised, and announces Listening and Stopped', async () => {
    const h = host('Plan:')
    const rec = scripted()
    const r = createRamble(h, rec.recognize, manualClock().clock)
    r.start()
    await flush()
    rec.cb.onResult({ final: 'buy milk p1 at home', interim: 'tomorrow' })
    expect(h.value).toBe('Plan: buy milk p1 at home tomorrow')
    r.stop()
    expect(h.views.map((v) => v.announcement).filter(Boolean)).toEqual(['Listening', 'Stopped'])
    expect(h.views.at(-1)!.status).toBe('idle')
  })

  it('stops at five minutes and says the limit was reached; the text stays', async () => {
    const h = host()
    const rec = scripted()
    const { clock, advance } = manualClock()
    createRamble(h, rec.recognize, clock).start()
    await flush()
    rec.cb.onResult({ final: 'a long list', interim: '' })
    for (let s = 0; s < 299; s++) { rec.cb.onActivity?.(); advance(1000) }
    expect(rec.stops).toBe(0)
    expect(elapsedLabel(h.views.at(-1)!.elapsedMs)).toBe('4:59 / 5:00')
    rec.cb.onActivity?.()
    advance(1000)
    expect(rec.stops).toBe(1)
    expect(h.views.at(-1)!.message).toContain('5:00')
    expect(h.value).toBe('a long list')
    expect(RAMBLE_MAX_MS).toBe(300_000)
  })

  it('stops after 8 seconds of silence once the person spoke', async () => {
    const h = host()
    const rec = scripted()
    const { clock, advance } = manualClock()
    createRamble(h, rec.recognize, clock).start()
    await flush()
    advance(20_000) // never spoke yet: keeps listening
    expect(rec.stops).toBe(0)
    rec.cb.onActivity?.()
    advance(7_000)
    expect(rec.stops).toBe(0)
    advance(1_500)
    expect(rec.stops).toBe(1)
    expect(h.views.at(-1)!.message).toBeNull()
  })

  it('a failed piece keeps the text and says the speech service did not answer, or that the limit was reached', async () => {
    for (const [raw, kind, words] of [['stt_unavailable', 'service', 'did not answer'], ['rate_limited', 'service', 'limit was reached']] as const) {
      const h = host()
      const rec = scripted()
      createRamble(h, rec.recognize, manualClock().clock).start()
      await flush()
      rec.cb.onResult({ final: 'part 1 part 2', interim: '' })
      rec.cb.onError(kind, raw)
      rec.cb.onEnd()
      expect(h.value).toBe('part 1 part 2')
      expect(h.views.at(-1)!.message).toContain(words)
    }
  })

  it('joins text with one space', () => {
    expect(appendTranscript('', 'a')).toBe('a')
    expect(appendTranscript('x ', 'a')).toBe('x a')
    expect(appendTranscript('x', 'a')).toBe('x a')
    expect(appendTranscript('x', '')).toBe('x')
  })
})
