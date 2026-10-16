import type { Meta, StoryObj } from '@storybook/react-vite'
import { LabelChip, NeutralChip, ToneText, type Tone } from './Chips'

// The metadata language (OpenSpec change ux-overhaul, task-list-presentation
// "Metadata language"): three styles only, in the metadata size with tabular
// figures. A date or deadline is ToneText, a label is LabelChip, a count or a
// name is NeutralChip.
const meta: Meta = { title: 'UI/Chips' }
export default meta

const TONES: Tone[] = ['muted', 'faint', 'accent', 'danger', 'warning', 'success', 'violet', 'indigo']

export const Tones: StoryObj = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {TONES.map((tone) => <ToneText key={tone} tone={tone}>{tone === 'danger' ? 'Yesterday' : tone === 'accent' ? 'Today · evening · repeats' : 'Tomorrow 15:00'}</ToneText>)}
      <ToneText tone="danger" icon="hourglass" label="Deadline Friday 17 October">Fri 17 Oct</ToneText>
    </div>
  ),
}

export const Chips: StoryObj = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <NeutralChip icon="clock">30m</NeutralChip>
      <NeutralChip icon="list" label="2 of 5 subtasks done">2/5</NeutralChip>
      <NeutralChip icon="message-circle">3</NeutralChip>
      <NeutralChip icon="paperclip">1</NeutralChip>
      <NeutralChip dot="var(--ot-hue-blue-solid)">Website launch</NeutralChip>
      <LabelChip name="errand" color="var(--ot-hue-green-solid)" />
      <LabelChip name="call" color="var(--ot-hue-violet-solid)" onRemove={() => {}} />
    </div>
  ),
}
