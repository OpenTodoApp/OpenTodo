// The Energy editor of the task page and the docked panel (OpenSpec change
// task-energy, design D6): Deep, Medium and Low as one choice. A tap or a click
// chooses; with the keyboard the arrows move between the levels and Enter or Space
// chooses the focused one. Clear lives in the popover's footer.
import { useRef, type KeyboardEvent } from 'react'
import { ENERGY_LEVELS, energyName, energyOf, setTaskEnergy, type Energy } from '../../lib/energy'
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'
import { act } from '../actionError'

export function EnergyChoice({ task, onChosen }: { task: Pick<Task, 'id' | 'energy'>; onChosen?: () => void }) {
  const current = energyOf(task)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  // The focused level takes the tab stop: the chosen one, else the first.
  const stop = current ? ENERGY_LEVELS.indexOf(current) : 0
  const choose = (e: Energy) => {
    act(setTaskEnergy(task.id, e))
    onChosen?.()
  }
  const onKeyDown = (ev: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    ev.preventDefault()
    refs.current[(i + step + ENERGY_LEVELS.length) % ENERGY_LEVELS.length]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={t('Energy')} className="flex gap-1.5" data-energy-choice>
      {ENERGY_LEVELS.map((e, i) => (
        <button key={e} ref={(el) => { refs.current[i] = el }} type="button" role="radio" aria-checked={current === e} tabIndex={i === stop ? 0 : -1}
          data-energy={e} onKeyDown={(ev) => onKeyDown(ev, i)} onClick={() => choose(e)}
          className={`min-h-8 min-w-16 rounded-control border px-2.5 py-1 text-meta pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${current === e ? 'border-strong bg-sunken font-semibold text-strong dark:bg-raised' : 'border-dashed border-input text-default hover:bg-sunken dark:hover:bg-raised'}`}>
          {energyName(e)}
        </button>
      ))}
    </div>
  )
}
