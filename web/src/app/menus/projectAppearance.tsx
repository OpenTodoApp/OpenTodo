import { HUES, IconPicker, hueFor } from '../../ui'
import { hueName } from '../../lib/colourNames'
import { t } from '../../lib/i18n'
import { updateProject } from '../../lib/ops'
import type { Project } from '../../lib/types'
import { act } from '../actionError'
import type { ActionItem } from './ActionMenu'
import { iconPickerSpec } from './stylePickers'

export async function renameProject(project: Project, value: string) {
  const name = value.trim()
  if (name && name !== project.name) await updateProject(project.id, { name })
}

export function projectRenameItem(rename: () => unknown): ActionItem {
  return { kind: 'action', id: 'rename', label: t('Rename'), icon: 'pencil', onSelect: rename }
}

export function ProjectIconPicker({ icon, color, onPick, onClose }: {
  icon: string | null | undefined
  color?: string
  onPick: (icon: string | null) => void
  onClose: () => void
}) {
  return <IconPicker value={icon} color={color} onClose={onClose}
    noneMark={<span className="block size-2.5 rounded-full bg-faint" style={{ backgroundColor: color }} />} onPick={onPick} />
}

export function projectIconItem(project: Project): ActionItem {
  const pick = (icon: string | null) => act(updateProject(project.id, { icon }))
  return { kind: 'step', id: 'icon', label: t('Icon'), icon: 'image', step: {
    title: t('Icon'),
    render: (done, back) => <ProjectIconPicker icon={project.icon} color={project.color} onClose={back}
      onPick={(icon) => { pick(icon); done() }} />,
    palette: iconPickerSpec(project.icon, pick),
  } }
}

/** The project header's swatches, also used in the sidebar menus and forms. */
export function ColourSwatches({ color, onPick, onDefault, menu = false }: {
  color?: string
  onPick: (color: string) => void
  onDefault?: () => void
  menu?: boolean
}) {
  const current = color ? hueFor(color) : undefined
  return (
    <div role="group" aria-label={t('Colour')} className="flex flex-wrap gap-1 px-1.5 py-1.5">
      {onDefault && <button type="button" aria-label={t('Automatic')} aria-pressed={!color} onClick={onDefault}
        className="touch-target inline-flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <span className={`block size-5 rounded-full border border-dashed border-strong${!color ? ' ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`} />
      </button>}
      {HUES.map((h) => (
        <button key={h.name} type="button" role={menu ? 'menuitemradio' : undefined}
          aria-checked={menu ? h.name === current : undefined} aria-pressed={menu ? undefined : h.name === current}
          aria-label={t('Colour {name}', { name: hueName(h.name) })} data-menu-label={menu ? `Colour ${h.name}` : undefined}
          className="touch-target inline-flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus"
          onClick={() => onPick(h.hex)}>
          <span data-hue={h.name} className={`block size-5 rounded-full bg-hue-solid ${h.name === current ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`} />
        </button>
      ))}
    </div>
  )
}

export function setProjectColour(project: Project, color: string) {
  act(updateProject(project.id, { color }))
}

export function projectColourItem(project: Project): ActionItem {
  return { kind: 'step', id: 'colour', label: t('Colour'), icon: 'palette', step: {
    title: t('Colour'),
    render: (done) => <ColourSwatches color={project.color} onPick={(color) => { setProjectColour(project, color); done() }} />,
  } }
}
