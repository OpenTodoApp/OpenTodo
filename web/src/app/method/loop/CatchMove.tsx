// The Catch move in place (loop-guided-dashboard D4, D5): the capture field labelled
// with where its text goes, focus kept for the next entry, the latest captures and
// the Inbox. Quick add still captures from everywhere.
import { t } from '../../../lib/i18n'
import { useAllLabels, useProjects } from '../../../lib/localData'
import { createTask } from '../../../lib/ops'
import { Button } from '../../../ui'
import { QuickAdd } from '../../QuickAdd'
import { navigate } from '../../router'
import type { MoveProps } from '../LoopHome'
import { GroupHeading, Rows } from './rows'

const LATEST = 5

export default function CatchMove({ data }: MoveProps) {
  const projects = useProjects()
  const labels = useAllLabels()
  const latest = data.latest.slice(0, LATEST)
  return (
    <div data-loop-part="catch">
      <p id="loop-catch-label" className="mb-2 px-1 text-body font-medium text-strong">{t('Catch into the Inbox')}</p>
      <div data-loop-capture>
        <QuickAdd autoFocus placeholder={t('Whatever is on your mind…')} label={t('Catch into the Inbox')} projects={projects} labels={labels}
          onAdd={async (task) => { await createTask({ ...task, project_id: task.project_id ?? null, labels: task.labels ?? [] }) }} />
      </div>
      {latest.length > 0 && (
        <section className="mt-6" aria-labelledby="loop-latest" data-loop-latest>
          <GroupHeading id="loop-latest">{t('Latest captures')}</GroupHeading>
          <Rows tasks={latest} />
        </section>
      )}
      <Button size="sm" variant="ghost" iconEnd="arrow-right" className="mt-3" onClick={() => navigate({ view: 'inbox' })}>{t('Open the Inbox')}</Button>
    </div>
  )
}
