// @vitest-environment happy-dom
// Indent and Outdent as editor commands (GitHub issue 1477): Tab and Shift-Tab without a
// keyboard, for the formatting row's More menu and the `/` menu. They are offered only
// where the line can move: Indent on a list line under another, Outdent on any list line.
import { TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { afterEach, describe, expect, it } from 'vitest'
import { renderMarkdown, type RNode } from '../lib/richtext'
import { createState, pmToModel, type EditorHooks } from '../lib/richtextEditor'
import { editorCommands, type CommandEnv } from './editorCommands'

const hooks = (): EditorHooks => ({ askLink: () => null, onEscape: () => {}, size: () => 0 })
const item = (text: string, children: RNode[] = []): RNode => ({ type: 'list_item', attrs: { checked: null }, content: [{ type: 'paragraph', attrs: {}, runs: [{ text, marks: {} }] }, ...children] }) as unknown as RNode
const env = {} as CommandEnv
const views: EditorView[] = []
afterEach(() => { for (const v of views.splice(0)) v.destroy() })

function viewOf(doc: RNode[], caretIn: string): EditorView {
  const v = new EditorView(document.createElement('div'), { state: createState(doc, hooks()) })
  views.push(v)
  let at = -1
  v.state.doc.descendants((n, pos) => { if (at < 0 && n.isText && n.text === caretIn) at = pos + 1 })
  v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, at)))
  return v
}
const cmd = (id: string) => editorCommands().find((c) => c.id === id)!
const md = (v: EditorView) => renderMarkdown(pmToModel(v.state.doc))

describe('Indent and Outdent', () => {
  it('Indent nests a line under the one above, Outdent brings it back', () => {
    const v = viewOf([{ type: 'bullet_list', attrs: {}, content: [item('fence'), item('paint')] } as unknown as RNode], 'paint')
    expect(cmd('indent').available!(v, env)).toBe(true)
    cmd('indent').run(v, env)
    expect(md(v)).toBe('- fence\n  - paint')
    expect(cmd('outdent').available!(v, env)).toBe(true)
    cmd('outdent').run(v, env)
    expect(md(v)).toBe('- fence\n- paint')
    // As Shift-Tab does, Outdent on a top-level line takes it out of the list.
    cmd('outdent').run(v, env)
    expect(md(v)).toBe('- fence\n\npaint')
  })

  it('are not offered outside a list, nor Indent on a list\'s first line', () => {
    const first = viewOf([{ type: 'bullet_list', attrs: {}, content: [item('fence'), item('paint')] } as unknown as RNode], 'fence')
    expect(cmd('indent').available!(first, env)).toBe(false)
    const plain = viewOf([{ type: 'paragraph', attrs: {}, runs: [{ text: 'eggs', marks: {} }] } as unknown as RNode], 'eggs')
    expect(cmd('indent').available!(plain, env)).toBe(false)
    expect(cmd('outdent').available!(plain, env)).toBe(false)
  })
})
