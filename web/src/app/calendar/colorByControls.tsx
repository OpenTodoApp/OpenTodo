// Colour by, as the Calendar and the boards use it (OpenSpec change calendar-clarity,
// design D3): the device's choice read live, a `hueOf(task)` for the views, and the
// choice as menu items (the Calendar's overflow, a project board's menu).
import { useCallback, useMemo } from 'react'
import { colorBy, normalizeColorBy, saveColorBy, type ColorByMode } from '../../lib/colorBy'
import { msg, t, translatedMap } from '../../lib/i18n'
import { useLabels, useMeta, useProjects } from '../../lib/localData'
import type { Task } from '../../lib/types'
import { MenuGroup, MenuItem, type HueName } from '../../ui'
import { act } from '../actionError'

export const COLOR_BY_LABEL = translatedMap<ColorByMode>({ project: msg('Project'), label: msg('Label'), priority: msg('Priority') })

export interface ColorByState {
  mode: ColorByMode
  hueOf: (task: Pick<Task, 'project_id' | 'labels' | 'priority'>) => HueName
  setMode: (mode: ColorByMode) => void
}

/** The Colour by choice stored under `key` on this device, with the hue of a task under it. */
export function useColorBy(key: string): ColorByState {
  const mode = normalizeColorBy(useMeta<unknown>(key, null))
  const projects = useProjects()
  const labels = useLabels()
  const ctx = useMemo(() => ({ projects: new Map(projects.map((p) => [p.id, p])), labels: new Map(labels.map((l) => [l.id, l])) }), [projects, labels])
  const hueOf = useCallback((task: Pick<Task, 'project_id' | 'labels' | 'priority'>) => colorBy(task, mode, ctx), [mode, ctx])
  const setMode = useCallback((m: ColorByMode) => act(saveColorBy(key, m)), [key])
  return { mode, hueOf, setMode }
}

/** "Colour by" as three checked items of a menu. */
export function ColorByMenuItems({ mode, onChange }: { mode: ColorByMode; onChange: (mode: ColorByMode) => void }) {
  return (
    <MenuGroup label={t('Colour by')}>
      {(['project', 'label', 'priority'] as const).map((m) => (
        <MenuItem key={m} label={COLOR_BY_LABEL[m]} checked={mode === m} data-color-by={m} onSelect={() => onChange(m)} />
      ))}
    </MenuGroup>
  )
}
