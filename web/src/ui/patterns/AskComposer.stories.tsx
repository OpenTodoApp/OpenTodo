import type { Meta, StoryObj } from '@storybook/react-vite'
import { AskComposer, type AskSkill } from './AskComposer'

const SKILLS: AskSkill[] = [
  { id: 'idea-to-project', name: 'Turn an idea into a project', description: 'Turns an idea or pasted notes into a project with phases and estimated tasks.', example: 'Plan a garden makeover in spring, budget 2000' },
  { id: 'plan-week', name: 'Plan my week', description: 'Proposes due dates and times for your open work within your working hours.', example: 'Plan my week around the Q4 launch' },
  { id: 'weekly-review', name: 'Weekly review', description: 'Walks your inbox, overdue and stale tasks and proposes what to reschedule, move or complete.', example: 'Run my weekly review' },
  { id: 'triage-inbox', name: 'Triage my inbox', description: 'Proposes a project, labels, priority and date for each task in your inbox.', example: 'Triage my inbox' },
  { id: 'break-down', name: 'Break this down', description: 'Turns one task into subtasks with estimates.', example: 'Break this task into steps' },
]

const meta: Meta = { title: 'UI/Patterns/Ask composer' }
export default meta
export const WithSkills: StoryObj = { render: () => <AskComposer skills={SKILLS} onAsk={() => {}} /> }
export const Compact: StoryObj = { render: () => <AskComposer skills={SKILLS} examples={false} onAsk={() => {}} /> }
export const Disabled: StoryObj = { render: () => <AskComposer skills={SKILLS} disabled onAsk={() => {}} placeholder="The assistant needs a connection." /> }
