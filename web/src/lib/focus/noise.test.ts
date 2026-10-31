// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { noisePlaying, noiseSamples, previewNoise, resetNoise, setNoise, setSessionNoise } from './noise'

// Background noise (OpenSpec focus-everywhere, task 3.3): generated samples, a
// looped buffer with fades, and a start at the next interaction when audio is
// refused. A fake AudioContext records what plays.

interface FakeSource { loop: boolean; started: boolean; stoppedAt: number | null; buffer: { data: Float32Array } | null }
interface Ramp { to: number; at: number }

function stubAudio(initial: 'running' | 'suspended' = 'running', allowResume = true) {
  const sources: FakeSource[] = []
  const ramps: Ramp[] = []
  class FakeContext {
    state = initial
    currentTime = 10
    sampleRate = 8000
    destination = {}
    async resume() { if (allowResume) this.state = 'running' }
    createBuffer(_c: number, length: number) { const data = new Float32Array(length); return { length, getChannelData: () => data, data } }
    createBufferSource() {
      const s: FakeSource & { connect: () => void; start: () => void; stop: (at?: number) => void } = {
        loop: false, started: false, stoppedAt: null, buffer: null,
        connect: () => undefined, start() { s.started = true }, stop(at = 0) { s.stoppedAt = at },
      }
      sources.push(s)
      return s
    }
    createGain() {
      return {
        connect: () => undefined,
        gain: {
          value: 0,
          setValueAtTime: () => undefined, cancelScheduledValues: () => undefined, setTargetAtTime: (v: number) => ramps.push({ to: v, at: -1 }),
          linearRampToValueAtTime: (to: number, at: number) => ramps.push({ to, at }),
        },
      }
    }
  }
  vi.stubGlobal('AudioContext', FakeContext)
  return { sources, ramps, allow: () => { allowResume = true } }
}

afterEach(() => { resetNoise(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('noise samples', () => {
  it('white, pink and brown stay within [-1, 1] and differ in smoothness', () => {
    let seed = 1
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    const step = (xs: Float32Array) => xs.slice(1).reduce((sum, x, i) => sum + Math.abs(x - xs[i]), 0) / (xs.length - 1)
    const white = noiseSamples('white', 4000, random)
    const pink = noiseSamples('pink', 4000, random)
    const brown = noiseSamples('brown', 4000, random)
    for (const xs of [white, pink, brown]) expect(xs.every((x) => x >= -1 && x <= 1)).toBe(true)
    // Brown changes least from sample to sample, white most.
    expect(step(brown)).toBeLessThan(step(pink))
    expect(step(pink)).toBeLessThan(step(white))
  })
})

describe('playing', () => {
  it('Brown loops a two-second buffer, fades in over 300 ms to the volume, and fades out on stop', async () => {
    const { sources, ramps } = stubAudio()
    await setNoise('brown', 40)
    expect(noisePlaying()).toBe('brown')
    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({ loop: true, started: true })
    expect(ramps).toContainEqual({ to: 0.4, at: 10.3 })
    await setNoise(null, 0)
    expect(noisePlaying()).toBeNull()
    expect(ramps).toContainEqual({ to: 0, at: 10.3 })
    expect(sources[0].stoppedAt).toBeGreaterThan(10.3)
  })

  it('the same kind again only changes the volume; another kind replaces it', async () => {
    const { sources, ramps } = stubAudio()
    await setNoise('pink', 40)
    await setNoise('pink', 10)
    expect(sources).toHaveLength(1)
    expect(ramps.at(-1)).toEqual({ to: 0.1, at: -1 })
    await setNoise('white', 10)
    expect(sources).toHaveLength(2)
    expect(sources[0].stoppedAt).not.toBeNull()
    expect(noisePlaying()).toBe('white')
  })

  it('After a reload: audio refused until a gesture, the noise starts at the next tap or key press', async () => {
    const audio = stubAudio('suspended', false)
    await setNoise('pink', 40)
    expect(noisePlaying()).toBeNull()
    audio.allow()
    window.dispatchEvent(new KeyboardEvent('keydown'))
    await vi.waitFor(() => expect(noisePlaying()).toBe('pink'))
  })

  it('Preview plays for a moment and then goes back to what the session wants', async () => {
    vi.useFakeTimers()
    stubAudio()
    await previewNoise('white', 40, 3000)
    expect(noisePlaying()).toBe('white')
    await setSessionNoise('brown', 40)
    expect(noisePlaying()).toBe('white')
    await vi.advanceTimersByTimeAsync(3000)
    expect(noisePlaying()).toBe('brown')
  })
})
