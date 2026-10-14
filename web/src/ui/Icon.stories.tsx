import type { Meta, StoryObj } from '@storybook/react-vite'
import { Icon } from './Icon'
import { ICONS, LUCIDE_VERSION, type IconName } from './icons/lucide'

function Gallery() {
  const names = Object.keys(ICONS) as IconName[]
  return (
    <div className="space-y-3">
      <p className="text-meta text-muted">
        {names.length} icons from Lucide {LUCIDE_VERSION} (ISC). Add one in web/src/ui/icons/names.json and run scripts/icons-sync.mjs.
      </p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {names.map((n) => (
          <li key={n} className="flex flex-col items-center gap-1 rounded-control border border-default bg-surface p-2 text-default">
            <Icon name={n} size="md" />
            <span className="w-full truncate text-center text-hint text-muted">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Sizes() {
  return (
    <div className="flex items-end gap-4 text-default">
      {(['xs', 'sm', 'md', 'lg'] as const).map((s) => (
        <span key={s} className="flex flex-col items-center gap-1"><Icon name="bell" size={s} /><span className="text-hint text-muted">{s}</span></span>
      ))}
      <span className="flex flex-col items-center gap-1 text-accent"><Icon name="check" size="md" label="Done" /><span className="text-hint text-muted">labelled</span></span>
    </div>
  )
}

const meta: Meta = { title: 'Foundations/Icons' }
export default meta
export const All: StoryObj = { render: () => <Gallery /> }
export const SizeScale: StoryObj = { name: 'Sizes', render: () => <Sizes /> }
