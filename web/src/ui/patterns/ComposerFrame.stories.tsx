import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconButton } from '../Button'
import { ComposerFrame } from './ComposerFrame'

// The one composer frame (task-full-page D6): the comment composer's, and the assistant's once it adopts it.
const meta: Meta = { title: 'UI/Patterns/Composer frame' }
export default meta

const field = (text = '') => (
  <textarea className="ui-input min-h-12 resize-none" aria-label="Write a comment" placeholder="Reply to Mia…" defaultValue={text} />
)
const tools = <><IconButton icon="at-sign" size="sm" label="Mention a member" /><IconButton icon="paperclip" size="sm" label="Attach files" /></>

export const Empty: StoryObj = { render: () => <ComposerFrame tools={tools} send={{ label: 'Comment', onSend: () => {}, disabled: true, shortcut: 'Ctrl+Enter' }}>{field()}</ComposerFrame> }
export const WithText: StoryObj = { render: () => <ComposerFrame tools={tools} end={<span className="text-hint text-faint">Ctrl+Enter</span>} send={{ label: 'Comment', onSend: () => {}, shortcut: 'Ctrl+Enter' }}>{field('Thursday at 3 works for me.')}</ComposerFrame> }
export const Sending: StoryObj = { render: () => <ComposerFrame tools={tools} send={{ label: 'Comment', onSend: () => {}, busy: true }}>{field('Thursday at 3 works for me.')}</ComposerFrame> }
