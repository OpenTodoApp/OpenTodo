import type { Meta, StoryObj } from '@storybook/react-vite'
import type { TaskPageContent } from '../lib/types'
import { TaskPageScreen } from './TaskPageScreen'

// A task page as a guest sees it (OpenSpec task-pages, "The task page"). The page
// talks only to its own API, answered here by a stub so each state renders as is.
const NOW = Date.parse('2026-10-14T12:00:00')
const content: TaskPageContent = {
  id: 't1', title: 'Paint the fence', description: 'Two coats of **white**. The paint is in the shed; brushes are on the shelf.',
  due: { date: '2026-10-17' }, deadline: null, completed_at: null,
  subtasks: [{ id: 's1', title: 'Buy primer', completed_at: NOW - 3_600_000, depth: 1 }, { id: 's2', title: 'Sand the boards', completed_at: null, depth: 1 }, { id: 's3', title: 'First coat', completed_at: null, depth: 2 }],
  links: [{ id: 'a1', name: 'Paint colour chart', url: 'https://example.com/colours' }], files: [], location: null,
  comments: [
    { id: 'c1', name: 'Ada Lovelace', guest: false, body: 'The ladder is behind the garage.', createdAt: NOW - 7_200_000 },
    { id: 'c2', name: 'Marco', guest: true, body: 'Bought the primer, starting tomorrow morning.', createdAt: NOW - 3_600_000 },
  ],
}

function stub(answer: { status: number; body: unknown }) {
  return () => {
    window.fetch = (async () => new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'content-type': 'application/json' } })) as typeof fetch
    return () => {}
  }
}

const live = (rights: string) => ({ status: 200, body: { mode: 'live', rights, serverTime: NOW, label: null, ...content } })

const meta: Meta<typeof TaskPageScreen> = {
  title: 'Screens/Task page',
  component: TaskPageScreen,
  args: { secret: 'abcdefghijklmnopqrstuv', fragment: '' },
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof TaskPageScreen>

export const ReplyAndTick: Story = { beforeEach: stub(live('tick')) }
export const ReadOnly: Story = { beforeEach: stub(live('view')) }
export const WithoutTheFullLink: Story = { beforeEach: stub({ status: 200, body: { mode: 'encrypted', rights: 'reply', serverTime: NOW, label: null, snapshot: 'enc:v1:AAAA', snapshotAt: NOW } }) }
export const NoLongerAvailable: Story = { beforeEach: stub({ status: 404, body: { error: { code: 'page_invalid', message: 'gone' } } }) }
