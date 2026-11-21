import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { playCompletionTone, playTone, primeTone, resetTone } from './tone'

// The generated tone (OpenSpec focus-mode, task 2.5): no file, two oscillators,
// silent when audio is refused.

function stubAudio(resume: () => Promise<void> = async () => undefined, state = 'running') {
  const oscillators: { frequency: { value: number }; started: boolean }[] = []
  class FakeContext {
    state = state
    currentTime = 0
    destination = {}
    resume = resume
    createGain() { return { connect: () => undefined, gain: { setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined } } }
    createOscillator() {
      const o = { type: '', frequency: { value: 0 }, started: false, connect: () => undefined, start() { o.started = true }, stop: () => undefined }
      oscillators.push(o)
      return o
    }
  }
  vi.stubGlobal('AudioContext', FakeContext)
  return oscillators
}

afterEach(() => { vi.unstubAllGlobals(); resetTone() })

describe('tone', () => {
  it('synthesizes the same completion cue as the native shells', () => {
    const fixture = JSON.parse(readFileSync(new URL(
      '../../../../mobile/android/app/src/test/resources/bridge/completion-sound.json',
      import.meta.url,
    ), 'utf8')) as { sampleRate: number; frames: number; samples: [number, number][] }
    const samples = new Float32Array(fixture.frames)
    const start = vi.fn()
    vi.stubGlobal('AudioContext', class {
      state = 'running'
      sampleRate = fixture.sampleRate
      destination = {}
      async resume() {}
      createBuffer(channels: number, length: number, sampleRate: number) {
        expect([channels, length, sampleRate]).toEqual([1, fixture.frames, fixture.sampleRate])
        return { getChannelData: () => samples }
      }
      createBufferSource() { return { connect() {}, start } }
    })
    primeTone()
    playCompletionTone()
    expect(start).toHaveBeenCalledOnce()
    const pcm = Int16Array.from(samples, value => Math.round(value * 32767))
    for (const [frame, expected] of fixture.samples) {
      expect(pcm[frame], `frame ${frame}`).toBe(expected)
    }
  })

  it('one call plays two sine notes, 660 Hz then 880 Hz', async () => {
    const osc = stubAudio()
    primeTone()
    expect(await playTone()).toBe(true)
    expect(osc.map((o) => o.frequency.value)).toEqual([660, 880])
    expect(osc.every((o) => o.started)).toBe(true)
  })

  it('plays at the given peak (the Long alert is louder)', async () => {
    const peaks: number[] = []
    stubAudio()
    const C = globalThis.AudioContext as unknown as { prototype: { createGain: () => unknown } }
    C.prototype.createGain = () => ({ connect: () => undefined, gain: { setValueAtTime: () => undefined, linearRampToValueAtTime: (v: number) => { if (v > 0) peaks.push(v) } } })
    primeTone()
    expect(await playTone(0.5)).toBe(true)
    expect(peaks).toEqual([0.5, 0.5])
  })

  it('a refused resume does not throw', async () => {
    const osc = stubAudio(() => Promise.reject(new Error('autoplay')), 'suspended')
    primeTone()
    await expect(playTone()).resolves.toBe(false)
    expect(osc).toHaveLength(0)
  })

  it('without the Web Audio API nothing plays and nothing throws', async () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    expect(() => primeTone()).not.toThrow()
    expect(await playTone()).toBe(false)
  })
})
