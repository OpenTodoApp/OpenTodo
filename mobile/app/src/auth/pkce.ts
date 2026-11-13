// PKCE for app sign-in (OpenSpec account-access "App sign-in through the system
// browser", design D5): a random verifier that never leaves the app, its S256
// challenge for the sign-in page, and a random state that ties the answer to the request.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** base64url without padding (RFC 7636 appendix A). */
export function base64url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]]
    out += ALPHABET[a >> 2]! + ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]!
    if (b !== undefined) out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]!
    if (c !== undefined) out += ALPHABET[c & 63]!
  }
  return out
}

/** 32 random bytes as 43 URL-safe characters: a verifier or a state. */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

/** The S256 challenge of a verifier: base64url(SHA-256(verifier)). */
export async function challengeOf(verifier: string): Promise<string> {
  const ascii = Uint8Array.from(verifier, (ch) => ch.charCodeAt(0))
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', ascii)))
}
