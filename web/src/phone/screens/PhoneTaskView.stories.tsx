import type { Meta, StoryObj } from '@storybook/react-vite'
import { PhoneFrame, StoryScroller } from '../stories/frame'
import { details, more, noop, schedule, unset } from '../stories/sample'
import { Icon } from '../../ui'
import { FACT_CHIP } from '../components/FactRow'
import { PhoneTaskView, type PhoneTaskViewProps } from './PhoneTaskView'

// The task page on a phone, drawn with fixed data (phone-ui-trial "Phone task page").
const meta: Meta = { title: 'Phone/Design/Task page' }
export default meta

const attach = <button type="button" className={FACT_CHIP}><Icon name="paperclip" size="sm" className="text-muted" /><span>Attach</span></button>

function Rest() {
  return (
    <section>
      <h2 className="px-1 pb-1.5 text-meta font-semibold text-muted">Subtasks <span className="font-normal">1 of 3</span></h2>
      <ul className="overflow-hidden rounded-card bg-surface shadow-1 [&>li+li]:border-t [&>li+li]:border-soft">
        {[['Find the old passport', true], ['Take a photo', false], ['Fill in the form', false]].map(([title, done]) => (
          <li key={String(title)} className="flex min-h-12 items-center gap-3 px-3 text-prose">
            <span aria-hidden className={`h-5 w-5 rounded-full border-2 ${done ? 'border-transparent bg-faint' : 'border-input'}`} />
            <span className={done ? 'text-muted line-through' : 'text-strong'}>{title}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Task(props: Partial<PhoneTaskViewProps>) {
  return (
    <PhoneFrame>
      <StoryScroller>
        <PhoneTaskView title={<h1 className="text-h1 text-strong">Renew passport</h1>} done={false} priority={2} backLabel="Today"
          schedule={schedule} details={details} unset={unset} menu={more}
          notes={<p className="text-muted">The old one expires in March. Bring two photos and the form from the town hall.</p>}
          rest={<Rest />} chipEnd={attach} onBack={noop} onToggle={noop} onFact={noop} {...props} />
      </StoryScroller>
    </PhoneFrame>
  )
}

export const Full: StoryObj = { name: 'A full task', render: () => <Task /> }
export const Bare: StoryObj = {
  name: 'A bare task',
  render: () => (
    <Task backLabel="Inbox" notes={<p className="text-muted">Add notes…</p>} rest={null}
      schedule={[{ id: 'due', label: 'Do', icon: 'sun', value: 'Set a date', tone: 'text-muted' }]}
      details={[{ id: 'project', label: 'Project', icon: 'folder', value: 'Inbox' }]}
      unset={[{ id: 'deadline', label: 'Deadline', icon: 'hourglass' }, { id: 'reminders', label: 'Reminder', icon: 'alarm-clock' }, { id: 'priority', label: 'Priority', icon: 'flag' }, ...unset, { id: 'labels', label: 'Labels', icon: 'tag' }]} />
  ),
}
export const Done: StoryObj = {
  name: 'Completed, read only',
  render: () => <Task done readOnly title={<h1 className="text-h1 text-muted line-through">Renew passport</h1>} schedule={schedule.map((f) => ({ ...f, fixed: true }))} details={details.map((f) => ({ ...f, fixed: true }))} />,
}
