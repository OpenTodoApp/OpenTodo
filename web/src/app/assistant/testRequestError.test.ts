import { describe, expect, it } from 'vitest'
import { ApiError } from '../../lib/api'
import { testRequestError } from './testRequestError'

const fallback = () => 'fallback'

describe('testRequestError (api-method-not-allowed)', () => {
  it('names a 405 from a changed request and says the provider was not asked', () => {
    const err = new ApiError(405, 'method_not_allowed', 'GET is not allowed on /api/v1/settings/assistant/test; use POST')
    const text = testRequestError(err, fallback)
    expect(text).toContain('(405: GET is not allowed on /api/v1/settings/assistant/test; use POST)')
    expect(text).toContain('reverse proxy')
    expect(text).toContain('the provider was not asked')
  })

  it('names an unknown route the same way, with the method and path the server received', () => {
    const err = new ApiError(404, 'not_found', 'unknown API route: POST /api/v1/settings/assistant/test/')
    expect(testRequestError(err, fallback)).toContain('(404: unknown API route: POST /api/v1/settings/assistant/test/)')
  })

  it('leaves every other failure to the screen’s own wording', () => {
    expect(testRequestError(new ApiError(400, 'invalid_input', 'providers.gemini.model: enter a model id'), fallback)).toBe('fallback')
    expect(testRequestError(new ApiError(403, 'forbidden', 'only the owner can manage the assistant settings'), fallback)).toBe('fallback')
    expect(testRequestError(new TypeError('Failed to fetch'), fallback)).toBe('fallback')
  })
})
