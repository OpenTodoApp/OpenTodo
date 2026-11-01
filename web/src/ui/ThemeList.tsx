// The theme choice (OpenSpec change theme-engine, design D14; appearance-preferences
// "Appearance in Settings"): a WAI-ARIA radio group of theme cards with roving focus
// (arrows select, Home and End jump). Each card names the theme, previews it with a
// strip of its canvas, surface, text, accent and four label hues, and credits its
// author. Below 40 rem the cards are one horizontally scrolling row, as the accent
// tiles are. The colours are the theme's own values, drawn as they are: a preview,
// not text, so they carry no contrast duty.
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { t } from '../lib/i18n'

export interface ThemeCardData {
  id: string
  name: string
  author: string
  /** Canvas, surface, text and accent, then four label hues, as CSS colours. */
  swatches: { canvas: string; surface: string; text: string; accent: string; hues: readonly string[] }
  /** Draw the swatches inside a light or dark subtree (for swatches given as the stylesheet's own tokens). */
  scheme?: 'light' | 'dark'
  /** A short mark after the author ("Low contrast · 2", theme-editor D8). */
  badge?: string
}

export interface ThemeListProps {
  /** The visible name of the list (Light, Dark or Theme), also its accessible name. */
  label: string
  themes: readonly ThemeCardData[]
  value: string
  onChange: (id: string) => void
  /** A note under the list (a stored choice this version cannot show). */
  note?: string
  /** A menu beside each card (theme-editor D3): a button of its own, after the card in the tab order. */
  menuFor?: (theme: ThemeCardData) => ReactNode
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

/** A card's name, author and badge. */
function CardText({ theme, roomForMenu }: { theme: ThemeCardData; roomForMenu?: boolean }) {
  return (
    <span className={`min-w-0${roomForMenu ? ' pr-7' : ''}`}>
      <span className="block truncate text-meta font-medium text-default">{theme.name}</span>
      {theme.author && <span className="block truncate text-hint text-muted">{t('by {name}', { name: theme.author })}</span>}
      {theme.badge && <span className="mt-0.5 block truncate text-hint font-medium text-warning" data-theme-badge>{theme.badge}</span>}
    </span>
  )
}

export function ThemeList({ label, themes, value, onChange, note, menuFor, ...hooks }: ThemeListProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const labelId = `theme-list-${label.replace(/\W+/g, '-').toLowerCase()}`
  const move = (e: KeyboardEvent) => {
    // Keys on a card's menu button belong to it, not to the radio group.
    if ((e.target as HTMLElement).getAttribute?.('role') !== 'radio') return
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
          const card = (
            <button key={theme.id} ref={(el) => { refs.current[i] = el }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
              data-theme-card={theme.id} onClick={() => { if (!on) onChange(theme.id) }}
              className={`flex ${menuFor ? 'h-full w-full' : 'w-40 shrink-0 snap-start sm:w-auto'} flex-col gap-2 rounded-card border bg-surface p-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus ${on ? 'border-accent ring-2 ring-accent' : 'border-default'}`}>
              <ThemeSwatches swatches={theme.swatches} scheme={theme.scheme} />
              <CardText theme={theme} roomForMenu={!!menuFor} />
            </button>
          )
          if (!menuFor) return card
          return (
            <div key={theme.id} className="relative w-40 shrink-0 snap-start sm:w-auto">
              {card}
              <div className="absolute right-1 bottom-1">{menuFor(theme)}</div>
            </div>
          )
        })}
      </div>
      {note && <p className="mt-1.5 text-meta text-muted" role="note">{note}</p>}
    </div>
  )
}
