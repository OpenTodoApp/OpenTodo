// Accessible authentication (OpenSpec change accessibility-aa, WCAG 2.2 3.3.8): every
// password and code field of the sign-in, sign-up, two-factor, recovery, reset, invitation,
// re-authentication and unlock screens names what it holds (`autocomplete`), so a password
// manager can fill it, and none of them blocks a paste. The accessibility gate checks the
// signed-out screens in the browser with a synthetic paste (M20); this reads the source of
// every credential screen, the toured and the untoured ones.
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob('./*.tsx', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>
const SCREENS = ['AuthScreen', 'ResetScreen', 'InviteScreen', 'WorkspaceInviteScreen', 'ProjectInviteScreen', 'ReauthDialog', 'TwoFactorPanel', 'PasswordSection', 'UnlockScreen']
const CREDENTIAL = new Set(['current-password', 'new-password', 'one-time-code', 'username', 'email', 'username webauthn'])

/** The opening tags of the inputs of a source: `<input …>` and `<Input …>`. */
function inputs(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/<(input|Input)\b/g)) {
    let depth = 0
    let i = m.index! + 1
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') depth--
      else if (depth === 0 && src[i] === '>') break
    }
    out.push(src.slice(m.index, i + 1))
  }
  return out
}

describe('credential fields (accessibility-aa, WCAG 3.3.8)', () => {
  const screens = SCREENS.map((n) => [n, sources[`./${n}.tsx`]] as const)

  it('reads every credential screen', () => {
    expect(screens.filter(([, src]) => !src).map(([n]) => n)).toEqual([])
  })

  it.each(screens)('%s: password and code fields say what they hold', (_n, src) => {
    const problems: string[] = []
    for (const tag of inputs(src)) {
      const password = /type=(?:"password"|\{[^}]*'password')/.test(tag)
      const code = /inputMode="numeric"/.test(tag) && /maxLength=\{7\}/.test(tag)
      if (!password && !code) continue
      // Every value the attribute can take: a literal, or each quoted string of an expression.
      const attr = /autoComplete=("[^"]+"|\{[^}]*\})/.exec(tag)?.[1] ?? ''
      const literal = [...attr.matchAll(/["']([a-z -]+)["']/g)].map((m) => m[1])
      if (!literal.length || !literal.some((v) => CREDENTIAL.has(v))) problems.push(tag.slice(0, 120))
      if (code && !literal.includes('one-time-code')) problems.push(`code field without one-time-code: ${tag.slice(0, 80)}`)
    }
    expect(problems).toEqual([])
  })

  it.each(screens)('%s: nothing blocks a paste', (_n, src) => {
    expect(src).not.toMatch(/onPaste\s*=/)
    expect(src).not.toMatch(/addEventListener\(\s*['"]paste['"]/)
  })
})
