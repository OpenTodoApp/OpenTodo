import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  conditionalMediationAvailable,
  createPasskey,
  creationOptionsFromJSON,
  fromBase64Url,
  getPasskey,
  isCancellation,
  PasskeyDomainError,
  passkeysSupported,
  requestOptionsFromJSON,
  rpIdMatches,
  toBase64Url,
} from './passkeys'

const bytes = (...b: number[]) => new Uint8Array(b).buffer

function installCredentialApi(opts: { conditional?: boolean | 'missing'; create?: unknown; get?: unknown } = {}) {
  const pkc = function PublicKeyCredential() {} as unknown as Record<string, unknown>
  if (opts.conditional !== 'missing') pkc.isConditionalMediationAvailable = () => Promise.resolve(opts.conditional ?? true)
  vi.stubGlobal('window', { PublicKeyCredential: pkc })
  const create = vi.fn(() => Promise.resolve(opts.create ?? null))
  const get = vi.fn(() => Promise.resolve(opts.get ?? null))
  vi.stubGlobal('navigator', { credentials: { create, get } })
  return { create, get }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('base64url', () => {
  it('round-trips arbitrary bytes without padding or unsafe characters', () => {
    for (let len = 0; len < 70; len++) {
      const src = new Uint8Array(len)
      for (let i = 0; i < len; i++) src[i] = (i * 37 + len * 11) & 0xff
      const enc = toBase64Url(src)
      expect(enc).not.toMatch(/[+/=]/)
      expect(new Uint8Array(fromBase64Url(enc))).toEqual(src)
    }
  })

  it('matches the server encoding', () => {
    // Same vector as internal/webauthn TestBase64URL.
    expect(toBase64Url(bytes(0xfb, 0xff, 0x00, 0x7e))).toBe('-_8Afg')
    expect(new Uint8Array(fromBase64Url('-_8Afg=='))).toEqual(new Uint8Array([0xfb, 0xff, 0x00, 0x7e]))
  })

  it('encodes typed-array views by their window only', () => {
    const backing = new Uint8Array([9, 1, 2, 3, 9])
    expect(toBase64Url(backing.subarray(1, 4))).toBe(toBase64Url(bytes(1, 2, 3)))
  })
})

describe('feature detection', () => {
  it('reports no support without the credential API', async () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', {})
    expect(passkeysSupported()).toBe(false)
    expect(await conditionalMediationAvailable()).toBe(false)
  })

  it('detects support and conditional mediation', async () => {
    installCredentialApi({ conditional: true })
    expect(passkeysSupported()).toBe(true)
    expect(await conditionalMediationAvailable()).toBe(true)
  })

  it('treats a missing or failing conditional check as unavailable', async () => {
    installCredentialApi({ conditional: 'missing' })
    expect(passkeysSupported()).toBe(true)
    expect(await conditionalMediationAvailable()).toBe(false)
    installCredentialApi({ conditional: false })
    expect(await conditionalMediationAvailable()).toBe(false)
  })

  it('classifies cancellation', () => {
    expect(isCancellation(new DOMException('x', 'NotAllowedError'))).toBe(true)
    expect(isCancellation(new DOMException('x', 'AbortError'))).toBe(true)
    expect(isCancellation(new DOMException('x', 'SecurityError'))).toBe(false)
    expect(isCancellation(null)).toBe(false)
  })
})

describe('ceremony wrappers', () => {
  const creation = {
    challenge: toBase64Url(bytes(1, 2, 3)),
    rp: { id: 'todo.example.com', name: 'OpenTodo' },
    user: { id: toBase64Url(new TextEncoder().encode('user-1')), name: 'o@example.com', displayName: 'Owner' },
    pubKeyCredParams: [{ type: 'public-key' as const, alg: -7 }],
    authenticatorSelection: { residentKey: 'required' as const, userVerification: 'preferred' as const },
    attestation: 'none' as const,
    excludeCredentials: [{ type: 'public-key' as const, id: toBase64Url(bytes(7, 7)) }],
  }

  it('converts options to binary form', () => {
    const o = creationOptionsFromJSON(creation)
    expect(new Uint8Array(o.challenge as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]))
    expect(new TextDecoder().decode(o.user.id as ArrayBuffer)).toBe('user-1')
    expect(new Uint8Array(o.excludeCredentials![0].id as ArrayBuffer)).toEqual(new Uint8Array([7, 7]))
    const r = requestOptionsFromJSON({ challenge: toBase64Url(bytes(4)), rpId: 'todo.example.com' })
    expect(r.allowCredentials).toEqual([])
    expect(r.rpId).toBe('todo.example.com')
  })

  it('serializes a registration for the server', async () => {
    const { create } = installCredentialApi({
      create: {
        id: 'AQI', rawId: bytes(1, 2), type: 'public-key',
        response: { clientDataJSON: bytes(3), attestationObject: bytes(4, 5), getTransports: () => ['internal'] },
      },
    })
    const ac = new AbortController()
    const out = await createPasskey(creation, ac.signal)
    expect(out).toEqual({
      id: 'AQI', rawId: 'AQI', type: 'public-key',
      response: { clientDataJSON: 'Aw', attestationObject: 'BAU', transports: ['internal'] },
    })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ signal: ac.signal }))
  })

  it('serializes an assertion and passes conditional mediation through', async () => {
    const { get } = installCredentialApi({
      get: {
        id: 'CQ', rawId: bytes(9), type: 'public-key',
        response: { clientDataJSON: bytes(1), authenticatorData: bytes(2), signature: bytes(3), userHandle: null },
      },
    })
    const out = await getPasskey({ challenge: 'AA', rpId: 'localhost' }, { conditional: true })
    expect(out.response).toEqual({ clientDataJSON: 'AQ', authenticatorData: 'Ag', signature: 'Aw', userHandle: null })
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ mediation: 'conditional' }))
    await getPasskey({ challenge: 'AA', rpId: 'localhost' })
    expect(get.mock.calls[1]).toEqual([expect.not.objectContaining({ mediation: 'conditional' })])
  })

  it('turns a null credential into a cancellation', async () => {
    installCredentialApi({})
    await expect(getPasskey({ challenge: 'AA', rpId: 'localhost' })).rejects.toSatisfy(isCancellation)
  })
})

describe('passkey domain', () => {
  it('matches the same host or a subdomain only', () => {
    expect(rpIdMatches('todo.example.com', 'todo.example.com')).toBe(true)
    expect(rpIdMatches('example.com', 'todo.example.com')).toBe(true)
    expect(rpIdMatches('Todo.Example.com', 'todo.example.com.')).toBe(true)
    expect(rpIdMatches('todo.example.com', 'abc123.sslip.io')).toBe(false)
    expect(rpIdMatches('example.com', 'badexample.com')).toBe(false)
    expect(rpIdMatches('', 'todo.example.com')).toBe(false)
  })

  it('explains a mismatch instead of calling the browser', async () => {
    const { create, get } = installCredentialApi()
    vi.stubGlobal('location', { hostname: 'abc123.sslip.io' })
    const err = await getPasskey({ challenge: 'AA', rpId: 'todo.example.com' }).catch((e) => e)
    expect(err).toBeInstanceOf(PasskeyDomainError)
    expect(err.message).toContain('set up for todo.example.com')
    expect(err.message).toContain('open at abc123.sslip.io')
    expect(err.message).toContain('OPENTODO_BASE_URL')
    expect(isCancellation(err)).toBe(false)
    await expect(createPasskey({ challenge: 'AA', rp: { id: 'todo.example.com', name: 'OpenTodo' }, user: { id: 'AA', name: 'a', displayName: 'a' }, pubKeyCredParams: [] }))
      .rejects.toBeInstanceOf(PasskeyDomainError)
    expect(get).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
