// Upcoming's projected occurrences of a day, after its tasks and outside its count
// (OpenSpec change series-occurrences, design D4), with the note on the last day.
// Loaded with the switch, not on the first load.
import { t } from '../../lib/i18n'
import type { ListGroup } from '../../lib/listGroups'
import type { Project } from '../../lib/types'
import { hueFor } from '../../ui'
import { ProjectedItem } from '../calendar/projections'

export default function ProjectedGroupRows({ g, projects }: { g: ListGroup; projects: readonly Project[] }) {
  return (
    <>
      {g.projected && g.projected.length > 0 && (
        <ul className="mt-0.5 space-y-0.5" data-group-projected={g.key} aria-label={t('Repeating occurrences')}>
          {g.projected.map((p) => <li key={p.id}><ProjectedItem p={p} hue={hueFor(projects.find((pr) => pr.id === p.project_id)?.color)} variant="large" /></li>)}
        </ul>
      )}
      {g.projectedNote && <p className="mt-1 px-1 text-meta text-faint" data-projected-note>{g.projectedNote}</p>}
    </>
  )
}
