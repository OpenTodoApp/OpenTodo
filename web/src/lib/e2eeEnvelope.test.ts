import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isEnvelope } from './crypto'
import { contentToString, isContentField, openValue, sealValue } from './e2eeEnvelope'

const source = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
const imports = (text: string) => [...text.matchAll(/^import\s.*?from\s+'([^']+)'/gms)].map((m) => m[1]).sort()

// The Obsidian plugin bundles this module (obsidian-plugin D10): it must stay free
// of the app's state (database, API client, shell, i18n catalogue).
describe('e2eeEnvelope', () => {
  it('imports only the generated field list, the crypto primitives and types', () => {
    expect(imports(source('./e2eeEnvelope.ts'))).toEqual(['../generated/opSchema', './crypto', './types'])
    // crypto.ts uses Web Crypto and the i18n `t` for its error messages only;
    // the plugin replaces `./i18n` at build time (obsidian/esbuild.config.mjs).
    expect(imports(source('./crypto.ts'))).toEqual(['./i18n'])
    expect(source('../generated/opSchema.ts')).toMatch(/^import type \{/m)
    expect(source('../generated/opSchema.ts')).not.toMatch(/^import \{/m)
  })

  it('seals content values and opens them back; other values pass through', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const origin = { kind: 'obsidian', id: 'Daily/2026-10-29.md', url: 'obsidian://open?vault=Notes&file=Daily%2F2026-10-29.md', title: '2026-10-29' }
    const title = await sealValue(key, 'task', 't1', 'title', 'Renew passport')
    const sealedOrigin = await sealValue(key, 'task', 't1', 'origin', origin)
    expect(isEnvelope(title) && isEnvelope(sealedOrigin)).toBe(true)
    expect(await openValue(key, 'task', 't1', 'title', title)).toBe('Renew passport')
    expect(await openValue(key, 'task', 't1', 'origin', sealedOrigin)).toEqual(origin)
    expect(await sealValue(key, 'task', 't1', 'priority', 2)).toBe(2)
    expect(await sealValue(key, 'task', 't1', 'title', '')).toBe('')
    // Bound to the place it was sealed for.
    await expect(openValue(key, 'task', 't2', 'title', title)).rejects.toThrow()
    expect(isContentField('label', 'name') && !isContentField('task', 'labels')).toBe(true)
    expect(contentToString('task', 'origin', 'enc:v1:x')).toBeNull()
  })
})
