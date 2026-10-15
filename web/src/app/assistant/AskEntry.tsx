// Entry points to the assistant (OpenSpec change assistant-skills, design D4):
// an Ask action in Today's header and the Ask screen with the composer. Both only
// collect the request and open the existing panel with it. When the assistant is
// not available they show nothing. Part of the main chunk; the panel stays lazy.
import { useAssistantSkills } from '../../lib/assistantSkills'
import { openAssistant, openAssistantWith, useAssistantStatus, type AssistantStatus } from '../../lib/assistantStatus'
import type { AccountRole } from '../../lib/types'
import { Button, PageBody, PageHeader } from '../../ui'
import { Card } from '../../ui'
import { AskComposer, type AskRequest } from '../../ui'
import { Notice } from '../../ui'
import { navigate } from '../router'
import { EncryptionOffHint } from './AssistantPanel'

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

/**
 * Today's page action (ux-overhaul, in-app-assistant "Ask composer"): one "Ask"
 * button in the header when the assistant is available, nothing otherwise. The
 * composer and the example cards live on the Ask screen.
 */
export function TodayAskAction({ role }: { role?: AccountRole }) {
  const status = useAssistantStatus()
  if (askMode(status, role) !== 'composer') return null
  return (
    <Button variant="ghost" size="sm" icon="message-circle" onClick={() => openAssistant()} aria-haspopup="dialog" title="Ask the assistant (Shift+I)" data-today-ask>
      Ask
    </Button>
  )
}

const ENCRYPTED = 'The assistant can’t read end-to-end encrypted tasks. Your tasks never leave your devices unencrypted.'

/** The Ask screen (`/ask`, `g` then `k`): the composer and every skill. */
export function AskScreen({ role }: { role?: AccountRole }) {
  const status = useAssistantStatus()
  const mode = askMode(status, role)
  const skills = useAssistantSkills(mode === 'composer')
  return (
    <PageBody width="list" data-ask-screen>
      <PageHeader title="Ask OpenTodo" help="ask" />
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
      {mode === 'encrypted' && <Notice tone="info"><span data-ask-unavailable>{ENCRYPTED}</span> <EncryptionOffHint /></Notice>}
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
    </PageBody>
  )
}
