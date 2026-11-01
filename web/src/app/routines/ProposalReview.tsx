// A routine's proposal under review (OpenSpec change routines-ai-step, design
// D3): a sheet with one row per item (a tick, what it changes from old to
// new, "Written by AI" on text the AI wrote), all ticked; Apply writes the
// ticked items on the server (which re-checks each against the current data)
// with one Undo, Dismiss discards the proposal. Enter applies, Esc closes.
// Apply and Dismiss need a connection. Loaded with the routines chunk.
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { api } from '../../lib/api'
import { formatInstant } from '../../lib/dates'
import { messageOf } from '../../lib/errorText'
import { t } from '../../lib/i18n'
import { useOnline } from '../../lib/online'
import { appliedText, describeItem, type ProposalNames } from '../../lib/rules/proposal'
import type { RoutineProposal } from '../../lib/types'
import { Badge, Button, Dialog, Notice, Skeleton } from '../../ui'
import { showBulkToast, updateBulkToast } from '../bulk/toastStore'
import { useRoutineNames } from './data'

/** The review's view: the proposal's items with ticks, Apply and Dismiss (stories and tests render it directly). */
export function ProposalView({ proposal, names, online, busy, error, onApply, onDismiss }: {
  proposal: RoutineProposal; names: ProposalNames; online: boolean; busy: boolean; error: string
  onApply: (keys: string[]) => void; onDismiss: () => void
}) {
  const items = useMemo(() => (proposal.list ?? []).map((it) => describeItem(it, names)), [proposal, names])
  const [off, setOff] = useState<Set<string>>(new Set())
  const ticked = items.filter((i) => !off.has(i.key)).map((i) => i.key)
  const toggle = (key: string, on: boolean) => setOff((s) => { const n = new Set(s); if (on) n.delete(key); else n.add(key); return n })
  const apply = () => { if (online && !busy && ticked.length) onApply(ticked) }
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'BUTTON') { e.preventDefault(); apply() }
  }
  if (proposal.state !== 'waiting' || !proposal.list) {
    return <Notice tone="info">{proposal.encrypted && proposal.state === 'waiting' ? t('This proposal is encrypted: open it on one of your devices that runs your routines.') : t('This proposal was already applied, dismissed or expired.')}</Notice>
  }
  return (
    <div className="space-y-3" onKeyDown={keys} data-proposal-review>
      <p className="text-meta text-muted">
        {t('{checked} of {count} selected · nothing changes until you apply · waits until {when}', { checked: ticked.length, count: items.length, when: formatInstant(proposal.expires_at, 'datetime') })}
      </p>
      <ul className="max-h-[60vh] divide-y divide-soft overflow-y-auto rounded-card border border-default" aria-label={t('Proposed changes')}>
        {items.map((it) => (
          <li key={it.key} data-proposal-item={it.key}>
            <label className="flex items-start gap-2 px-3 py-2 text-body hover:bg-hover">
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-(--ot-accent)" checked={!off.has(it.key)} onChange={(e) => toggle(it.key, e.target.checked)}
                aria-label={it.text + (it.ai ? ` (${t('Written by AI')})` : '')} />
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className={`user-text block ${off.has(it.key) ? 'text-muted' : 'text-default'}`}>{it.text}</span>
                {it.changes.map((c) => (
                  <span key={c.field} className="user-text block text-meta text-muted">{t('{field}: {from} → {to}', { field: c.field, from: c.from, to: c.to })}</span>
                ))}
              </span>
              {it.ai && <Badge hue="blue">{t('Written by AI')}</Badge>}
            </label>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-meta text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon="check" onClick={apply} busy={busy} disabled={!online || !ticked.length} data-proposal-apply>
          {t('{n, plural, one {Apply # change} other {Apply # changes}}', { n: ticked.length })}
        </Button>
        <Button variant="secondary" onClick={onDismiss} disabled={!online || busy} data-proposal-dismiss>{t('Dismiss')}</Button>
        {!online && <span className="text-meta text-muted">{t('Needs a connection')}</span>}
      </div>
    </div>
  )
}

/** The names of this device's data a proposal is described with. */
export function useProposalNames(): ProposalNames {
  const n = useRoutineNames()
  return useMemo(() => {
    const labels = new Map(n.labels.map((l) => [l.id, l.name]))
    const sections = new Map(n.sections.map((s) => [s.id, s.name]))
    return { title: n.title, projectName: n.projectName, labelName: (id) => labels.get(id) ?? '', sectionName: (id) => sections.get(id) ?? '' }
  }, [n])
}

/** Opens a proposal by id, or the proposal of a run (as the Inbox card and a run's detail do). */
export function ProposalReview({ proposalId, ruleName, onClose, onDone }: { proposalId: string; ruleName: string; onClose: () => void; onDone?: () => void }) {
  const online = useOnline()
  const names = useProposalNames()
  const [proposal, setProposal] = useState<RoutineProposal | null>(null)
  const [failed, setFailed] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!online) return
    let live = true
    api.routineProposal(proposalId).then((p) => { if (live) setProposal(p) }, (e: unknown) => { if (live) setFailed(messageOf(e)) })
    return () => { live = false }
  }, [proposalId, online])
  const apply = (keys: string[]) => {
    setBusy(true)
    api.applyRoutineProposal(proposalId, keys).then((r) => {
      onDone?.()
      onClose()
      showBulkToast(`${ruleName}: ${appliedText(r)}`, null, { second: { label: t('Undo'), run: () => {
        api.undoRoutineRun(r.rule_id, r.run_id).then(
          (u) => updateBulkToast({ result: t('{restored} restored, {kept} kept because they changed after the run', { restored: u.restored, kept: u.kept }) }),
          (err: unknown) => updateBulkToast({ result: messageOf(err) }))
      } } })
    }, (e: unknown) => setFailed(messageOf(e))).finally(() => setBusy(false))
  }
  const dismiss = () => {
    setBusy(true)
    api.dismissRoutineProposal(proposalId).then(() => { onDone?.(); onClose(); showBulkToast(t('{name}: proposal dismissed, nothing was changed', { name: ruleName }), null) },
      (e: unknown) => setFailed(messageOf(e))).finally(() => setBusy(false))
  }
  return (
    <Dialog title={t('Review: {name}', { name: ruleName })} onClose={onClose} onEscape={onClose} size="lg" testId="proposal-review">
      {!proposal && !online && <Notice tone="info">{t('Reviewing a proposal needs a connection.')}</Notice>}
      {!proposal && online && !failed && <Skeleton shape="line" count={3} label={t('Loading the proposal')} />}
      {!proposal && failed && <Notice tone="danger">{failed}</Notice>}
      {proposal && <ProposalView proposal={proposal} names={names} online={online} busy={busy} error={failed} onApply={apply} onDismiss={dismiss} />}
    </Dialog>
  )
}
