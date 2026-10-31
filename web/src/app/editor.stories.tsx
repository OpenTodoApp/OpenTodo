import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef, useState } from 'react'
import { TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { parseMarkdown } from '../lib/richtext'
import { createState } from '../lib/richtextEditor'
import { EditorToolbar, useEditorChrome } from './EditorChrome'
import type { CommandEnv } from './editorCommands'
import { imageViews } from './editorImage'
import { FormattingToggle } from './FormattingToggle'

// The rich-text editor of notes and comments (OpenSpec change editor-everywhere):
// a note with a quote, a table, an image whose attachment is gone and a mention;
// the `/` menu open; the formatting row of touch screens; and a note on a computer
// with its Formatting toggle at rest, focused and pressed, and the row with focus.
const meta: Meta = { title: 'Task/Editor' }
export default meta

const NOTE = [
  '## Hallway',
  '> Measure twice, paint once.',
  'Ask @BobOkafor about the colour.',
  '| Item | Cost |\n| --- | ---: |\n| Paint | 40 |\n| Brushes | 12 |',
  '![Before the paint](attachment:story-gone)',
  '```\nwhite, 2 coats\n```',
].join('\n\n')
const members = [{ userId: 'u-bob', name: 'Bob Okafor', email: 'bob@example.com', role: 'editor' as const }]

/**
 * A note on a computer with its Formatting toggle (notes-toolbar-desktop): at rest
 * (shown on hover only), with focus on the toggle (as on hover), pressed (the row
 * above the note), and with focus on the row's Link control.
 */
function DesktopNote({ state }: { state: 'rest' | 'focused' | 'pressed' | 'row-focus' }) {
  const host = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<EditorView | null>(null)
  const [pressed, setPressed] = useState(state === 'pressed' || state === 'row-focus')
  const [ready, setReady] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const env: CommandEnv = { notes: true, members: false, askLink: () => null, notify: () => {} }
  useEffect(() => {
    const v = new EditorView(host.current as HTMLDivElement, {
      state: createState(parseMarkdown('Pick the paint colour with Bob, then **book the painter** for Saturday.'), { askLink: () => null, onEscape: () => {}, size: () => 0 }),
      attributes: { 'aria-label': 'Notes', role: 'textbox', 'aria-multiline': 'true', class: 'notes-editor' },
    })
    setView(v)
    const t = setTimeout(() => {
      if (state === 'focused') frame.current?.querySelector<HTMLElement>('[data-notes-formatting]')?.focus()
      if (state === 'row-focus') frame.current?.querySelector<HTMLElement>('[data-toolbar-item][aria-label="Link"]')?.focus()
      setReady(true)
    }, 50)
    return () => {
      clearTimeout(t)
      v.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- one editor per story
  return (
    <div ref={frame} className="notes-frame max-w-md space-y-1" data-formatting>
      <FormattingToggle className="ui-reveal" pressed={pressed} onToggle={setPressed} controls="story-formatting" data-notes-formatting="" />
      <EditorToolbar id="story-formatting" view={view} env={env} visible={false} always={pressed} onMenu={() => {}} />
      <div ref={host} className="notes-host" />
      {!ready && <span data-story-pending />}
    </div>
  )
}

function Editor({ text, slash = false, toolbar = false }: { text: string; slash?: boolean; toolbar?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<EditorView | null>(null)
  const [ready, setReady] = useState(false)
  const env: CommandEnv = { notes: true, members: true, askLink: () => null, notify: () => {} }
  const chrome = useEditorChrome({ id: 'story', env, members, me: 'u-ada' })
  useEffect(() => {
    const nodes = parseMarkdown(text, { mention: (token) => (token === 'BobOkafor' ? { id: 'u-bob', name: token } : null) })
    const v = new EditorView(host.current as HTMLDivElement, {
      state: createState(nodes, { askLink: () => null, onEscape: () => {}, size: () => 0, suggest: chrome.bridge }),
      attributes: { 'aria-label': 'Notes', role: 'textbox', 'aria-multiline': 'true', class: 'notes-editor' },
      nodeViews: imageViews(null),
    })
    setView(v)
    if (slash) {
      v.focus()
      const end = v.state.doc.child(0).nodeSize - 1
      const tr = v.state.tr.insertText(' /', end)
      v.dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 2)))
    }
    const t = setTimeout(() => setReady(true), 50)
    return () => {
      clearTimeout(t)
      v.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- one editor per story
  return (
    <div className={`max-w-md space-y-1 ${slash ? 'min-h-96' : ''}`}>
      {toolbar && <EditorToolbar view={view} env={env} visible coarse onMenu={() => {}} />}
      <div ref={host} className="notes-host" data-notes-editing />
      {chrome.overlays}
      {!ready && <span data-story-pending />}
    </div>
  )
}

export const NoteWithBlocks: StoryObj = { render: () => <Editor text={NOTE} /> }
export const SlashMenuOpen: StoryObj = { render: () => <Editor text="Paint the hall" slash /> }
export const TouchToolbar: StoryObj = { render: () => <Editor text="Tap a word, then **Bold**." toolbar /> }
export const DesktopToggleAtRest: StoryObj = { render: () => <DesktopNote state="rest" /> }
export const DesktopToggleFocused: StoryObj = { render: () => <DesktopNote state="focused" /> }
export const DesktopTogglePressed: StoryObj = { render: () => <DesktopNote state="pressed" /> }
export const DesktopToolbarFocus: StoryObj = { render: () => <DesktopNote state="row-focus" /> }
