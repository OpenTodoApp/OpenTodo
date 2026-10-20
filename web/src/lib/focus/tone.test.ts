import { afterEach, describe, expect, it, vi } from 'vitest'
import { playTone, primeTone, resetTone } from './tone'

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
  it('one call plays two sine notes, 660 Hz then 880 Hz', async () => {
    const osc = stubAudio()
    primeTone()
    expect(await playTone()).toBe(true)
    expect(osc.map((o) => o.frequency.value)).toEqual([660, 880])
    expect(osc.every((o) => o.started)).toBe(true)
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
