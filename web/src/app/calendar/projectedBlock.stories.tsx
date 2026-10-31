import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import type { Projection } from '../../lib/occurrences'
import { ProjectedItem } from './projections'

// A projected occurrence of a repeating task (OpenSpec change series-occurrences,
// design D3): the faint fill of its project hue, the dashed leading edge and the
// repeat icon, as a Day/Week block, a lane or Month row and a phone agenda row,
// beside an ordinary and a past block for comparison. The workbench captures it in
// light and dark; HighContrast shows the dashed outline the high-contrast
// presentation keeps.
const meta: Meta = { title: 'Screens/Projected block' }
export default meta

const study: Projection = { id: 'proj:s:2026-10-15', seriesId: 's', date: '2026-10-15', occurrence: '2026-10-15', time: '18:00', title: 'Study', estimate_minutes: 60, priority: 4, position: 1, project_id: null }
const report: Projection = { ...study, id: 'proj:r:2026-10-19', seriesId: 'r', date: '2026-10-19', occurrence: '2026-10-19', time: undefined, title: 'Weekly report', estimate_minutes: 45 }

function Variants() {
  return (
    <div className="grid w-fit grid-cols-[auto_14rem] items-start gap-x-6 gap-y-3 bg-surface p-3 text-meta">
      <span className="text-muted">Block (Day, Week)</span>
      <div className="relative h-16">
        <ProjectedItem p={study} hue="blue" variant="block" style={{ top: 0, height: 60, left: 2, width: 'calc(100% - 4px)' }} />
      </div>
      <span className="text-muted">Ordinary and past</span>
      <div className="space-y-1">
        <div className="ui-block px-1.5 py-0.5" data-hue="blue">Study</div>
        <div className="ui-block ui-block--past px-1.5 py-0.5" data-hue="blue">Study</div>
      </div>
      <span className="text-muted">Lane chip, Month row</span>
      <div className="space-y-1">
        <ProjectedItem p={report} hue="green" variant="row" />
        <ProjectedItem p={study} hue="violet" variant="row" />
      </div>
      <span className="text-muted">Phone agenda, Upcoming</span>
      <ProjectedItem p={study} hue="blue" variant="large" />
    </div>
  )
}

function HighContrastVariants() {
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-contrast', 'high')
    return () => root.removeAttribute('data-contrast')
  }, [])
  return <Variants />
}

export const Variant: StoryObj = { render: () => <Variants /> }
/** The high-contrast presentation on the root; a11y-checked, no screenshot baseline (tag no-visual). */
export const HighContrast: StoryObj = { render: () => <HighContrastVariants />, tags: ['no-visual'] }
