import type { Meta, StoryObj } from '@storybook/react-vite'
import { ACCENTS } from '../tokens/accents'
import { PAIRS } from '../tokens/pairs'
import { ratio, Section, useTokenValues } from './tokens'

const SURFACES = ['canvas', 'surface', 'raised', 'sunken']
const NAMES = [...new Set(PAIRS.flatMap((p) => [p.fg, p.bg]).filter((n) => !n.startsWith('hue-')).concat(SURFACES))]

function Colours() {
  const { ref, values } = useTokenValues(NAMES)
  const fgs = [...new Set(PAIRS.filter((p) => !p.fg.startsWith('hue-')).map((p) => p.fg))]
  return (
    <div ref={ref} className="space-y-8">
      <Section title="Surfaces">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SURFACES.map((s) => (
            <div key={s} className="rounded-card border border-default p-4 shadow-1" style={{ background: `var(--ot-${s})` }}>
              <div className="text-body font-medium">{s}</div>
              <div className="font-mono text-meta text-muted">{values[s]}</div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Overlay scrim">
        <p className="text-meta text-muted">Dims the page behind dialogs, sheets and the phone sidebar (bg-scrim).</p>
        <div className="relative h-20 overflow-hidden rounded-card border border-default bg-surface">
          <div className="p-3 text-body">Page content</div>
          <div className="absolute inset-y-0 right-0 w-1/2 bg-scrim" aria-hidden="true" />
        </div>
      </Section>
      <Section title="Foreground tokens and their contrast">
        <p className="text-meta text-muted">Each row lists the backgrounds the token is allowed on, with the live ratio and the minimum (src/ui/tokens/pairs.ts).</p>
        <ul className="divide-y divide-(--ot-border) rounded-card border border-default bg-surface">
          {fgs.map((fg) => (
            <li key={fg} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="w-40 font-mono text-meta">{fg}</span>
              <span className="font-mono text-meta text-muted">{values[fg]}</span>
              <span className="flex flex-wrap gap-2">
                {PAIRS.filter((p) => p.fg === fg).map((p) =>
                  p.kind === 'ui' ? (
                    // Non-text tokens (3:1) are shown as a swatch, never as text.
                    <span key={p.bg} className="inline-flex items-center gap-2 rounded-chip border border-default px-2 py-1 text-meta" style={{ background: `var(--ot-${p.bg})` }}>
                      <span className="h-3 w-3 rounded-full border-2" style={{ borderColor: `var(--ot-${fg})` }} aria-hidden="true" />
                      <span className="text-default">{p.bg} {ratio(values[fg], values[p.bg])} (≥{p.min})</span>
                    </span>
                  ) : (
                    <span key={p.bg} className="rounded-chip border border-default px-2 py-1 text-meta" style={{ background: `var(--ot-${p.bg})`, color: `var(--ot-${fg})` }}>
                      {p.bg} {ratio(values[fg], values[p.bg])} (≥{p.min})
                    </span>
                  ),
                )}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

/** Every accent theme (theming D3) in light and dark, each a data-accent subtree on the real tokens. */
function Accents() {
  return (
    <div className="space-y-6">
      {(['light', 'dark'] as const).map((mode) => (
        <Section key={mode} title={mode === 'light' ? 'Accents in light' : 'Accents in dark'}>
          <div className="grid gap-3 sm:grid-cols-4" data-theme={mode}>
            {ACCENTS.map((a) => (
              <div key={a.id} data-accent={a.id} className="space-y-2 rounded-card border border-default bg-surface p-3 text-default">
                <div className="text-body font-medium">{a.label}</div>
                <button type="button" className="ui-btn ui-btn--primary ui-btn--sm">Add task</button>
                <p className="text-meta text-accent">Accent text on surface</p>
                <p className="rounded-control bg-accent-soft px-2 py-1 text-meta text-on-accent-soft">Selected item</p>
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  )
}

const meta: Meta<typeof Colours> = { title: 'Foundations/Colours', component: Colours }
export default meta
export const Default: StoryObj<typeof Colours> = {}
/** The a11y gate checks it; it has no screenshot baseline (tag no-visual). */
export const AccentThemes: StoryObj = { render: () => <Accents />, tags: ['no-visual'] }
