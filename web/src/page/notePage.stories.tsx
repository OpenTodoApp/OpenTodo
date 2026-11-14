import type { Meta, StoryObj } from '@storybook/react-vite'
import type { NotePageContent } from '../lib/types'
import { NotePageScreen } from './NotePageScreen'

// A note page as a guest sees it (OpenSpec note-public-links, "The note page"). The
// page talks only to its own API, answered here by a stub so each state renders as is.
const NOW = Date.parse('2026-10-14T12:00:00')
const content: NotePageContent = {
  title: 'Babysitter how-to',
  text: 'Bedtime is at **8**. The door code is on the fridge, next to the emergency numbers.\n\n## Evening\n\n- [x] Dinner at 6\n- [ ] Bath\n- [ ] Two stories, then lights out\n\nCall Anna if anything comes up.',
  changedAt: NOW - 2 * 3_600_000,
  links: [{ id: 'l1', name: 'Pharmacy opening hours', url: 'https://example.com/pharmacy' }],
  files: [{ id: 'f1', name: 'allergies.pdf', size: 20_480, image: false }],
}

function stub(answer: { status: number; body: unknown }) {
  return () => {
    window.fetch = (async () => new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'content-type': 'application/json' } })) as typeof fetch
    return () => {}
  }
}

const meta: Meta<typeof NotePageScreen> = {
  title: 'Screens/Note page',
  component: NotePageScreen,
  args: { secret: 'abcdefghijklmnopqrstuv', fragment: '' },
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof NotePageScreen>

export const Live: Story = { beforeEach: stub({ status: 200, body: { kind: 'note', mode: 'live', rights: 'view', serverTime: NOW, label: null, ...content } }) }
export const WithoutTheFullLink: Story = { beforeEach: stub({ status: 200, body: { kind: 'note', mode: 'encrypted', rights: 'view', serverTime: NOW, label: null, snapshot: 'enc:v1:AAAA', snapshotAt: NOW } }) }
export const NoLongerAvailable: Story = { beforeEach: stub({ status: 404, body: { error: { code: 'page_invalid', message: 'gone' } } }) }
