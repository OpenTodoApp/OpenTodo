// The JSON the server and the browser exchange for passkeys (OpenSpec change
// `passkeys`): every binary field a base64url string. Types only, so lib/api.ts,
// which the native app shares (native-app-foundation D2), names them without
// lib/passkeys.ts and its browser credential API.

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
