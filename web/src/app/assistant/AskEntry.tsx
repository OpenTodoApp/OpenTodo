// Entry points to the assistant (OpenSpec change assistant-skills, design D4):
// the composer at the top of Today and the Ask screen. Both only collect the
// request and open the existing panel with it. When the assistant is not
// available they stay quiet: members see nothing, the owner one dismissible
// line pointing to the settings. Part of the main chunk; the panel stays lazy.
import { useEffect, useState } from 'react'
import { useAssistantSkills } from '../../lib/assistantSkills'
import { openAssistantWith, useAssistantStatus, type AssistantStatus } from '../../lib/assistantStatus'
import { getMeta, setMeta } from '../../lib/db'
import type { AccountRole } from '../../lib/types'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { AskComposer, type AskRequest } from '../../ui/patterns/AskComposer'
import { Notice } from '../../ui/patterns/Notice'
import { navigate } from '../router'

/** Device setting: the owner dismissed the "Set up the assistant" line for good. */
export const HINT_DISMISSED_KEY = 'assistant.askHintDismissed'

export type AskMode = 'composer' | 'owner-hint' | 'encrypted' | 'none'

/** What the entry points show for this status and role. */
export function askMode(s: AssistantStatus | null, role: AccountRole | undefined): AskMode {
  if (!s || s.reason === 'demo') return 'none'
  if (s.available) return 'composer'
  if (s.reason === 'encryption_enabled') return 'encrypted'
  return role === 'owner' ? 'owner-hint' : 'none'
}

export function ask(r: AskRequest): void {
  openAssistantWith({ text: r.text, ...(r.skill ? { skill: r.skill } : {}), ...(r.pasted ? { pasted: r.pasted } : {}), send: r.send })
}

function useHintDismissed(): [boolean, () => void] {
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    let live = true
    void getMeta<boolean>(HINT_DISMISSED_KEY, false).then((v) => { if (live) setDismissed(!!v) }).catch(() => setDismissed(false))
    return () => { live = false }
  }, [])
  return [dismissed, () => { setDismissed(true); void setMeta(HINT_DISMISSED_KEY, true).catch(() => {}) }]
}

function OwnerHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="mb-3" data-ask-hint>
      <Notice tone="info" action={<Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>}>
        Set up the assistant to plan, triage and review with your own AI model.{' '}
        <a className="underline" href="/settings/ai" onClick={(e) => { e.preventDefault(); navigate({ view: 'settings', section: 'ai' }) }}>Assistant settings</a>
      </Notice>
    </div>
  )
}

/** The composer at the top of Today (and above its empty state). */
export function TodayAsk({ role }: { role?: AccountRole }) {
  const status = useAssistantStatus()
  const mode = askMode(status, role)
  const skills = useAssistantSkills(mode === 'composer')
  const [dismissed, dismiss] = useHintDismissed()
  if (mode === 'composer') {
    return <div className="mb-4" data-today-ask><AskComposer skills={skills} onAsk={ask} /></div>
  }
  if (mode === 'owner-hint' && !dismissed) return <OwnerHint onDismiss={dismiss} />
  return null
}

const ENCRYPTED = 'The assistant can’t read end-to-end encrypted tasks. Your tasks never leave your devices unencrypted.'

/** The Ask screen (`/ask`, `g` then `k`): the composer and every skill. */
export function AskScreen({ role }: { role?: AccountRole }) {
  const status = useAssistantStatus()
  const mode = askMode(status, role)
  const skills = useAssistantSkills(mode === 'composer')
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6" data-ask-screen>
      <h1 className="mb-1 text-xl font-semibold">Ask OpenTodo</h1>
      <p className="mb-4 text-meta text-muted">Ask about your tasks, or let a skill do a common job. Changes are proposed for you to review; nothing changes until you apply them.</p>
      {mode === 'composer' && (
        <>
          <AskComposer skills={skills} onAsk={ask} examples={false} autoFocus />
          <h2 className="mb-2 mt-6 text-sm font-semibold">Skills</h2>
          <ul className="grid gap-3 sm:grid-cols-2" aria-label="Skills">
            {skills.map((s) => (
              <li key={s.id}>
                <Card padding="none" className="flex h-full flex-col gap-2 p-4">
                  <h3 className="text-body font-medium text-default">{s.name}</h3>
                  <p className="flex-1 text-meta text-muted">{s.description}</p>
                  <p className="text-meta text-faint">For example: “{s.example}”</p>
                  <div><Button variant="secondary" size="sm" onClick={() => ask({ text: '', skill: s.id, send: false })}>Use this skill</Button></div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
      {mode === 'encrypted' && <Notice tone="info"><span data-ask-unavailable>{ENCRYPTED}</span></Notice>}
      {(mode === 'owner-hint' || mode === 'none') && (
        <Notice tone="info">
          <span data-ask-unavailable>
            {status?.reason === 'demo' ? 'The assistant is not available on the demo instance.' : 'The assistant is not turned on on this server.'}
            {mode === 'owner-hint' && (
              <> <a className="underline" href="/settings/ai" onClick={(e) => { e.preventDefault(); navigate({ view: 'settings', section: 'ai' }) }}>Set it up in the assistant settings.</a></>
            )}
          </span>
        </Notice>
      )}
    </div>
  )
}
