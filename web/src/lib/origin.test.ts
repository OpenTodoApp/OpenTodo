// The sign-in screen names the server's address when a refusal comes from
// opening the page at another host (issue #125).
import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { wrongHostMessage } from './origin'

const refused = new ApiError(403, 'bad_origin', 'cross-site request rejected')

describe('wrongHostMessage', () => {
  it('names the configured host when the page is elsewhere', () => {
    expect(wrongHostMessage(refused, 'opentodo-demo.pixari.dev', 'demo.open-todo.app'))
      .toBe('This server is set up for opentodo-demo.pixari.dev. Open https://opentodo-demo.pixari.dev and try again.')
  })
  it('stays out of the way when the host matches, is unknown, or the error is another one', () => {
    expect(wrongHostMessage(refused, 'Demo.Open-Todo.app', 'demo.open-todo.app')).toBeNull()
    expect(wrongHostMessage(refused, undefined, 'demo.open-todo.app')).toBeNull()
    expect(wrongHostMessage(new ApiError(403, 'demo_token', 'x'), 'a.example', 'b.example')).toBeNull()
    expect(wrongHostMessage(new Error('offline'), 'a.example', 'b.example')).toBeNull()
  })
})
