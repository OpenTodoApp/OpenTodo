import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  activeBody, activeBodyName, adds, bodyName, DEFAULT_BODY, decodeDoc, DOC_PREFIX, encodeDoc, foldText, insertModel, isReadable, mergeDocs, newDoc,
  parseInline, parseMarkdown, projectDoc, renderMarkdown, toModel, updateBody, type RNode, type Run,
} from './richtext'

const p = (text: string, marks: Record<string, Record<string, unknown>> = {}): RNode => ({ type: 'paragraph', attrs: {}, runs: [{ text, marks }] })
const item = (text: string, checked: boolean | null = null, more: RNode[] = []): RNode => ({ type: 'list_item', attrs: { checked }, content: [p(text), ...more] })

/** A document holding `nodes` in its default body, written by `client`. */
function docWith(nodes: RNode[], client = 1): Y.Doc {
  const d = newDoc(client)
  d.transact(() => insertModel(d.getXmlFragment(DEFAULT_BODY), 0, nodes))
  return d
}

/** Edit the visible body of an envelope as `client` would (set the whole display model). */
function edit(value: string, client: number, change: (nodes: RNode[]) => RNode[]): string {
  const d = decodeDoc(value) ?? newDoc()
  d.clientID = client
  const body = activeBody(d)
  d.transact(() => updateBody(body, change(toModel(body))))
  return encodeDoc(d)
}

const textOf = (value: string) => projectDoc(value)

describe('Markdown projection', () => {
  it('projection renders every node type', () => {
    const nodes: RNode[] = [
      { type: 'heading', attrs: { level: 2 }, runs: [{ text: 'Plan', marks: {} }] },
      {
        type: 'paragraph', attrs: {}, runs: [
          { text: 'Call ', marks: {} }, { text: 'Bob', marks: { strong: {} } }, { text: ' and ', marks: {} },
          { text: 'maybe', marks: { em: {} } }, { text: ' ', marks: {} }, { text: 'not', marks: { strike: {} } },
          { text: ' run ', marks: {} }, { text: 'make check', marks: { code: {} } }, { text: ', see ', marks: {} },
          { text: 'docs', marks: { link: { href: 'https://example.com/a b' } } }, { text: '\nsecond line', marks: {} },
        ],
      },
      { type: 'bullet_list', attrs: {}, content: [item('milk'), item('eggs', null, [{ type: 'bullet_list', attrs: {}, content: [item('free range')] }])] },
      { type: 'ordered_list', attrs: { order: 3 }, content: [item('three'), item('four')] },
      { type: 'bullet_list', attrs: {}, content: [item('done', true), item('todo', false)] },
    ]
    expect(renderMarkdown(nodes)).toBe([
      '## Plan',
      'Call **Bob** and _maybe_ ~~not~~ run `make check`, see [docs](https://example.com/a%20b)\nsecond line',
      '- milk\n- eggs\n  - free range',
      '3. three\n4. four',
      '- [x] done\n- [ ] todo',
    ].join('\n\n'))
  })

  it('escapes text that would otherwise read as Markdown', () => {
    const md = renderMarkdown([p('# not a heading'), p('- not a list'), p('2. not ordered'), p('5*3 = 15, [x] snake_case _x_ a~~b `c`')])
    expect(md).toBe('\\# not a heading\n\n\\- not a list\n\n2\\. not ordered\n\n5\\*3 = 15, \\[x] snake_case \\_x\\_ a\\~\\~b \\`c\\`')
    expect(parseMarkdown(md)).toEqual([p('# not a heading'), p('- not a list'), p('2. not ordered'), p('5*3 = 15, [x] snake_case _x_ a~~b `c`')])
  })

  it('parse(render(doc)) is stable', () => {
    const samples = [
      '# Title\n\nSome **bold**, *em*, _em_, ~~gone~~, `code`, [link](https://x.y/z).\n\n- a\n- b\n  1. nested\n  2. more\n- [ ] open\n- [x] closed',
      'plain text\nwith lines\n\n\n\nand gaps',
      '1) first\n2) second\n\n- loose\n\n- list',
      'unmatched **bold and *em and `tick and [bracket](',
      '- item\n  continued\n\n  second paragraph\n- next',
      '## Heading ##\n\n#hashtag and 3.5 and \\*escaped\\*',
      '- [ ]\n- [x] \n-',
      'emoji 😀 and **ünïcödé** _wörds_',
      '`` a`b `` and ` `` `',
      'intra*word*emphasis and **a*b*** and ***both*** and a~~b~~ and ~5 min~',
    ]
    for (const md of samples) {
      const once = parseMarkdown(md)
      const text = renderMarkdown(once)
      expect(parseMarkdown(text), md).toEqual(once)
      expect(renderMarkdown(parseMarkdown(text)), md).toBe(text)
    }
  })

  it('round-trips random Markdown-like input after one normalisation', () => {
    let seed = 42
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
    const alphabet = ['a', 'b', ' ', '*', '**', '_', '~', '~~', '`', '[', ']', '(', ')', '#', '- ', '1. ', '\n', '\n\n', '  ', '\\', 'x', '[ ] ', 'é']
    for (let n = 0; n < 1500; n++) {
      let md = ''
      const len = 1 + Math.floor(rand() * 24)
      for (let k = 0; k < len; k++) md += alphabet[Math.floor(rand() * alphabet.length)]
      const once = parseMarkdown(md)
      const text = renderMarkdown(once)
      expect(renderMarkdown(parseMarkdown(text)), JSON.stringify(md)).toBe(text)
    }
  })

  it('keeps plain text readable', () => {
    expect(renderMarkdown(parseMarkdown('Line one\nLine two\n\nNew paragraph'))).toBe('Line one\nLine two\n\nNew paragraph')
    expect(renderMarkdown(parseMarkdown('- [ ] call the plumber'))).toBe('- [ ] call the plumber')
    expect(parseInline('[a](javascript:alert(1))')).toEqual([{ text: 'a', marks: { link: { href: 'javascript:alert(1' } } }, { text: ')', marks: {} }])
  })
})

describe('documents', () => {
  it('encodes, decodes and projects', () => {
    const v = encodeDoc(docWith([p('hello', { strong: {} })]))
    expect(v.startsWith(DOC_PREFIX)).toBe(true)
    expect(textOf(v)).toBe('**hello**')
    expect(decodeDoc('')).not.toBeNull()
    expect(decodeDoc('ydoc:v1:@@@')).toBeNull()
    expect(decodeDoc('enc:v1:AAAA')).toBeNull()
    expect(isReadable(DOC_PREFIX + '/////w==')).toBe(false)
    expect(isReadable('')).toBe(true)
  })

  it('unknown marks survive merge', () => {
    // A newer client stores a "highlight" mark and an unknown node type.
    const d = newDoc(7)
    const body = d.getXmlFragment(DEFAULT_BODY)
    d.transact(() => {
      const para = new Y.XmlElement('paragraph')
      const callout = new Y.XmlElement('callout')
      body.insert(0, [para, callout])
      const t = new Y.XmlText()
      para.insert(0, [t])
      t.insert(0, 'marked text', { highlight: { color: 'yellow' } })
      callout.setAttribute('tone', 'warning')
      const ct = new Y.XmlText()
      callout.insert(0, [ct])
      ct.insert(0, 'careful')
    })
    const newer = encodeDoc(d)
    // This build shows both as plain paragraphs…
    expect(textOf(newer)).toBe('marked text\n\ncareful')
    // …and an edit elsewhere (a new paragraph) plus a merge with another device keep them.
    const mine = edit(newer, 11, (nodes) => [...nodes, p('mine')])
    const theirs = edit(newer, 12, (nodes) => [p('theirs'), ...nodes])
    const merged = decodeDoc(mergeDocs(mine, theirs)) as Y.Doc
    const xml = activeBody(merged).toString()
    expect(xml).toContain('highlight')
    expect(xml).toContain('<callout tone="warning">')
    expect(textOf(encodeDoc(merged))).toBe('theirs\n\nmarked text\n\ncareful\n\nmine')
    // Even editing the marked paragraph itself only changes the typed characters.
    const typed = edit(newer, 13, (nodes) => [{ ...nodes[0], runs: [{ text: 'marked text!', marks: {} }] }, nodes[1]])
    expect(activeBody(decodeDoc(typed) as Y.Doc).toString()).toContain('highlight')
  })

  it('adds() sees insertions, format changes and deletions, and nothing for equal states', () => {
    const base = encodeDoc(docWith([p('one two three')]))
    expect(adds(base, base)).toBe(false)
    const deleted = edit(base, 2, () => [p('one three')])
    const bolded = edit(base, 3, (): RNode[] => [{ type: 'paragraph', attrs: {}, runs: [{ text: 'one ', marks: {} }, { text: 'two', marks: { strong: {} } }, { text: ' three', marks: {} }] }])
    expect(adds(base, deleted)).toBe(true)
    expect(adds(deleted, base)).toBe(false)
    expect(adds(base, bolded)).toBe(true)
    const both = mergeDocs(deleted, bolded)
    expect(adds(both, deleted)).toBe(false)
    expect(adds(both, bolded)).toBe(false)
    expect(adds(deleted, both)).toBe(true)
  })

  it('folds a plain-text write deterministically', () => {
    const base = encodeDoc(docWith([p('old text')]))
    const a = foldText(base, '- [ ] call the plumber', 5000, 'server')
    const b = foldText(edit(base, 9, (n) => [...n, p('concurrent')]), '- [ ] call the plumber', 5000, 'server')
    expect(textOf(a)).toBe('- [ ] call the plumber')
    // Merging two devices' folds of the same write leaves one copy of the text.
    expect(textOf(mergeDocs(a, b))).toBe('- [ ] call the plumber')
    expect(activeBodyName(decodeDoc(a) as Y.Doc)).toBe(bodyName(5000, 'server'))
    // Folding again is idempotent.
    expect(adds(a, foldText(a, '- [ ] call the plumber', 5000, 'server'))).toBe(false)
    // A legacy note (no document yet) becomes a document the same way.
    expect(textOf(foldText('', 'Some **notes**', 1, 'd'))).toBe('Some **notes**')
  })

  it('editor updates touch only what changed', () => {
    const d = docWith([p('alpha'), p('beta'), p('gamma')])
    const body = d.getXmlFragment(DEFAULT_BODY)
    const before = body.toArray()
    d.transact(() => updateBody(body, [p('alpha'), p('beta!'), { type: 'heading', attrs: { level: 1 }, runs: [{ text: 'gamma', marks: {} }] }]))
    const after = body.toArray()
    expect(after[0]).toBe(before[0])
    expect(after[1]).toBe(before[1]) // edited in place
    expect(after[2]).not.toBe(before[2]) // type changed: replaced
    expect(renderMarkdown(toModel(body))).toBe('alpha\n\nbeta!\n\n# gamma')
  })
})

describe('convergence of documents', () => {
  // A tiny deterministic PRNG so failures reproduce.
  function rng(seed: number) {
    let s = seed >>> 0
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0
      return s / 2 ** 32
    }
  }

  it('random concurrent edits merge identically in any order', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rand = rng(seed)
      let base = encodeDoc(docWith([p('The quick brown fox'), p('jumps over'), p('the lazy dog')], 1))
      const replicas = [base, base, base]
      for (let round = 0; round < 4; round++) {
        for (let r = 0; r < replicas.length; r++) {
          replicas[r] = edit(replicas[r], 100 + r + 10 * round, (nodes) => {
            const out: RNode[] = nodes.map((n) => ({ ...n, runs: n.runs?.map((x) => ({ ...x })) }))
            const k = Math.floor(rand() * out.length)
            const text = (out[k].runs ?? []).map((x) => x.text).join('')
            const at = Math.floor(rand() * (text.length + 1))
            const op = rand()
            if (op < 0.4) out[k] = p(text.slice(0, at) + `[${r}${round}]` + text.slice(at))
            else if (op < 0.6) out[k] = p(text.slice(0, at) + text.slice(at + 3))
            else if (op < 0.8) out.splice(k + 1, 0, p(`new ${r}.${round}`))
            else out[k] = { type: 'paragraph', attrs: {}, runs: ([{ text: text.slice(0, at), marks: {} }, { text: text.slice(at), marks: { strong: {} } }] as Run[]).filter((x) => x.text) }
            return out
          })
        }
        // Exchange in a seed-dependent order: every replica ends with the union.
        const order = [0, 1, 2].sort(() => rand() - 0.5)
        let union = replicas[order[0]]
        for (const i of order.slice(1)) union = mergeDocs(union, replicas[i])
        const other = mergeDocs(mergeDocs(replicas[order[2]], replicas[order[1]]), replicas[order[0]])
        expect(textOf(union)).toBe(textOf(other))
        expect(adds(union, other)).toBe(false)
        expect(adds(other, union)).toBe(false)
        for (let r = 0; r < replicas.length; r++) replicas[r] = mergeDocs(replicas[r], union)
        base = union
      }
      for (const r of replicas) expect(textOf(r)).toBe(textOf(base))
    }
  })
})
