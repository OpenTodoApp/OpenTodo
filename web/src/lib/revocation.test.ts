// A revoked device removes its local copy (OpenSpec change revoked-device-wipe):
// the proof check against the key stored in the local database.
import 'fake-indexeddb/auto'
import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta } from './db'
import { rememberWipeKey, revokedHere, wipeIfRevoked } from './revocation'

const KEY = 'k3y-of-this-session_0123456789abcdefghijklmnopq'
/** The server's proof (internal/auth/revoke.go WipeProof). */
const proofFor = (key: string) => createHmac('sha256', key).update('opentodo device revoked v1').digest('base64url')
const signedOut = (proof: string) => ({ authenticated: false, revoked: { proof } })

afterEach(async () => {
  await db.meta.clear()
})

describe('wipe key', () => {
  it('is stored from a signed-in status and left alone when absent', async () => {
    await rememberWipeKey({ wipeKey: KEY })
    expect(await getMeta('wipeKey', null)).toBe(KEY)
    await rememberWipeKey({})
    expect(await getMeta('wipeKey', null)).toBe(KEY)
    const put = vi.spyOn(db.meta, 'put')
    await rememberWipeKey({ wipeKey: KEY })
    expect(put).not.toHaveBeenCalled()
    put.mockRestore()
  })
})

describe('revocation proof', () => {
  it('matches only the proof made with the stored key', async () => {
    await rememberWipeKey({ wipeKey: KEY })
    expect(await revokedHere(signedOut(proofFor(KEY)))).toBe(true)
    expect(await revokedHere(signedOut(proofFor('another session')))).toBe(false)
    expect(await revokedHere(signedOut('not base64url!'))).toBe(false)
    expect(await revokedHere(signedOut(''))).toBe(false)
    expect(await revokedHere({ authenticated: false })).toBe(false)
    // A signed-in answer never wipes, whatever it carries.
    expect(await revokedHere({ authenticated: true, revoked: { proof: proofFor(KEY) } })).toBe(false)
  })

  it('wipes nothing on a device that holds no key', async () => {
    const wipe = vi.fn(async () => {})
    expect(await wipeIfRevoked(signedOut(proofFor(KEY)), wipe)).toBe(false)
    expect(wipe).not.toHaveBeenCalled()
  })

  it('runs the wipe once the proof matches', async () => {
    await rememberWipeKey({ wipeKey: KEY })
    const wipe = vi.fn(async () => {})
    expect(await wipeIfRevoked(signedOut(proofFor(KEY)), wipe)).toBe(true)
    expect(wipe).toHaveBeenCalledOnce()
  })
})
