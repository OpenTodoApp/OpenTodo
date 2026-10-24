// The assistant's empty state (assistant-surface D2): the brand mark as a quiet
// watermark, a greeting with the person's first name and the question, the
// composer (on the page; the sheet keeps it at its foot) and up to three skills
// as starter cards, which can be hidden on this device.
import { useState, type ReactNode } from 'react'
import type { AssistantSkill } from '../../lib/assistantSkills'
import { t } from '../../lib/i18n'
import { BrandMark, Icon, type IconName } from '../../ui'

/** The skills offered as starters, in this order (assistant-skills "Skills as starters"). */
export const STARTER_SKILLS = ['plan-week', 'triage-inbox', 'idea-to-project'] as const
const STARTER_ICONS: Record<string, IconName> = { 'plan-week': 'calendar-days', 'triage-inbox': 'inbox', 'idea-to-project': 'lightbulb' }
const HIDE_KEY = 'opentodo.assistant.startersHidden'

/** The starter cards for the skills the server offers, in the fixed order. */
export function starterSkills(skills: AssistantSkill[]): AssistantSkill[] {
  return STARTER_SKILLS.map((id) => skills.find((s) => s.id === id)).filter((s): s is AssistantSkill => !!s)
}

/** "Good morning, Mia." by the hour on this device; without a name, "Good morning." */
export function greeting(name: string, hour = new Date().getHours()): string {
  const first = name.trim().split(/\s+/)[0] ?? ''
  if (hour >= 5 && hour < 12) return first ? t('Good morning, {name}.', { name: first }) : t('Good morning.')
  if (hour >= 12 && hour < 18) return first ? t('Good afternoon, {name}.', { name: first }) : t('Good afternoon.')
  return first ? t('Good evening, {name}.', { name: first }) : t('Good evening.')
}

function readHidden(): boolean {
  try { return localStorage.getItem(HIDE_KEY) === '1' } catch { return false }
}

export interface AssistantWelcomeProps {
  name: string
  skills: AssistantSkill[]
  onStarter: (s: AssistantSkill) => void
  /** The page puts the composer between the greeting and the starters. */
  composer?: ReactNode
  /** The page's large watermark; the sheet shows a small mark. */
  layout: 'page' | 'sheet'
}

export function AssistantWelcome({ name, skills, onStarter, composer, layout }: AssistantWelcomeProps) {
  const [hidden, setHidden] = useState(readHidden)
  const starters = starterSkills(skills)
  const hide = () => {
    setHidden(true)
    try { localStorage.setItem(HIDE_KEY, '1') } catch { /* private window: hidden for this visit */ }
  }
  const page = layout === 'page'
  return (
    <div className={page ? 'flex flex-col gap-6 pt-[8vh]' : 'flex flex-col gap-4 pt-2'} data-assistant-empty>
      <div className="relative flex flex-col items-center text-center">
        {page && <BrandMark size={32} className="pointer-events-none absolute -top-24 size-40 opacity-[0.07]" />}
        {!page && <BrandMark size={24} className="mb-2" />}
        <h2 className={`relative ${page ? 'text-display' : 'text-h2'} text-strong`}>
          <span className="block">{greeting(name)}</span>
          <span className="block text-muted">{t('What should we sort out?')}</span>
        </h2>
        <p className="relative mt-2 max-w-md text-meta text-muted">{t('Ask about your tasks or ask for changes. Changes are proposed for you to review; nothing changes until you apply them.')}</p>
      </div>
      {composer}
      {starters.length > 0 && !hidden && (
        <section aria-labelledby="assistant-starters" data-assistant-starters>
          <div className="mb-2 flex items-center">
            <h3 id="assistant-starters" className="flex-1 text-meta text-muted">{t('Start from a skill')}</h3>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm touch-target px-1" aria-label={t('Hide the skill suggestions')} onClick={hide}><Icon name="x" size="sm" /></button>
          </div>
          <ul className={`grid gap-3 ${page ? 'sm:grid-cols-3' : ''}`}>
            {starters.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => onStarter(s)} data-assistant-starter={s.id}
                  className="flex h-full w-full flex-col gap-1 rounded-card border border-default bg-surface p-4 text-left hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  <Icon name={STARTER_ICONS[s.id] ?? 'sparkles'} className="mb-3 text-muted" />
                  <span className="text-body font-medium text-default">{s.name}</span>
                  <span className="text-meta text-muted">{s.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
