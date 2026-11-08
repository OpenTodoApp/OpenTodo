// What's new dot rules (OpenSpec whats-new, design D2): a pure function over the device flags.
import { describe, expect, it, vi } from 'vitest'
import { newsDotShown, newsVersionToRecord, releaseUrl } from './whatsNew'

vi.mock('../generated/newsIndex.json', () => ({ default: { latest: '0.20.0', versions: ['0.20.0', '0.19.1'] } }))

describe('newsDotShown', () => {
  it('shows for an unread version that has an entry, with notices on', () => {
    expect(newsDotShown('0.20.0', true, null)).toBe(true)
    expect(newsDotShown('0.19.1', true, '0.20.0')).toBe(true)
  })

  it('is hidden once the version is recorded, with notices off, for an unknown version, and for a version without an entry', () => {
    expect(newsDotShown('0.20.0', true, '0.20.0')).toBe(false)
    expect(newsDotShown('0.20.0', false, null)).toBe(false)
    expect(newsDotShown(null, true, null)).toBe(false)
    expect(newsDotShown('0.21.0', true, null)).toBe(false)
  })
})

describe('recording and links', () => {
  it('records the server version, or the newest entry when the server version is unknown', () => {
    expect(newsVersionToRecord('0.19.1')).toBe('0.19.1')
    expect(newsVersionToRecord(null)).toBe('0.20.0')
  })

  it('links to the GitHub release of the version', () => {
    expect(releaseUrl('0.20.0')).toBe('https://github.com/OpenTodoApp/OpenTodo/releases/tag/v0.20.0')
  })
})
