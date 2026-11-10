// Done for today (OpenSpec change moments-and-onboarding, design D6; weekly-review
// "Done for today"): after the close writes, the Close the day screen shows one calm
// state in place of its steps: the day-done drawing, "Day closed, 18:42", the
// day's figures, tomorrow's first thing (close-the-day-redesign D4), the line for
// tomorrow, "Back to Today" (focused) and "Reopen the day". No streak, score or comparison. Device state only: nothing is written to
// show it, and a reload shows the ordinary first step. It appears with a crossfade
// (an opacity transition, which reduced motion keeps) and never moves.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { t } from '../../lib/i18n'
import type { Carried } from '../../lib/closeDay'
import { Button, Illustration } from '../../ui'

export interface DayDoneFigures {
  /** The close's time, already formatted. */
  time: string
  planned: number
  done: number
  carried: Carried
  /** Tasks still in Today when the day was closed. */
  kept: number
  note: string
  /** The title of tomorrow's first thing, when one was chosen. */
  first?: string
}

/** The figures line ("5 done, 3 moved to tomorrow, 1 kept"), or "Nothing was planned today". */
export function figuresLine(f: Pick<DayDoneFigures, 'planned' | 'done' | 'carried' | 'kept'>): string {
  if (f.planned === 0 && f.done === 0) return t('Nothing was planned today')
  const parts = [t('{n} done', { n: f.done })]
  if (f.carried.tomorrow) parts.push(t('{n} moved to tomorrow', { n: f.carried.tomorrow }))
  if (f.carried.day) parts.push(t('{n} moved to a later day', { n: f.carried.day }))
  if (f.carried.someday) parts.push(t('{n} moved to Someday', { n: f.carried.someday }))
  if (f.kept) parts.push(t('{n} kept', { n: f.kept }))
  return parts.join(', ')
}

export function DoneForToday({ figures, onBack, onReopen }: { figures: DayDoneFigures; onBack: () => void; onReopen?: () => void }) {
  const back = useRef<HTMLButtonElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    back.current?.focus()
    const frame = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    onBack()
  }
  return (
    <section aria-labelledby="day-done-title" onKeyDown={onKeyDown} data-day-done
      className={`flex flex-col items-center gap-3 px-4 py-10 text-center transition-opacity duration-(--duration-ui) ${shown ? 'opacity-100' : 'opacity-0'}`}>
      <Illustration name="day-done" />
      <h2 id="day-done-title" className="text-h2 font-semibold text-strong">{t('Day closed, {time}', { time: figures.time })}</h2>
      <p className="text-body text-muted" data-day-done-figures>{figuresLine(figures)}</p>
      {figures.first && (
        <p className="max-w-sm text-body text-default" data-day-done-first>
          {t.rich('Tomorrow starts with <b>{title}</b>', { title: figures.first, b: (s) => <strong className="user-text font-semibold text-strong">{s}</strong> })}
        </p>
      )}
      {figures.note && <blockquote className="max-w-sm text-body text-default" data-day-done-note>“{figures.note}”</blockquote>}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button ref={back} variant="primary" onClick={onBack} data-day-done-back>{t('Back to Today')}</Button>
        {onReopen && <Button variant="secondary" icon="rotate-ccw" onClick={onReopen} data-reopen-day>{t('Reopen the day')}</Button>}
      </div>
    </section>
  )
}
