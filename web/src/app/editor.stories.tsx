import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef, useState } from 'react'
import { EditorView } from 'prosemirror-view'
import { parseMarkdown } from '../lib/richtext'
import { createState } from '../lib/richtextEditor'
import { EditorToolbar, useEditorChrome } from './EditorChrome'
import type { CommandEnv } from './editorCommands'
import { imageViews } from './editorImage'

// The rich-text editor of notes and comments (OpenSpec change editor-everywhere):
// a note with a quote, a table, an image whose attachment is gone and a mention;
// the `/` menu open; and the formatting row of touch screens.
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
      v.dispatch(v.state.tr.insertText(' /', v.state.doc.child(0).nodeSize - 1))
    }
    const t = setTimeout(() => setReady(true), 50)
    return () => {
      clearTimeout(t)
      v.destroy()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- one editor per story
  return (
    <div className="max-w-md space-y-1">
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
