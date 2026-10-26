// @vitest-environment happy-dom
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from '../ui/test-utils'
import { ApiError } from './api'
import { errorText, messageOf } from './errorText'
import { useAction, type Action, type ActionOptions } from './useAction'

describe('errorText', () => {
  it('capitalises the server message, uses a code sentence, and words a network failure', () => {
    expect(errorText(new ApiError(400, 'unknown_code', 'url is required'))).toBe('Url is required')
    expect(errorText(new ApiError(400, 'unknown_code', 'url is required'), { capitalise: false })).toBe('url is required')
    expect(errorText(new ApiError(409, 'conflict', 'x'), { codes: { conflict: 'Busy.' } })).toBe('Busy.')
    expect(errorText(new ApiError(502, 'email_failed', 'smtp down'), { codes: { email_failed: (e) => `No: ${e.serverMessage}` } })).toBe('No: smtp down')
    expect(errorText(new TypeError('Failed to fetch'))).toBe('The server could not be reached.')
    expect(errorText(new TypeError('Failed to fetch'), { offline: 'Offline.' })).toBe('Offline.')
  })

  it('messageOf reads any thrown value', () => {
    expect(messageOf(new Error('boom'))).toBe('boom')
    expect(messageOf('plain')).toBe('plain')
  })
})

async function mount(options?: ActionOptions) {
  const box: { current: Action | null } = { current: null }
  function Probe() {
    box.current = useAction(options)
    return null
  }
  await render(<Probe />)
  return () => box.current!
}

describe('useAction', () => {
  it('is busy while the action runs and returns its value', async () => {
    const action = await mount()
    let finish: (v: number) => void = () => {}
    let pending!: Promise<number | undefined>
    await act(async () => { pending = action().run(() => new Promise<number>((r) => { finish = r })) })
    expect(action().busy).toBe(true)
    await act(async () => { finish(7) })
    expect(await pending).toBe(7)
    expect(action().busy).toBe(false)
    expect(action().error).toBeNull()
  })

  it('turns a failure into the error text; run resolves undefined, act rethrows', async () => {
    const seen: unknown[] = []
    let started = 0
    const action = await mount({ onStart: () => { started++ }, onError: (err) => seen.push(err) })
    const failure = new ApiError(400, 'invalid_input', 'bad thing')
    await act(async () => { expect(await action().run(() => Promise.reject(failure))).toBeUndefined() })
    expect(action().error).toBe(errorText(failure))
    expect(action().busy).toBe(false)
    expect(seen).toEqual([failure])
    await act(async () => { await expect(action().act(() => Promise.reject(failure))).rejects.toBe(failure) })
    expect(started).toBe(2)
    // The next attempt starts with the error cleared.
    await act(async () => { await action().run(async () => undefined) })
    expect(action().error).toBeNull()
  })

  it('leaves no error when describe returns null (a cancelled prompt)', async () => {
    const action = await mount({ describe: () => null })
    await act(async () => { await action().run(() => Promise.reject(new Error('cancelled'))) })
    expect(action().error).toBeNull()
  })
})
