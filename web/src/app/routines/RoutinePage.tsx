// The routine editor page (OpenSpec change routines-editor-page): /routines/new and
// /routines/<id> (?run=<run> opens a run in its History), from a link and on
// reload. Back returns to the Routines list with focus on the routine's row; a
// new routine's first save moves the address to its id without remounting the
// editor, so undo and focus survive (D3).
import { useEffect, useMemo, useState } from 'react'
import { t } from '../../lib/i18n'
import { PageBody, Skeleton } from '../../ui'
import { navigate, type Route } from '../router'
import { RoutineEditor, routineDraftOf } from './RoutineEditor'
import { clearHandover, historyRequested, pendingDraft, setReturnFocus } from './routineNav'
import { isKnownRule, useRule } from '../../lib/rules/store'

export function RoutinePage({ route }: { route: Extract<Route, { view: 'rules' }> }) {
  // The id the page opened with: the editor's key, which a first save does not change.
  const [opened] = useState(() => route.id ?? 'new')
  const rule = useRule(route.id)
  const [handed] = useState(() => (route.create ? pendingDraft() : null))
  const [history] = useState(() => historyRequested())
  useEffect(() => clearHandover(), [])
  const draft = useMemo(() => (handed ? routineDraftOf(handed) : undefined), [handed])

  const back = () => {
    setReturnFocus(route.id ?? null)
    navigate({ view: 'rules' })
  }
  const saved = (id: string, created: boolean) => {
    if (created) navigate({ view: 'rules', id }, { replace: true })
  }

  if (route.id && rule === undefined) {
    return <PageBody width="list"><div className="py-6"><Skeleton shape="line" count={4} label={t('Loading the routine')} /></div></PageBody>
  }
  // A rule this page did not just create and cannot find, or made with a newer version.
  if (route.id && opened !== 'new' && (rule === null || (rule && !isKnownRule(rule)))) {
    return (
      <PageBody width="list">
        <p className="py-6 text-body text-muted" data-routine-missing>
          {rule ? t('Made with a newer version') : t('This routine no longer exists.')}{' '}
          <button type="button" className="underline" onClick={() => navigate({ view: 'rules' })}>{t('Go to Routines')}</button>
        </p>
      </PageBody>
    )
  }
  return (
    <RoutineEditor key={opened} rule={rule ?? undefined} draft={draft} dropped={handed?.dropped} run={route.run} history={history}
      onBack={back} onSaved={saved} />
  )
}
