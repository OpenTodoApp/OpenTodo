import { describe, expect, it } from 'vitest'
import { taskPageId, withAppBanner } from './appBanner'

describe('the app banner on a task page', () => {
  it('knows a task address and nothing else', () => {
    expect(taskPageId('/task/abc')).toBe('abc')
    expect(taskPageId('/task/a%20b')).toBe('a b')
    for (const p of ['/', '/task', '/task/', '/task/a/b', '/tasks/abc', '/t/abc', '/task/%E0']) expect(taskPageId(p)).toBeNull()
  })

  it('adds the tag the server adds', () => {
    const page = '<!doctype html><html><head><title>OpenTodo</title></head></html>'
    expect(withAppBanner(page, 'https://todo.example.com', 'abc')).toBe(
      '<!doctype html><html><head><meta name="apple-itunes-app" content="app-id=6832200428, app-argument=https://todo.example.com/task/abc"><title>OpenTodo</title></head></html>')
  })

  it('keeps the id inside the attribute and the argument whole', () => {
    const out = withAppBanner('<head></head>', 'https://todo.example.com', 'x"><script>&,app-id=1')
    expect(out).toContain('app-argument=https://todo.example.com/task/x%22%3E%3Cscript%3E%26%2Capp-id%3D1">')
    expect(out).not.toContain('<script>')
  })

  it('leaves a page without a head as it is', () => {
    expect(withAppBanner('no head', 'https://todo.example.com', 'abc')).toBe('no head')
  })
})
