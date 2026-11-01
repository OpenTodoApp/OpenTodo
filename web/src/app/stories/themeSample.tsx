// One sample screen drawn with a built-in theme (OpenSpec change theme-catalogue,
// design D7): the core pieces of the list (task rows), the board (cards), the
// calendar (the 12 label blocks, one past) and the task panel (a raised panel with
// its text tones and buttons), with the theme's resolved tokens set on a subtree as
// the app sets them on the root. Workbench only.
import type { CSSProperties, ReactNode } from 'react'
import { deriveTheme } from '../../lib/theme/derive'
import { CSS_TOKENS, HUES as HUE_NAMES } from '../../lib/theme/tokens'
import type { ThemeDocument } from '../../lib/theme/format'
import { Button } from '../../ui'
import { HEX, label, project, task, TODAY, TOMORROW } from './fixtures'
import { TaskCard, TaskRow } from '../TaskRow'

const docs = import.meta.glob<ThemeDocument>('../../lib/theme/builtin/*.json', { eager: true, import: 'default' })
const docOf = (id: string) => Object.values(docs).find((d) => d.id === id)!

/** The theme's resolved tokens as custom properties on a subtree, the way the app sets them on the root. */
function Themed({ id, children }: { id: string; children: ReactNode }) {
  const doc = docOf(id)
  const t = deriveTheme(doc)
  const style = Object.fromEntries(CSS_TOKENS.map((n) => [`--ot-${n}`, t.tokens[n]])) as CSSProperties
  const own = id.startsWith('opentodo-')
  return <div data-theme={doc.kind} style={own ? undefined : style} className="bg-canvas p-3 text-default">{children}</div>
}

const noop = () => {}
const base = { selected: false, showProject: false, onToggle: noop, onOpen: noop }
const home = project({ id: 'p-home', name: 'Home', color: HEX.green })
const errand = label('l-errand', 'errand', HEX.orange)
const deep = label('l-deep', 'deep-work', HEX.violet)

/** The core pieces of the list, the board, the calendar and the task panel, drawn with one theme. */
export function Sample({ theme }: { theme: { id: string; name: string } }) {
  return (
    <Themed id={theme.id}>
      <div className="flex flex-col gap-3">
        <p className="text-title font-semibold text-strong">{theme.name}</p>
        <div className="flex flex-wrap items-start gap-3">
          <ul className="w-full max-w-md space-y-0.5 rounded-card border border-default bg-surface p-2 shadow-1">
            <TaskRow {...base} showProject project={home} task={task({ id: 't1', title: 'Fix the bike light', project_id: home.id, labels: [errand.id], priority: 1, due: { date: TODAY } })} labels={[errand]} />
            <TaskRow {...base} selected task={task({ id: 't2', title: 'Read the sync protocol draft', priority: 2, due: { date: TOMORROW } })} labels={[deep]} />
            <TaskRow {...base} task={task({ id: 't3', title: 'Renew passport', priority: 3, deadline: '2026-10-20' })} />
            <TaskRow {...base} task={task({ id: 't4', title: 'Water the plants', completed_at: 1 })} />
          </ul>
          <ul className="w-64 space-y-1.5 rounded-card bg-sunken p-1.5">
            <TaskCard {...base} task={task({ id: 'c1', title: 'Write the launch announcement', estimate_minutes: 120 })} labels={[deep]} />
            <TaskCard {...base} task={task({ id: 'c2', title: 'Pricing page', priority: 1, due: { date: TODAY } })} progress={{ done: 1, total: 2 }} />
          </ul>
        </div>
        <div className="grid max-w-md grid-cols-3 gap-1.5">
          {HUE_NAMES.map((h, i) => (
            <div key={h} data-hue={h} className={`ui-block px-2 py-1 text-meta ${i % 4 === 3 ? 'ui-block--past' : ''}`}>{h}</div>
          ))}
        </div>
        <div className="flex max-w-md flex-col gap-2 rounded-card border border-default bg-raised p-3">
          <p className="text-body text-strong">Task panel</p>
          <p className="text-meta text-muted">Notes, subtasks and the history of a task.</p>
          <p className="text-meta text-faint">Created yesterday</p>
          <div className="flex gap-2"><Button variant="primary">Save</Button><Button variant="secondary">Cancel</Button></div>
        </div>
      </div>
    </Themed>
  )
}

