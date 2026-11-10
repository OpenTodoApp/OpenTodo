import type { Project } from '../lib/types'
import { CatalogueIcon, isCatalogueIcon } from '../ui'

const DOT_SIZE = { xs: 'size-2', sm: 'size-2.5', md: 'size-3' }

/** The project's configured icon, with the colour dot when the icon is unavailable. */
export function ProjectMark({ project, size = 'sm' }: { project: Pick<Project, 'color' | 'icon'>; size?: keyof typeof DOT_SIZE }) {
  const dot = <span aria-hidden="true" className={`inline-block shrink-0 rounded-full ${DOT_SIZE[size]}`} style={{ backgroundColor: project.color }} />
  if (!project.icon || !isCatalogueIcon(project.icon)) return dot
  return <span style={{ color: project.color }} className="flex shrink-0 items-center"><CatalogueIcon name={project.icon} size={size} fallback={dot} /></span>
}
