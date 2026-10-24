// The assistant's surface (OpenSpec change assistant-surface): the greeting, the
// starter skills, the tray's context chip, the composer on the shared frame and
// the empty state in the sheet.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AssistantStatus } from '../lib/assistantStatus'
import { Composer, contextName } from './assistant/AssistantPanel'
import { AssistantPanelBody, type PanelViewProps } from './assistant/AssistantPanelBody'
import { greeting, starterSkills } from './assistant/AssistantWelcome'

const noop = () => {}
const skill = (id: string, name: string) => ({ id, name, description: `${name}.`, example: name, result: 'changes' as const })
const SKILLS = [skill('break-down', 'Break this down'), skill('idea-to-project', 'Turn an idea into a project'), skill('triage-inbox', 'Triage my inbox'), skill('plan-week', 'Plan my week'), skill('weekly-review', 'Weekly review')]
const status: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'anthropic', provider_label: 'Anthropic (Claude)', model: 'm', consented: true,
  disclosure_version: 1, fields: [], allow_member_keys: false, own_key_set: false, operator_key_set: true,
}

describe('greeting (D2)', () => {
  it('greets by the hour with the first name, and without a name', () => {
    expect(greeting('Ada Lovelace', 9)).toBe('Good morning, Ada.')
    expect(greeting('Ada', 14)).toBe('Good afternoon, Ada.')
    expect(greeting('Ada', 21)).toBe('Good evening, Ada.')
    expect(greeting('Ada', 3)).toBe('Good evening, Ada.')
    expect(greeting('  ', 9)).toBe('Good morning.')
  })
})

describe('starter skills (assistant-skills "Skills as starters")', () => {
  it('offers Plan my week, Triage my inbox and Turn an idea into a project, in that order', () => {
    expect(starterSkills(SKILLS).map((s) => s.id)).toEqual(['plan-week', 'triage-inbox', 'idea-to-project'])
    expect(starterSkills([])).toEqual([])
  })
})

describe('context chip (D3)', () => {
  it('names the selection first, then the view, and nothing elsewhere', () => {
    expect(contextName('today', 0)).toBe('Today')
    expect(contextName('project', 0)).toBe('This project')
    expect(contextName('today', 2)).toBe('2 selected tasks')
    expect(contextName(undefined, 1)).toBe('1 selected task')
    expect(contextName('settings', 0)).toBeUndefined()
  })
})

describe('composer on the shared frame (D3)', () => {
  it('has the tray with Skills and the context, and the round Send button', () => {
    const html = renderToStaticMarkup(<Composer draft="x" onDraft={noop} onSend={noop} onStop={noop} streaming={false} connected disabled={false}
      skills={SKILLS} onSkill={noop} context="Today" />)
    expect(html).toContain('data-composer-frame')
    expect(html).toContain('aria-label="Skills"')
    expect(html).toContain('Context: Today')
    expect(html).toMatch(/aria-label="Send"[^>]*data-composer-send/)
  })
})

describe('empty state in the sheet (D2)', () => {
  const props: PanelViewProps = {
    status, connected: true, messages: [], streaming: null, announce: '', statusAnnounce: '', review: null, result: null, reviewBusy: false, error: null,
    draft: '', consentBusy: false, consentError: null, threads: null, onToggle: noop, onApply: noop, onDiscard: noop, onUndo: noop, onDraft: noop,
    onSend: noop, onStop: noop, onAccept: noop, onPickThread: noop, name: 'Ada', skills: SKILLS, layout: 'sheet',
  }
  it('greets and offers the starters, with no composer of its own', () => {
    const html = renderToStaticMarkup(<AssistantPanelBody {...props} />)
    expect(html).toContain('What should we sort out?')
    expect((html.match(/data-assistant-starter="/g) ?? []).length).toBe(3)
    expect(html).not.toContain('data-assistant-composer')
  })
  it('shows the conversation instead once there are messages', () => {
    const html = renderToStaticMarkup(<AssistantPanelBody {...props} messages={[{ role: 'user', text: 'Hi', at: 1 }, { role: 'assistant', text: 'Hello.', at: 2 }]} />)
    expect(html).not.toContain('data-assistant-empty')
    expect(html).toContain('aria-label="Conversation"')
    expect(html).toContain('data-brand-mark')
  })
})
