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
export const Empty: StoryObj = {
  render: () => <EmptyState icon="message-circle" title="No comments yet" body="Start the conversation; mention someone with @ to notify them." action={<Button variant="primary" size="sm">Write a comment</Button>} />,
}
