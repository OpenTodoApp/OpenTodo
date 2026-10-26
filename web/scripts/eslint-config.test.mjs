// The hooks lint must stay load-bearing (OpenSpec web-lint-and-test-hygiene):
// a missing effect dependency, a conditional hook and a stale suppression fail it,
// and a suppression with a reason keeps passing.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

const cwd = fileURLToPath(new URL('..', import.meta.url))
const lint = async (code, filePath = 'src/app/Fixture.tsx') => {
  const [result] = await new ESLint({ cwd }).lintText(code, { filePath })
  return result.messages.map((m) => `${m.ruleId ?? 'directive'}: ${m.severity}`)
}

describe('eslint config', () => {
  it('reports a missing effect dependency as an error', async () => {
    const code = `import { useEffect, useState } from 'react'
export function A({ id }: { id: string }) {
  const [, set] = useState('')
  useEffect(() => { set(id) }, [])
  return null
}`
    expect(await lint(code)).toEqual(['react-hooks/exhaustive-deps: 2'])
  })

  it('reports a conditional hook as an error', async () => {
    const code = `import { useState } from 'react'
export function A({ on }: { on: boolean }) {
  if (on) useState(0)
  return null
}`
    expect(await lint(code)).toEqual(['react-hooks/rules-of-hooks: 2'])
  })

  it('fails on a suppression that suppresses nothing', async () => {
    const code = `import { useEffect } from 'react'
export function A() {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nothing to hide
  useEffect(() => {}, [])
  return null
}`
    expect(await lint(code)).toEqual(['directive: 2'])
  })

  it('accepts a suppression that carries its reason', async () => {
    const code = `import { useEffect, useState } from 'react'
export function A({ id }: { id: string }) {
  const [, set] = useState('')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  useEffect(() => { set(id) }, [])
  return null
}`
    expect(await lint(code)).toEqual([])
  })

  // assistive-tech-semantics: a name on a role-less span or div is ignored by screen readers.
  it('refuses aria-label and aria-labelledby on a span or div without a role', async () => {
    const code = `export function A({ n }: { n: number }) {
  return <div><span aria-label={\`\${n} comments\`}>{n}</span><div aria-labelledby="x">y</div></div>
}`
    expect(await lint(code)).toEqual(['a11y/no-generic-aria-label: 2', 'a11y/no-generic-aria-label: 2'])
  })

  it('accepts a name on an element with a role, on other elements, and visually hidden text', async () => {
    const code = `export function A({ n }: { n: number }) {
  return <div role="group" aria-label="Range"><button aria-label="Close">x</button><span>{n}<span className="sr-only"> comments</span></span></div>
}`
    expect(await lint(code)).toEqual([])
  })

  // Test audit F2: tests wait for a condition, never for a fixed time.
  describe('no fixed waits in tests', () => {
    const test = 'src/app/fixture.test.tsx'
    it('refuses flush(n), sleep(n) and a promise around setTimeout', async () => {
      const code = `import { flush } from '../ui/test-utils'
declare const sleep: (ms: number) => Promise<void>
export async function t() {
  await flush(40)
  await sleep(100)
  await new Promise((r) => setTimeout(r, 50))
  await new Promise<void>((resolve) => setTimeout(() => resolve(), 20))
}`
      expect(await lint(code, test)).toEqual(Array(4).fill('test-hygiene/no-fixed-wait: 2'))
    })

    it('accepts flush(), a zero delay, waitFor and timers that are not waits', async () => {
      const code = `import { flush, waitFor } from '../ui/test-utils'
export async function t(done: () => boolean) {
  await flush()
  await flush(0)
  await new Promise((r) => setTimeout(r, 0))
  await waitFor(done, 'the list')
  setTimeout(() => {}, 500)
}`
      expect(await lint(code, test)).toEqual([])
    })

    it('accepts a fixed wait that carries its reason, and app code', async () => {
      const reasoned = `export async function t() {
  // eslint-disable-next-line test-hygiene/no-fixed-wait -- the type-ahead buffer resets after 500 ms
  await new Promise((r) => setTimeout(r, 550))
}`
      expect(await lint(reasoned, test)).toEqual([])
      expect(await lint(`export const pause = () => new Promise((r) => setTimeout(r, 50))`, 'src/lib/pause.ts')).toEqual([])
    })
  })
})
