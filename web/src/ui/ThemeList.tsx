// The theme choice (OpenSpec change theme-engine, design D14; appearance-preferences
// "Appearance in Settings"): a WAI-ARIA radio group of theme cards with roving focus
// (arrows select, Home and End jump). Each card names the theme, previews it with a
// strip of its canvas, surface, text, accent and four label hues, and credits its
// author. Below 40 rem the cards are one horizontally scrolling row, as the accent
// tiles are. The colours are the theme's own values, drawn as they are: a preview,
// not text, so they carry no contrast duty.
import { useRef, type KeyboardEvent } from 'react'
import { t } from '../lib/i18n'

export interface ThemeCardData {
  id: string
  name: string
  author: string
  /** Canvas, surface, text and accent, then four label hues, as CSS colours. */
  swatches: { canvas: string; surface: string; text: string; accent: string; hues: readonly string[] }
  /** Draw the swatches inside a light or dark subtree (for swatches given as the stylesheet's own tokens). */
  scheme?: 'light' | 'dark'
}

export interface ThemeListProps {
  /** The visible name of the list (Light, Dark or Theme), also its accessible name. */
  label: string
  themes: readonly ThemeCardData[]
  value: string
  onChange: (id: string) => void
  /** A note under the list (a stored choice this version cannot show). */
  note?: string
  /** Test and script hooks. */
  [hook: `data-${string}`]: string | boolean | undefined
}

/** The strip of a theme's colours. */
export function ThemeSwatches({ swatches, scheme }: Pick<ThemeCardData, 'swatches' | 'scheme'>) {
  const cells = [swatches.canvas, swatches.surface, swatches.text, swatches.accent, ...swatches.hues.slice(0, 4)]
  return (
    <span data-theme={scheme} className="flex h-6 w-full overflow-hidden rounded-chip border border-default" aria-hidden="true">
      {cells.map((c, i) => <span key={i} className="h-full flex-1" style={{ background: c }} />)}
    </span>
  )
}

export function ThemeList({ label, themes, value, onChange, note, ...hooks }: ThemeListProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const labelId = `theme-list-${label.replace(/\W+/g, '-').toLowerCase()}`
  const move = (e: KeyboardEvent) => {
    const i = themes.findIndex((x) => x.id === value)
    const n = themes.length
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % n
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + n) % n
      : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (next < 0) return
    e.preventDefault()
    if (themes[next].id !== value) onChange(themes[next].id)
    refs.current[next]?.focus()
  }
  return (
    <div {...hooks}>
      <p id={labelId} className="mb-1.5 text-meta font-medium text-muted">{label}</p>
      <div role="radiogroup" aria-labelledby={labelId} onKeyDown={move} data-scroll-x
        className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0">
        {themes.map((theme, i) => {
          const on = theme.id === value
          return (
            <button key={theme.id} ref={(el) => { refs.current[i] = el }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
              data-theme-card={theme.id} onClick={() => { if (!on) onChange(theme.id) }}
              className={`flex w-40 shrink-0 snap-start flex-col gap-2 rounded-card border bg-surface p-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-auto ${on ? 'border-accent ring-2 ring-accent' : 'border-default'}`}>
              <ThemeSwatches swatches={theme.swatches} scheme={theme.scheme} />
              <span className="min-w-0">
                <span className="block truncate text-meta font-medium text-default">{theme.name}</span>
                {theme.author && <span className="block truncate text-hint text-muted">{t('by {name}', { name: theme.author })}</span>}
              </span>
            </button>
          )
        })}
      </div>
      {note && <p className="mt-1.5 text-meta text-muted" role="note">{note}</p>}
    </div>
  )
}
