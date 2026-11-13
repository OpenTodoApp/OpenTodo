// A "Group by: Project" header's tint (OpenSpec change project-group-tint,
// GitHub issue 1210): the project's colour, as a coloured section tints its own.
import { hueFor, type HueName } from '../ui'
import type { Project } from '../lib/types'

/** The hue of a project's group header, or none for a project without a colour. */
export function projectHue(project: Project | undefined): HueName | undefined {
  return project?.color ? hueFor(project.color) : undefined
}
