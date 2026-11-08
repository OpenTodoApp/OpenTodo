import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CSP_BASE, pagePolicy } from './pagePolicy'

describe('pagePolicy', () => {
  it('is the server fixture (internal/httpapi/testdata/csp_fixture.json)', () => {
    const f = JSON.parse(readFileSync(path.resolve(process.cwd(), '../internal/httpapi/testdata/csp_fixture.json'), 'utf8')) as { base: string }
    expect(CSP_BASE).toBe(f.base)
    expect(CSP_BASE).toContain("script-src 'self';")
    expect(CSP_BASE.endsWith("connect-src 'self'")).toBe(true)
  })

  it('keeps the build policy without a server policy', () => {
    expect(pagePolicy(null)).toBe(CSP_BASE)
    expect(pagePolicy('')).toBe(CSP_BASE)
  })

  it('takes the provider origins from connect-src', () => {
    const server = `${CSP_BASE} https://api.anthropic.com http://localhost:11434`
    expect(pagePolicy(server)).toBe(`${CSP_BASE} https://api.anthropic.com http://localhost:11434`)
  })

  it('keeps script-src whatever the server sends', () => {
    const hostile = "default-src *; script-src 'self' https://evil.example 'unsafe-inline' 'unsafe-eval'; connect-src 'self' * https://ok.example data: 'unsafe-inline' https://evil.example/path"
    const p = pagePolicy(hostile)
    expect(p).toBe(`${CSP_BASE} https://ok.example`)
    expect(p).not.toContain('evil')
    expect(p).not.toContain('unsafe-eval')
  })
})
