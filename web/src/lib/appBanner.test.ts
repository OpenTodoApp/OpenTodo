import { describe, expect, it } from 'vitest'
import { taskPageId, withAppBanner } from './appBanner'
import vectors from './appBanner.vectors.json'

describe('the app banner on a task page', () => {
  it('carries the tag the server carries for the same address (shared vectors)', () => {
    for (const { path, tag } of vectors.pages) {
      const id = taskPageId(new URL(vectors.origin + path).pathname)
      if (tag === null) {
        expect(id, path).toBeNull()
        continue
      }
      expect(id, path).not.toBeNull()
      expect(withAppBanner('<head><title>OpenTodo</title></head>', vectors.origin, id!), path).toBe(`<head>${tag}<title>OpenTodo</title></head>`)
    }
  })

  it('reads no id from a broken escape', () => {
    expect(taskPageId('/task/%E0')).toBeNull()
  })

  it('leaves a page without a head as it is', () => {
    expect(withAppBanner('no head', 'https://todo.example.com', 'abc')).toBe('no head')
  })
})
