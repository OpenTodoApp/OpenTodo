import type { Meta, StoryObj } from '@storybook/react-vite'
import { Section } from './tokens'

const SCALE = [
  ['text-display', 'display · 28/34 · −0.02em', 'Wednesday 21 October'],
  ['text-h1', 'h1 · 24/32 · −0.015em', 'Today'],
  ['text-h2', 'h2 · 20/28 · −0.01em', 'Upcoming this week'],
  ['text-h3', 'h3 · 17/24', 'Home renovation'],
  ['text-body', 'body · 15/22', 'Call the plumber about the kitchen sink before Friday.'],
  ['text-meta', 'meta · 13/18', 'Due tomorrow · #home · 2 comments'],
  ['text-hint', 'hint · 11/14', 'Ctrl + Enter'],
] as const

function Type() {
  return (
    <Section title="Type scale (Inter, weights 400 / 500 / 600; headings 600)">
      <ul className="space-y-4">
        {SCALE.map(([cls, label, sample]) => (
          <li key={cls} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-baseline">
            <span className="font-mono text-meta text-muted">{label}</span>
            <span className={`${cls} text-default`}>{sample}</span>
          </li>
        ))}
      </ul>
      <p className="text-body">
        <span className="font-normal">Regular 400</span> · <span className="font-medium">Medium 500</span> · <span className="font-semibold">Semibold 600</span> · <em>synthesised italic</em> · <span className="tabular-nums">0123456789</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-2" data-optical-size>
        <div>
          <p className="font-mono text-meta text-muted">Optical size auto (the Display cut at 28 px)</p>
          <p className="text-display text-default">Quiet desk 09:30</p>
        </div>
        <div>
          <p className="font-mono text-meta text-muted">Optical size fixed at 14 (the Text cut)</p>
          <p className="text-display text-default" style={{ fontVariationSettings: '"opsz" 14' }}>Quiet desk 09:30</p>
        </div>
      </div>
    </Section>
  )
}

const meta: Meta<typeof Type> = { title: 'Foundations/Type', component: Type }
export default meta
export const Default: StoryObj<typeof Type> = {}
