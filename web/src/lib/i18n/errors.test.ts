import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { __setLoaders, loadLanguage } from './catalog'
import { ERROR_MESSAGES, errorMessage } from './errors'

beforeEach(async () => {
  __setLoaders({ de: async () => ({ default: { 'Wrong email or password.': 'E-Mail-Adresse oder Passwort falsch.' } }) })
  await loadLanguage('en')
})

describe('translated error messages (app-localization D6)', () => {
  it('has an entry for every code the API can answer', () => {
    const codes = JSON.parse(readFileSync(resolve(__dirname, '../../../../internal/httpapi/testdata/error_codes.json'), 'utf8')) as string[]
    const missing = codes.filter((c) => !(c in ERROR_MESSAGES))
    expect(missing).toEqual([])
    expect(Object.keys(ERROR_MESSAGES).filter((c) => !codes.includes(c))).toEqual([])
  })

  it('English keeps the server message; German translates; unknown codes stay verbatim', async () => {
    expect(errorMessage('invalid_credentials', 'invalid email or password')).toBe('invalid email or password')
    await loadLanguage('de')
    expect(errorMessage('invalid_credentials', 'invalid email or password')).toBe('E-Mail-Adresse oder Passwort falsch.')
    expect(errorMessage('brand_new_code', 'Something new happened')).toBe('Something new happened')
  })
})
