// The Away dialog (OpenSpec change away-periods, design D2, D4): the period, what
// it covers, whether reminders pause, and what it will do before Set away. Loaded
// on first use from Today's menu or the palette.
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { awayDays, MAX_AWAY_DAYS } from '../../lib/away'
import type { AwayInput } from '../../lib/awayActions'
import { addDaysISO } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { useLabels, useProjects } from '../../lib/localData'
import { Combobox, Dialog, Field, LabelChip, SegmentedControl, Switch } from '../../ui'
import { showUndoToast } from '../bulk/toastStore'
import { useToday } from '../useViews'

type Pick = { id: string; name: string; color: string; kind: 'project' | 'label' }

const actions = () => import('../../lib/awayActions')

/** What a period between `from` and `to` is wrong about, or null. */
export function rangeError(from: string, to: string): string | null {
  if (!from || !to) return t('Choose the first and the last day')
  if (from > to) return t('The last day comes before the first')
  if (awayDays(from, to) > MAX_AWAY_DAYS) return t('At most 90 days')
  return null
}

export default function AwayDialog({ onDone }: { onDone: () => void }) {
  const today = useToday()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(() => addDaysISO(today, 6))
  const [only, setOnly] = useState<'all' | 'only'>('all')
  const [picked, setPicked] = useState<string[]>([])
  const [quiet, setQuiet] = useState(true)
  const [preview, setPreview] = useState<{ occurrences: number; series: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const projects = useProjects()
  const labels = useLabels()
  const source = useMemo<Pick[]>(() => [
    ...projects.filter((p) => !p.deleted_at).map((p) => ({ id: `project:${p.id}`, name: p.name, color: p.color, kind: 'project' as const })),
    ...labels.filter((l) => !l.deleted_at).map((l) => ({ id: `label:${l.id}`, name: l.name, color: l.color, kind: 'label' as const })),
  ], [projects, labels])
  const error = rangeError(from, to)
  const input = useMemo<AwayInput>(() => ({
    from, to, quiet,
    scope: only === 'all' ? { all: true } : {
      all: false,
      projects: picked.filter((k) => k.startsWith('project:')).map((k) => k.slice(8)),
      labels: picked.filter((k) => k.startsWith('label:')).map((k) => k.slice(6)),
    },
  }), [from, to, quiet, only, picked])

  useEffect(() => {
    if (error) return setPreview(null)
    let live = true
    void actions().then((m) => m.planAwayLocal(input, { today })).then((p) => { if (live) setPreview({ occurrences: p.occurrences, series: p.series }) })
    return () => { live = false }
  }, [input, error, today])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (error || busy) return
    setBusy(true)
    try {
      const r = await (await actions()).setAway(input, { today })
      if (r.entry) showUndoToast(r.label, r.entry.id)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const chosen = source.filter((s) => picked.includes(s.id))
  const toggle = (s: Pick) => setPicked((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]))
  const line = error ?? (preview === null ? '' : preview.occurrences === 0 ? t('Nothing repeats in these days')
    : t('Skips {occurrences, plural, one {# occurrence} other {# occurrences}} of {series, plural, one {# repeating task} other {# repeating tasks}}', preview))

  return (
    <Dialog title={t('Away')} onClose={onDone} testId="away">
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <div className="flex gap-2">
          <Field label={t('From')} className="flex-1">
            <input type="date" className="ui-input" value={from} onChange={(e) => setFrom(e.target.value)} data-away-from />
          </Field>
          <Field label={t('To')} className="flex-1">
            <input type="date" className="ui-input" value={to} onChange={(e) => setTo(e.target.value)} data-away-to />
          </Field>
        </div>
        <div>
          <SegmentedControl label={t('Repeating tasks')} value={only} onChange={setOnly} data-away-scope
            options={[{ id: 'all', label: t('Everything') }, { id: 'only', label: t('Only') }]} />
        </div>
        {only === 'only' && (
          <div className="space-y-2">
            <Combobox label={t('Projects and labels')} placeholder={t('Search projects and labels')} source={source} multiple selected={picked}
              getKey={(s) => s.id} getLabel={(s) => s.name} getSecondary={(s) => (s.kind === 'project' ? t('Project') : t('Label'))}
              rankContext="away:scope" onPick={toggle} />
            {chosen.length > 0 && (
              <div className="flex flex-wrap gap-1" data-away-chosen>
                {chosen.map((s) => <LabelChip key={s.id} name={s.name} color={s.color} onRemove={() => toggle(s)} />)}
              </div>
            )}
          </div>
        )}
        <div><Switch checked={quiet} onChange={setQuiet} label={t('Pause reminders')} /></div>
        <p role="status" className={`text-meta ${error ? 'text-danger' : 'text-muted'}`} data-away-preview>{line}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--md text-body" onClick={onDone}>{t('Cancel')}</button>
          <button type="submit" className="ui-btn ui-btn--primary ui-btn--md text-body" disabled={!!error || busy || (only === 'only' && picked.length === 0)} data-away-set>{t('Set away')}</button>
        </div>
      </form>
    </Dialog>
  )
}
