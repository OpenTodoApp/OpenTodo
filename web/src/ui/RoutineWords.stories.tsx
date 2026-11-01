import type { Meta, StoryObj } from '@storybook/react-vite'
import { DataChip, WordButton } from './RoutineWords'

const noop = () => {}

function Sentence() {
  return (
    <div className="max-w-md space-y-4 text-body text-default" data-word-group>
      <p>
        Create tasks from
        <WordButton label="Text" value="the lines" chip action="change" placeholder="choose a text" onClick={noop} />
        in
        <WordButton label="Project" value="Errands" action="change" placeholder="choose a project" onClick={noop} />
      </p>
      <p>
        Create tasks from
        <WordButton label="Text" action="change" placeholder="choose a text" onClick={noop} />
        in
        <WordButton label="Project" action="change" placeholder="choose a project" onClick={noop} />
      </p>
      <p>
        Notify me:
        <WordButton label="Text" value="the tasks" chip error action="change" placeholder="write the text" onClick={noop} />
      </p>
      <p>
        Pick
        <WordButton label="Which" value="all" action="change" placeholder="" onClick={noop} />
        of
        <WordButton label="List" value="the tasks" chip action="change" placeholder="choose which tasks" onClick={noop} />
      </p>
      <p>
        Comment on
        <WordButton label="Task" value="each task" chip action="change" placeholder="choose which tasks" onClick={noop} />:
        <WordButton label="Text" wrap action="change" placeholder="write a text" onClick={noop}
          valueText="Any news on this? Following up on each task before the end of the week."
          value={<>Any news on this? Following up on <DataChip inline>each task</DataChip> before the end of the week.</>} />
      </p>
    </div>
  )
}

function Chips() {
  return (
    <div className="flex flex-wrap gap-2">
      <DataChip>the lines</DataChip>
      <DataChip icon="repeat">each task</DataChip>
      <DataChip muted>the tasks</DataChip>
    </div>
  )
}

const meta: Meta = { title: 'UI/Routine words' }
export default meta
export const Words: StoryObj = { render: () => <Sentence /> }
export const OutputChips: StoryObj = { name: 'Output chips', render: () => <Chips /> }
