import type { Project } from '../lib/types'
import { CatalogueIcon, hueFor, isCatalogueIcon } from '../ui'

const DOT_SIZE = { xs: 'size-2', sm: 'size-2.5', md: 'size-3' }

/** The project's configured icon, with the colour dot when the icon is unavailable, in the theme's shade of the project's colour. */
export function ProjectMark({ project, size = 'sm' }: { project: Pick<Project, 'color' | 'icon'>; size?: keyof typeof DOT_SIZE }) {
  const hue = project.color ? hueFor(project.color) : undefined
  const dot = <span aria-hidden="true" data-hue={hue} className={`inline-block shrink-0 rounded-full bg-hue-solid ${DOT_SIZE[size]}`} />
  if (!project.icon || !isCatalogueIcon(project.icon)) return dot
  return <span data-hue={hue} className="flex shrink-0 items-center text-hue-solid"><CatalogueIcon name={project.icon} size={size} fallback={dot} /></span>
}
