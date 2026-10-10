// Thin wrapper around the browser credential API for passkeys (OpenSpec change
// `passkeys`). The server speaks JSON with base64url strings for every binary
// field; the browser wants ArrayBuffers. This module converts between the two
// and keeps feature detection in one place. No dependencies.

/** Server-sent creation options (PublicKeyCredentialCreationOptionsJSON). */
export interface CreationOptionsJSON {
  challenge: string
  rp: { id: string; name: string }
  user: { id: string; name: string; displayName: string }
  pubKeyCredParams: { type: 'public-key'; alg: number }[]
  authenticatorSelection?: AuthenticatorSelectionCriteria
  timeout?: number
  attestation?: AttestationConveyancePreference
  excludeCredentials?: { type: 'public-key'; id: string }[]
}

/** Server-sent request options (PublicKeyCredentialRequestOptionsJSON). */
export interface RequestOptionsJSON {
  challenge: string
  rpId: string
  userVerification?: UserVerificationRequirement
  timeout?: number
  allowCredentials?: { type: 'public-key'; id: string }[]
}

/** What the server accepts back from a registration ceremony. */
export interface RegistrationJSON {
  id: string
  rawId: string
  type: 'public-key'
  response: { clientDataJSON: string; attestationObject: string; transports: string[] }
}

/** What the server accepts back from a sign-in ceremony. */
export interface AssertionJSON {
  id: string
  rawId: string
  type: 'public-key'
  response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle: string | null }
}

export function toBase64Url(buf: ArrayBuffer | ArrayBufferView): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

/** True when this browser exposes the WebAuthn API at all. */
export function passkeysSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function' &&
    typeof navigator !== 'undefined' &&
    !!navigator.credentials &&
    typeof navigator.credentials.get === 'function'
  )
}

/** True when the browser can offer passkeys in the autofill of a username field. */
export async function conditionalMediationAvailable(): Promise<boolean> {
  if (!passkeysSupported()) return false
  const pkc = window.PublicKeyCredential as unknown as { isConditionalMediationAvailable?: () => Promise<boolean> }
  if (typeof pkc.isConditionalMediationAvailable !== 'function') return false
  try {
    return await pkc.isConditionalMediationAvailable()
  } catch {
    return false
  }
}

/**
 * True when the error means "the user closed the prompt, or we aborted it":
 * the UI falls back silently instead of showing an error.
 */
export function isCancellation(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name
  return name === 'NotAllowedError' || name === 'AbortError'
}

/**
 * The page is open at a host the server's passkey domain (relying-party id) does
 * not cover, for example a second domain or an auto-generated URL while
 * OPENTODO_BASE_URL names another host. Browsers refuse the ceremony with "The
 * origin of the document is not authorized for the provided RP ID"; this says
 * what to change instead.
 */
export class PasskeyDomainError extends Error {
  constructor(readonly rpId: string, readonly host: string) {
    super(`Passkeys on this server are set up for ${rpId}, but this page is open at ${host}. Open the app at https://${rpId}, or ask the server owner to set OPENTODO_BASE_URL to https://${host}.`)
    this.name = 'PasskeyDomainError'
  }
}

/** True when a page on `host` may use passkeys of relying party `rpId` (same host or a subdomain). */
export function rpIdMatches(rpId: string, host: string): boolean {
  const r = rpId.toLowerCase().replace(/\.$/, '')
  const h = host.toLowerCase().replace(/\.$/, '')
  return r !== '' && (h === r || h.endsWith('.' + r))
}

function assertDomain(rpId: string | undefined): void {
  if (!rpId || typeof location === 'undefined') return
  if (!rpIdMatches(rpId, location.hostname)) throw new PasskeyDomainError(rpId, location.hostname)
}

export function creationOptionsFromJSON(o: CreationOptionsJSON): PublicKeyCredentialCreationOptions {
  return {
    challenge: fromBase64Url(o.challenge),
    rp: o.rp,
    user: { ...o.user, id: fromBase64Url(o.user.id) },
    pubKeyCredParams: o.pubKeyCredParams,
    authenticatorSelection: o.authenticatorSelection,
    timeout: o.timeout,
    attestation: o.attestation,
    excludeCredentials: (o.excludeCredentials ?? []).map((c) => ({ type: c.type, id: fromBase64Url(c.id) })),
  }
}

export function requestOptionsFromJSON(o: RequestOptionsJSON): PublicKeyCredentialRequestOptions {
  return {
    challenge: fromBase64Url(o.challenge),
    rpId: o.rpId,
    userVerification: o.userVerification,
    timeout: o.timeout,
    allowCredentials: (o.allowCredentials ?? []).map((c) => ({ type: c.type, id: fromBase64Url(c.id) })),
  }
}

/** Runs navigator.credentials.create() and serializes the result for the server. */
export async function createPasskey(options: CreationOptionsJSON, signal?: AbortSignal): Promise<RegistrationJSON> {
  assertDomain(options.rp?.id)
  const cred = (await navigator.credentials.create({ publicKey: creationOptionsFromJSON(options), signal })) as PublicKeyCredential | null
  if (!cred) throw new DOMException('No credential returned', 'NotAllowedError')
  const res = cred.response as AuthenticatorAttestationResponse
  return {
    id: cred.id,
    rawId: toBase64Url(cred.rawId),
    type: 'public-key',
    response: {
      clientDataJSON: toBase64Url(res.clientDataJSON),
      attestationObject: toBase64Url(res.attestationObject),
      transports: typeof res.getTransports === 'function' ? res.getTransports() : [],
    },
  }
}

/**
 * Runs navigator.credentials.get(). With `conditional` the request waits for
 * the user to pick a passkey from the autofill of an input that has
 * `autocomplete="username webauthn"`; abort it with the signal before
 * starting another ceremony.
 */
export async function getPasskey(options: RequestOptionsJSON, opts: { signal?: AbortSignal; conditional?: boolean } = {}): Promise<AssertionJSON> {
  assertDomain(options.rpId)
  const cred = (await navigator.credentials.get({
    publicKey: requestOptionsFromJSON(options),
    signal: opts.signal,
    ...(opts.conditional ? { mediation: 'conditional' as CredentialMediationRequirement } : {}),
  })) as PublicKeyCredential | null
  if (!cred) throw new DOMException('No credential returned', 'NotAllowedError')
  const res = cred.response as AuthenticatorAssertionResponse
  return {
    id: cred.id,
    rawId: toBase64Url(cred.rawId),
    type: 'public-key',
    response: {
      clientDataJSON: toBase64Url(res.clientDataJSON),
      authenticatorData: toBase64Url(res.authenticatorData),
      signature: toBase64Url(res.signature),
      userHandle: res.userHandle ? toBase64Url(res.userHandle) : null,
    },
  }
}
