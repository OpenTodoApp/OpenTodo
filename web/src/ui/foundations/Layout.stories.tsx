import type { Meta, StoryObj } from '@storybook/react-vite'
import { Section } from './tokens'

// Motion has its own page: Foundations → Motion (motion-v2).

function Spacing() {
  return (
    <Section title="Spacing (4 px base; rhythm 8 / 12 / 16 / 24 / 32)">
      <ul className="space-y-2">
        {[2, 3, 4, 6, 8].map((n) => (
          <li key={n} className="flex items-center gap-3">
            <span className="w-24 font-mono text-meta text-muted">{n * 4}px · {n}</span>
            <span className="h-4 rounded-chip bg-accent" style={{ width: `${n * 4}px` }} />
          </li>
        ))}
        <li className="flex items-center gap-3">
          <span className="w-24 font-mono text-meta text-muted">row</span>
          <span className="flex h-(--size-row) flex-1 items-center rounded-control border border-default bg-surface px-3 text-body">44 px row (48 px on touch)</span>
        </li>
      </ul>
    </Section>
  )
}

function Radius() {
  return (
    <Section title="Radius">
      <div className="flex flex-wrap gap-4">
        {[['rounded-chip', 'chip 6'], ['rounded-control', 'control 10'], ['rounded-card', 'card 14'], ['rounded-full', 'full']].map(([cls, label]) => (
          <div key={cls} className={`flex h-20 w-28 items-center justify-center border border-input bg-surface text-meta ${cls}`}>{label}</div>
        ))}
      </div>
    </Section>
  )
}

function Elevation() {
  return (
    <Section title="Elevation">
      <div className="flex flex-wrap gap-6">
        {[['border border-default', '0 · border'], ['shadow-1 dark:border dark:border-default', '1 · cards'], ['shadow-2 bg-raised dark:border dark:border-default', '2 · popovers'], ['shadow-3 bg-raised dark:border dark:border-default', '3 · dialogs']].map(([cls, label]) => (
          <div key={label} className={`flex h-24 w-36 items-center justify-center rounded-card bg-surface text-meta ${cls}`}>{label}</div>
        ))}
      </div>
    </Section>
  )
}

const meta: Meta = { title: 'Foundations/Layout and motion' }
export default meta
export const SpacingScale: StoryObj = { name: 'Spacing', render: () => <Spacing /> }
export const RadiusScale: StoryObj = { name: 'Radius', render: () => <Radius /> }
export const ElevationScale: StoryObj = { name: 'Elevation', render: () => <Elevation /> }
