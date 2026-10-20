import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../Button'
import { EmptyState } from './EmptyState'
import { Timeline, type TimelineItem } from './Timeline'

const ada = { id: 'u-ada', name: 'Ada Lovelace' }
const bob = { id: 'u-bob', name: 'Bob Okafor' }
const MIXED: TimelineItem[] = [
  { kind: 'event', id: 'e1', icon: 'calendar-days', actor: 'You', text: 'changed the due date from Tue to Fri', time: '1h' },
  {
    kind: 'thread', id: 't1', author: ada, time: '2h', body: 'First draft is in the notes. Can you check the hiring plan numbers?',
    actions: <><Button size="sm" variant="ghost">Reply</Button><Button size="sm" variant="ghost">Edit</Button></>,
    replies: [{ kind: 'thread', id: 't2', author: bob, time: '1h', body: 'Looks good. I would move Goals before wins and misses.' }],
  },
  { kind: 'event', id: 'e2', icon: 'tag', actor: 'Bob Okafor', text: 'added the label errands', time: '30m' },
  { kind: 'thread', id: 't3', author: bob, time: 'now', body: 'Reference: https://example.com/a/very/long/path/that/does/not/fit/on/a/phone/screen/segmentsegmentsegment' },
]

const meta: Meta = { title: 'UI/Patterns/Timeline and empty state' }
export default meta
export const Mixed: StoryObj = { render: () => <Timeline label="Comments and activity" items={MIXED} /> }
export const Single: StoryObj = { render: () => <Timeline label="Comments" items={[MIXED[1]]} /> }
/** The settings-only legacy slots (icon, body, control), kept until the settings-copy change. */
export const Empty: StoryObj = {
  render: () => <EmptyState icon="message-circle" title="No comments yet" body="Start the conversation; mention someone with @ to notify them." control={<Button variant="primary" size="sm">Write a comment</Button>} />,
}

// The empty-view contract (lean-chrome D7, task-list-presentation "Empty views"):
// one sentence, one primary action, at most one secondary link; the key in the tooltip.
const noop = () => {}
export const EmptyStateAction: StoryObj = {
  name: 'EmptyState/Action',
  render: () => <EmptyState title="Your Inbox is empty." action={{ label: 'Add a task', onClick: noop, shortcut: 'q' }} />,
}
export const EmptyStateWithLink: StoryObj = {
  name: 'EmptyState/With link',
  render: () => <EmptyState title="Nothing due today." action={{ label: 'Add a task', onClick: noop, shortcut: 'q' }} secondary={{ label: 'Open Upcoming', onClick: noop }} />,
}
export const EmptyStatePhone: StoryObj = {
  name: 'EmptyState/Phone',
  render: () => (
    <div className="mx-auto max-w-[375px] border border-default">
      <EmptyState title="Nothing is ready to start today." action={{ label: 'Add a task', onClick: noop, shortcut: 'q' }} secondary={{ label: '3 waiting for other tasks', onClick: noop }} />
    </div>
  ),
}
