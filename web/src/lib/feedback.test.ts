// The text and the links of "Something isn't working" (OpenSpec feedback-door, tasks 2.1).
import { describe, expect, it } from 'vitest'
import { browserName, contextBlock, fitDoor, githubUrl, mailtoUrl, startingText, titleFor, URL_LIMIT } from './feedback'

const ctx = { version: '0.22.0', page: '/today', browser: 'Firefox 132', language: 'en', offline: false }

describe('the context block', () => {
  it('names the version, page, browser, language and offline state, and nothing else', () => {
    expect(contextBlock(ctx)).toBe('--\nOpenTodo 0.22.0\nPage: /today\nBrowser: Firefox 132\nLanguage: en\nOffline: no')
  })

  it('reads unknown when the server version was never received, and yes when offline', () => {
    expect(contextBlock({ ...ctx, version: null, offline: true })).toContain('OpenTodo unknown\n')
    expect(contextBlock({ ...ctx, version: null, offline: true })).toContain('Offline: yes')
  })

  it('starts the box on an empty first line, the block after a blank line', () => {
    expect(startingText(ctx).startsWith('\n\n--\nOpenTodo 0.22.0')).toBe(true)
  })

  it('shortens the browser description', () => {
    expect(browserName('x'.repeat(300))).toHaveLength(120)
  })
})

describe('the title', () => {
  it('is the first line the person wrote, skipping the context block', () => {
    expect(titleFor(startingText(ctx).replace(/^\n\n/, 'The date picker closes by itself\n\n'))).toBe('The date picker closes by itself')
  })

  it('is the hello when the person wrote nothing, and the first line of a hello', () => {
    expect(titleFor(startingText(ctx))).toBe('Hello')
    expect(titleFor('hi\n\n' + contextBlock(ctx))).toBe('hi')
  })

  it('is kept to 80 characters', () => {
    expect(titleFor('a'.repeat(200))).toHaveLength(80)
  })

  it('does not take a context line the person kept as their words', () => {
    expect(titleFor('OpenTodo is great')).toBe('OpenTodo is great')
  })
})

describe('the doors', () => {
  it('builds the new-issue link with the title and the body', () => {
    const url = new URL(githubUrl('Hi', 'the body'))
    expect(url.origin + url.pathname).toBe('https://github.com/OpenTodoApp/OpenTodo/issues/new')
    expect(url.searchParams.get('title')).toBe('Hi')
    expect(url.searchParams.get('body')).toBe('the body')
  })

  it('builds the mail link with the subject and the body, percent-encoded', () => {
    expect(mailtoUrl('feedback@example.org', 'Hi there', 'a & b\nc')).toBe('mailto:feedback@example.org?subject=Hi%20there&body=a%20%26%20b%0Ac')
  })

  it('keeps the body when the link fits, and drops it when it does not', () => {
    const build = (body: string | null) => githubUrl('Long', body)
    expect(fitDoor(build, 'short')).toEqual({ url: build('short'), bodyOmitted: false })
    const long = fitDoor(build, 'x'.repeat(URL_LIMIT))
    expect(long.bodyOmitted).toBe(true)
    expect(long.url).not.toContain('body=')
  })
})
