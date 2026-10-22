// Quotes, code blocks, tables, images and mentions in the rich-text model
// (OpenSpec change editor-everywhere, design D1, D3, D4).
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  activeBody, DEFAULT_BODY, decodeDoc, encodeDoc, foldText, insertModel, mergeDocs, newDoc, parseMarkdown, projectDoc,
  renderMarkdown, toModel, updateBody, type RNode,
} from './richtext'
import { EditorState, TextSelection } from 'prosemirror-state'
import { insertBlocks, modelToPm, pmToModel, schema } from './richtextEditor'

const p = (text: string, marks: Record<string, Record<string, unknown>> = {}): RNode => ({ type: 'paragraph', attrs: {}, runs: [{ text, marks }] })
const cell = (text: string, header = false, align: string | null = null): RNode => ({ type: header ? 'table_header' : 'table_cell', attrs: { align }, runs: text ? [{ text, marks: {} }] : [] })
const row = (...cells: RNode[]): RNode => ({ type: 'table_row', attrs: {}, content: cells })

const members = new Map([['Bob', 'u-bob'], ['ana.r', 'u-ana']])
const mention = (token: string) => (members.has(token) ? { id: members.get(token)!, name: token } : null)

const every: RNode[] = [
  { type: 'heading', attrs: { level: 1 }, runs: [{ text: 'Trip', marks: {} }] },
  { type: 'paragraph', attrs: {}, runs: [{ text: 'Ask ', marks: {} }, { text: '@Bob', marks: { mention: { id: 'u-bob', name: 'Bob' } } }, { text: ' about it', marks: {} }] },
  { type: 'blockquote', attrs: {}, content: [p('Quoted'), { type: 'bullet_list', attrs: {}, content: [{ type: 'list_item', attrs: { checked: null }, content: [p('in a quote')] }] }] },
  { type: 'code_block', attrs: { lang: 'go' }, runs: [{ text: 'func main() {\n  x := "|"  \n}', marks: {} }] },
  { type: 'table', attrs: {}, content: [row(cell('Item', true), cell('Cost', true, 'right')), row(cell('Paint'), cell('40', false, 'right')), row(cell('a | b'), cell('', false, 'right'))] },
  { type: 'image', attrs: { id: 'att-1', alt: 'The [wall]' } },
]

describe('new blocks in the document', () => {
  it('survive Yjs encode, merge and decode', () => {
    const d = newDoc(1)
    d.transact(() => insertModel(d.getXmlFragment(DEFAULT_BODY), 0, every))
    const a = encodeDoc(d)
    const decoded = decodeDoc(a)!
    expect(toModel(activeBody(decoded))).toEqual(every)
    const b = decodeDoc(a)!
    b.clientID = 2
    b.transact(() => updateBody(activeBody(b), [...every, p('more')]))
    const merged = decodeDoc(mergeDocs(a, encodeDoc(b)))!
    expect(toModel(activeBody(merged))).toEqual([...every, p('more')])
  })

  it('round-trip through the editor schema', () => {
    expect(pmToModel(modelToPm(every))).toEqual(every)
  })

  it('an unknown node from a newer client is kept by an edit elsewhere', () => {
    const d = newDoc(1)
    const body = d.getXmlFragment(DEFAULT_BODY)
    d.transact(() => {
      insertModel(body, 0, [p('first')])
      const el = new Y.XmlElement('callout')
      el.setAttribute('tone', 'warn')
      body.insert(1, [el])
      const t = new Y.XmlText()
      el.insert(0, [t])
      t.insert(0, 'careful')
      insertModel(body, 2, [every[4]])
    })
    const edited = decodeDoc(encodeDoc(d))!
    edited.clientID = 3
    const model = toModel(activeBody(edited))
    edited.transact(() => updateBody(activeBody(edited), [p('first!'), model[1], model[2]]))
    const kept = activeBody(edited).get(1) as Y.XmlElement
    expect(kept.nodeName).toBe('callout')
    expect(kept.getAttribute('tone')).toBe('warn')
    expect(toModel(activeBody(edited))[2]).toEqual(every[4])
  })

  it('concurrent cell edits converge with the same shape', () => {
    const base = newDoc(1)
    base.transact(() => insertModel(base.getXmlFragment(DEFAULT_BODY), 0, [{ type: 'table', attrs: {}, content: [row(cell('A', true), cell('B', true)), row(cell(''), cell('')), row(cell(''), cell(''))] }]))
    const start = encodeDoc(base)
    const write = (client: number, r: number, c: number, text: string) => {
      const d = decodeDoc(start)!
      d.clientID = client
      const model = toModel(activeBody(d))
      const table = structuredClone(model[0])
      table.content![r].content![c].runs = [{ text, marks: {} }]
      d.transact(() => updateBody(activeBody(d), [table]))
      return encodeDoc(d)
    }
    const a = write(11, 1, 0, 'from A')
    const b = write(12, 2, 1, 'from B')
    const ab = projectDoc(mergeDocs(a, b))
    expect(ab).toBe(projectDoc(mergeDocs(b, a)))
    expect(ab).toBe('| A | B |\n| --- | --- |\n| from A |  |\n|  | from B |')
  })
})

describe('Markdown subset (design D1): parse then render is byte-identical', () => {
  const rows: [string, string][] = [
    ['paragraphs', 'One line\nnext line\n\nSecond paragraph'],
    ['headings', '# One\n\n###### Six'],
    ['marks', '**bold**, _italic_, ~~strike~~, `code`'],
    ['links', '[site](https://example.org/a) and [mail](mailto:a@example.org)'],
    ['lists', '- a\n- b\n  1. nested\n  2. more\n- [ ] open\n- [x] closed'],
    ['block quotes', '> quoted\n> second line\n>\n> - item'],
    ['fenced code', '```js\nconst a = 1  \n\n**not bold**\n```'],
    ['code with a fence inside', '````\n```\n````'],
    ['pipe tables', '| Item | Cost |\n| :--- | ---: |\n| Paint | 40 |\n| a \\| b | `x\\|y` |'],
    ['attachment images', '![The \\[wall\\]](attachment:att-1)'],
    ['mentions', 'Ask @Bob and @ana.r, not @nobody'],
    ['raw HTML and footnotes', '<details>open</details> and a note[^1]\n\n[^1]: the footnote'],
    ['headings above level 6', '####### seven'],
  ]
  for (const [name, md] of rows) {
    it(name, () => {
      expect(renderMarkdown(parseMarkdown(md, { mention }))).toBe(md)
    })
  }

  it('parses the new blocks into the model', () => {
    expect(parseMarkdown(renderMarkdown(every), { mention })).toEqual(every)
  })

  it('a web image stays a link to its address', () => {
    expect(parseMarkdown('![photo](https://example.org/a.png)')).toEqual([{
      type: 'paragraph', attrs: {}, runs: [{ text: '!', marks: {} }, { text: 'photo', marks: { link: { href: 'https://example.org/a.png' } } }],
    }])
  })

  it('a mention without a resolver, or of a non-member, is text', () => {
    expect(parseMarkdown('hi @Bob')).toEqual([p('hi @Bob')])
    expect(parseMarkdown('hi @carol', { mention })).toEqual([p('hi @carol')])
  })

  it('text that looks like a new block is escaped', () => {
    const md = renderMarkdown([p('> not a quote\n| not | a table |\n```')])
    expect(parseMarkdown(md)).toEqual([p('> not a quote\n| not | a table |\n```')])
  })

  it('a table wider than 10 columns stays text', () => {
    const wide = `| ${Array.from({ length: 11 }, (_, i) => i).join(' | ')} |\n|${' --- |'.repeat(11)}`
    expect(parseMarkdown(wide)[0].type).toBe('paragraph')
  })
})

describe('Table projection', () => {
  it('projects a pipe table and folds the text back into the same table', () => {
    const table: RNode = { type: 'table', attrs: {}, content: [row(cell('Item', true), cell('Cost', true)), row(cell('Paint'), cell('40'))] }
    const d = newDoc(1)
    d.transact(() => insertModel(d.getXmlFragment(DEFAULT_BODY), 0, [table]))
    const text = projectDoc(encodeDoc(d))
    expect(text).toBe('| Item | Cost |\n| --- | --- |\n| Paint | 40 |')
    // A PATCH of the description through the API folds back into the document.
    const folded = foldText(encodeDoc(d), text, 5000, 'server')
    expect(toModel(activeBody(decodeDoc(folded)!))).toEqual([table])
  })
})

describe('inserting an image in a table', () => {
  it('goes after the table instead of splitting it', () => {
    const doc = modelToPm([{ type: 'table', attrs: {}, content: [row(cell('A', true), cell('B', true)), row(cell('1'), cell('2'))] }])
    let state = EditorState.create({ doc })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4)))
    const next = state.apply(insertBlocks(state, [schema.nodes.image.create({ id: 'att-1', alt: 'x' })]))
    expect(pmToModel(next.doc).map((n) => n.type)).toEqual(['table', 'image'])
    expect(renderMarkdown(pmToModel(next.doc))).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |\n\n![x](attachment:att-1)')
  })
})
