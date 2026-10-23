import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import type { Review } from '../../lib/assistant'
import type { AssistantStatus } from '../../lib/assistantStatus'
import { Composer } from './AssistantComposer'
import { AssistantPanelBody, type PanelViewProps } from './AssistantPanelBody'

// The assistant's surface (OpenSpec change assistant-surface): the empty page with the
// composer under the greeting and the starter skills, a conversation with a proposed
// change set, and the empty side sheet. The parts are rendered without a server.
const meta: Meta = { title: 'Screens/Assistant' }
export default meta

const noop = () => {}
const skill = (id: string, name: string, description: string) => ({ id, name, description, example: name, result: 'changes' as const })
const SKILLS = [
  skill('plan-week', 'Plan my week', 'Spread open tasks over the days you have, around your calendar.'),
  skill('triage-inbox', 'Triage my inbox', 'Give each new task a project, a date, or Someday.'),
  skill('idea-to-project', 'Turn an idea into a project', 'Describe it in a sentence; get sections and first tasks.'),
]
const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'claude-sonnet-5-5', consented: true,
  disclosure_version: 1, fields: [], allow_member_keys: false, own_key_set: false, operator_key_set: true,
}
const review: Review = {
  dropped: [],
  items: [
    { change: { entity: 'task', entityId: 'a', patch: {} }, state: 'ok', checked: true, title: 'Draft the Q4 roadmap one-pager', lines: ['Due Fri 31 Oct → Tue 28 Oct'], shared: false },
    { change: { entity: 'task', entityId: 'b', patch: {} }, state: 'ok', checked: true, title: 'Measure for the extractor hood', lines: ['Due Fri 31 Oct → Mon 27 Oct'], shared: true },
    { change: { entity: 'task', entityId: 'c', patch: {} }, state: 'ok', checked: true, title: 'Pick a mirror light', lines: ['Due Fri 31 Oct → Someday'], shared: false },
    { change: { entity: 'task', entityId: 'd', patch: {} }, state: 'stale', checked: false, title: 'Water the plants', lines: ['Due Fri 31 Oct → Mon 27 Oct'], shared: false },
  ],
}
const base: PanelViewProps = {
  status, connected: true, messages: [], streaming: null, announce: '', statusAnnounce: '', review: null, result: null, reviewBusy: false, error: null,
  draft: '', consentBusy: false, consentError: null, threads: null, onToggle: noop, onApply: noop, onDiscard: noop, onUndo: noop, onDraft: noop,
  onSend: noop, onStop: noop, onAccept: noop, onPickThread: noop, name: 'Raffaele', skills: SKILLS, onStarter: noop,
}
const composer = (large: boolean, draft = '') => (
  <Composer draft={draft} onDraft={noop} onSend={noop} onStop={noop} streaming={false} connected disabled={false} skills={SKILLS} onSkill={noop} large={large}
    placeholder={large ? 'Ask about your tasks, or tell me what to plan…' : 'Reply or ask for changes…'} />
)

function Page({ children }: { children: ReactNode }) {
  return <div className="-m-4 min-h-[48rem] bg-surface px-4 py-6"><div className="mx-auto w-full max-w-[46rem]">{children}</div></div>
}

/** The Assistant page with no conversation yet. */
export const EmptyPage: StoryObj = {
  render: () => <Page><AssistantPanelBody {...base} layout="page" composer={composer(true)} /></Page>,
}

/** A conversation with a proposed change set: three of four selected, one changed since it was proposed. */
export const ProposedChanges: StoryObj = {
  render: () => (
    <Page>
      <AssistantPanelBody {...base} layout="page" review={review}
        messages={[
          { role: 'user', text: 'Friday is too full. Move whatever isn’t urgent to next week.', at: 1 },
          { role: 'assistant', text: 'Friday has 6 h planned against your 4 h day. Three tasks have no deadline before next week, so I’d move them. The roadmap draft is due Friday the 31st, so Tuesday still leaves margin.', at: 2 },
        ]} />
      <div className="mt-6">{composer(false)}</div>
    </Page>
  ),
}

/** After applying: the summary with Undo. */
export const Applied: StoryObj = {
  render: () => <Page><AssistantPanelBody {...base} layout="page" result={{ applied: 3, total: 4, undoId: 'u' }} messages={[{ role: 'user', text: 'Move whatever isn’t urgent to next week.', at: 1 }, { role: 'assistant', text: 'Done.', at: 2 }]} /></Page>,
}

/** The side sheet's empty state: the greeting and the starters, the composer at its foot. */
export const EmptySheet: StoryObj = {
  render: () => (
    <div className="-m-4 flex h-[44rem] w-full max-w-[28rem] flex-col border-l border-default bg-surface">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3"><AssistantPanelBody {...base} layout="sheet" /></div>
      <div className="border-t border-default px-3 py-2">
        <Composer draft="" onDraft={noop} onSend={noop} onStop={noop} streaming={false} connected disabled={false} skills={SKILLS} onSkill={noop} context="Today" />
      </div>
    </div>
  ),
}
