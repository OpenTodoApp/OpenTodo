import { describe, expect, it } from 'vitest'
import { formatMessage, formatParts, MessageError, parse, signature } from './format'

describe('message formatter (app-localization D2)', () => {
  it('fills placeholders and leaves a missing one visible', () => {
    expect(formatMessage('Hello {name}', { name: 'Ada' })).toBe('Hello Ada')
    expect(formatMessage('Hello {name}')).toBe('Hello {name}')
    expect(formatMessage('{n} items', { n: 1234 }, 'de')).toBe('1.234 items')
  })

  it('plural with =0, one, other and # in English, German and French', () => {
    const m = '{n, plural, =0 {No tasks} one {# task} other {# tasks}}'
    expect([0, 1, 2].map((n) => formatMessage(m, { n }, 'en'))).toMatchInlineSnapshot(`
      [
        "No tasks",
        "1 task",
        "2 tasks",
      ]
    `)
    expect(formatMessage('{n, plural, one {# Aufgabe} other {# Aufgaben}}', { n: 1 }, 'de')).toBe('1 Aufgabe')
    expect(formatMessage('{n, plural, one {# Aufgabe} other {# Aufgaben}}', { n: 3 }, 'de')).toBe('3 Aufgaben')
    // French: 0 and 1 are "one".
    expect(formatMessage('{n, plural, one {# tâche} other {# tâches}}', { n: 0 }, 'fr')).toBe('0 tâche')
    expect(formatMessage('{n, plural, one {# tâche} other {# tâches}}', { n: 2 }, 'fr')).toBe('2 tâches')
  })

  it('plain snapshot of the reference message', () => {
    const m = '{n, plural, one {# task} other {# tasks}}'
    expect([0, 1, 2].map((n) => formatMessage(m, { n }))).toEqual(['0 tasks', '1 task', '2 tasks'])
  })

  it('select with fallback to other, nested in plural', () => {
    const m = '{kind, select, task {{n, plural, one {# task} other {# tasks}}} other {# items}}'
    expect(formatMessage(m, { kind: 'task', n: 2 })).toBe('2 tasks')
    expect(formatMessage('{kind, select, task {Task} other {Item}}', { kind: 'zzz' })).toBe('Item')
  })

  it('tags become parts and quotes escape syntax', () => {
    expect(formatParts('Press <b>Save</b> to keep {name}', { name: 'it' })).toEqual(['Press ', { tag: 'b', children: ['Save'] }, ' to keep it'])
    expect(formatMessage("Use '{'braces'}' and it''s fine")).toBe("Use {braces} and it's fine")
    expect(formatMessage('a < b and 2 > 1')).toBe('a < b and 2 > 1')
    expect(formatMessage('Send <b>{n, plural, one {# task} other {# tasks}}</b>', { n: 3 })).toBe('Send 3 tasks')
  })

  it('malformed messages throw on parse and format as their source text', () => {
    for (const bad of ['{name', 'oops }', '{n, plural, one {x}}', '{n, number}', '<b>open']) {
      if (bad === '<b>open') {
        expect(formatMessage(bad)).toBe('<b>open')
        continue
      }
      expect(() => parse(bad)).toThrow(MessageError)
      expect(formatMessage(bad, { name: 'x', n: 1 })).toBe(bad)
    }
  })

  it('reports the signature used by the catalog check', () => {
    expect(signature('{n, plural, one {# of {total}} other {# of {total}}} <b>{who}</b>')).toEqual({ args: ['n', 'total', 'who'], categories: {}, tags: ['b'] })
    expect(signature('{k, select, a {A} other {O}}').categories).toEqual({ k: ['a', 'other'] })
  })
})
