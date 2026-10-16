import { describe, expect, it } from 'vitest'
import { formatMessage, formatNumberIn, messageShape, MessageSyntaxError, parseMessage, render, compile } from './format'

const TASKS = '{n, plural, one {# task} other {# tasks}}'

describe('message formatter (app-localization D2)', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(formatMessage('Delete {name}?', { name: 'Inbox' })).toBe('Delete Inbox?')
    expect(formatMessage('Hello {who}')).toBe('Hello {who}')
    expect(formatMessage('Löschen: {name}', { name: 'Arbeit' }, 'de')).toBe('Löschen: Arbeit')
  })

  it('plural with # in English, German and French', () => {
    expect([0, 1, 2].map((n) => formatMessage(TASKS, { n }, 'en'))).toEqual(['0 tasks', '1 task', '2 tasks'])
    const de = '{n, plural, one {# Änderung} other {# Änderungen}}'
    expect([1, 2].map((n) => formatMessage(de, { n }, 'de'))).toEqual(['1 Änderung', '2 Änderungen'])
    // French counts 0 as singular.
    const fr = '{n, plural, one {# tâche} other {# tâches}}'
    expect([0, 1, 2].map((n) => formatMessage(fr, { n }, 'fr'))).toEqual(['0 tâche', '1 tâche', '2 tâches'])
  })

  it('exact matches win over categories', () => {
    const m = '{n, plural, =0 {No tasks} one {# task} other {# tasks}}'
    expect(formatMessage(m, { n: 0 })).toBe('No tasks')
    expect(formatMessage(m, { n: 1 })).toBe('1 task')
  })

  it('groups digits in the language', () => {
    expect(formatMessage('Search {n, number} tasks', { n: 10000 }, 'en')).toBe('Search 10,000 tasks')
    expect(formatMessage('Rechercher dans {n, number} tâches', { n: 10000 }, 'fr').replace(/\s/g, ' ')).toBe('Rechercher dans 10 000 tâches')
    expect(formatMessage('{n, plural, one {# tâche} other {# tâches}}', { n: 10000 }, 'fr').replace(/\s/g, ' ')).toBe('10 000 tâches')
    // A plain placeholder writes a number as it is (ports, years).
    expect(formatMessage('Port {port}', { port: 8080 })).toBe('Port 8080')
    expect(formatNumberIn('de', 1234567)).toBe('1.234.567')
  })

  it('select picks the branch or other', () => {
    const m = '{kind, select, task {Task deleted} project {Project deleted} other {Deleted}}'
    expect(formatMessage(m, { kind: 'project' })).toBe('Project deleted')
    expect(formatMessage(m, { kind: 'label' })).toBe('Deleted')
  })

  it('nested plural inside select, and # inside the plural only', () => {
    const m = '{who, select, me {You completed {n, plural, one {# task} other {# tasks}}} other {{name} completed #{n}}}'
    expect(formatMessage(m, { who: 'me', n: 3 })).toBe('You completed 3 tasks')
    expect(formatMessage(m, { who: 'x', name: 'Ana', n: 3 })).toBe('Ana completed #3')
  })

  it('apostrophes quote only before syntax', () => {
    expect(formatMessage("Don't panic")).toBe("Don't panic")
    expect(formatMessage("Type '{' to start")).toBe('Type { to start')
    expect(formatMessage("It''s {x}", { x: 'fine' })).toBe("It's fine")
  })

  it('tags render through functions, or as text without them', () => {
    const parts = render<{ tag: string; c: unknown[] }>(compile('Read the <a>guide</a> now'), {}, 'en', { a: (c) => ({ tag: 'a', c }) })
    expect(parts).toEqual(['Read the ', { tag: 'a', c: ['guide'] }, ' now'])
    expect(formatMessage('Read the <a>guide</a>')).toBe('Read the guide')
  })

  it('a snapshot of the task plural for 0, 1 and 2', () => {
    expect([0, 1, 2].map((n) => formatMessage(TASKS, { n }))).toMatchInlineSnapshot(`
      [
        "0 tasks",
        "1 task",
        "2 tasks",
      ]
    `)
  })

  it('rejects malformed messages and renders them raw', () => {
    for (const bad of ['{n, plural, one {x}}', 'Open {name', 'a } b', '{n, plural, one {x} other {y}', '<b>bold', '{x, date}']) {
      expect(() => parseMessage(bad), bad).toThrow(MessageSyntaxError)
    }
    expect(formatMessage('Open {name')).toBe('Open {name')
  })

  it('describes the shape of a message for the catalog check', () => {
    expect(messageShape('Hi {name}, <b>{n, plural, one {# task} other {# tasks}}</b>')).toEqual({
      args: ['n', 'name'], tags: ['b'], plurals: { n: ['one', 'other'] },
    })
  })
})
