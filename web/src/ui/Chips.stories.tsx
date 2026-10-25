import type { Meta, StoryObj } from '@storybook/react-vite'
import { LabelChip, LabelChips, NeutralChip, ToneText, type Tone } from './Chips'

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

// Calm rows' labels (calm-rows D6): dots, the first name and "+n"; the group takes
// focus and shows every name in a tooltip only when names are hidden.
const ERRAND = { id: 'l1', name: 'errand', color: 'var(--ot-hue-green-solid)' }
const CALL = { id: 'l2', name: 'call', color: 'var(--ot-hue-violet-solid)' }
const HOME = { id: 'l3', name: 'home', color: 'var(--ot-hue-blue-solid)' }
const DEEP = { id: 'l4', name: 'deep work', color: 'var(--ot-hue-orange-solid)' }

export const LabelChipsVariants: StoryObj = {
  render: () => (
    <div className="flex flex-col items-start gap-2">
      <LabelChips labels={[ERRAND]} />
      <LabelChips labels={[ERRAND, CALL]} />
      <LabelChips labels={[ERRAND, CALL, HOME, DEEP]} />
      <LabelChips labels={[ERRAND, CALL, HOME]} omit="l1" />
      {/* One line with as many chips as fit, then "+n" (row-layouts D2). */}
      <div className="w-40"><LabelChips labels={[ERRAND, CALL, HOME, DEEP]} fit /></div>
      <div className="w-80"><LabelChips labels={[ERRAND, CALL, HOME, DEEP]} fit /></div>
    </div>
  ),
}
