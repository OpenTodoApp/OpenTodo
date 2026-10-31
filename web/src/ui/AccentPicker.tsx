// The custom accent picker (OpenSpec change accent-colour, design D5;
// appearance-preferences "Custom accent colour"): curated swatches as a radio group
// (arrow keys move, Enter or Space picks), a hex field (rgb or rrggbb, with or
// without #, committed with Enter or on leaving the field, an inline error for
// anything else), a live preview of the result in light and dark, the note when
// the colour was adjusted for contrast or turned away from the error red, and Done.
// No native colour input. The host places it in a Popover (a bottom sheet below
// 640 px). Loaded lazily with its derivation (accentPickerLazy.ts): nothing here is
// part of the first load.
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from './Button'
import { Field, Input } from './Field'
import { Icon } from './Icon'
import { ACCENT_SWATCHES } from './tokens/accentSwatches'
import { deriveAccent, normalizeHex, type DerivedAccent } from '../lib/accentDerive'
import { customAccentStyle } from '../lib/appearance'
import { hueName } from '../lib/colourNames'
import { t } from '../lib/i18n'

const COLS = 9
/** The hue of each swatch column, for its accessible name. */
const SWATCH_HUES = ['pink', 'orange', 'yellow', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet']

export interface AccentPickerProps {
  /** The stored custom colour (`#rrggbb`), or none yet. */
  value?: string
  /** A swatch or a committed hex: write the custom accent (theme and colour in one batch). */
  onPick: (hex: string) => void
  /** Done: close the picker. */
  onDone: () => void
}

/** The accessible name of a swatch: its hue, deep for the second row, and its code. */
function swatchName(i: number, hex: string): string {
  const hue = hueName(SWATCH_HUES[i % COLS])
  return `${i < COLS ? hue : t('deep {colour}', { colour: hue })} ${hex}`
}

/** One mode of the preview: a primary button, a link, a selected row and a soft chip in the derived accent. */
function Preview({ mode, accent }: { mode: 'light' | 'dark'; accent: DerivedAccent | null }) {
  return (
    <div data-theme={mode} data-accent={accent ? 'custom' : undefined} style={accent ? customAccentStyle(accent) : undefined}
      className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-control border border-default bg-surface p-2 text-default" data-accent-preview={mode}>
      <span className="text-hint font-medium text-muted">{mode === 'light' ? t('Light') : t('Dark')}</span>
      <span aria-hidden="true" className="flex flex-col gap-1.5">
        <span className="w-fit rounded-control bg-accent px-2 py-0.5 text-meta font-medium text-on-accent">{t('Done')}</span>
        <span className="text-meta text-accent underline">{t('Link')}</span>
        <span className="rounded-control bg-accent-soft px-1.5 py-0.5 text-meta text-default">{t('Selected')}</span>
        <span className="w-fit rounded-chip bg-accent-soft px-1.5 text-hint text-on-accent-soft">{t('Custom')}</span>
      </span>
    </div>
  )
}

export function AccentPicker({ value, onPick, onDone }: AccentPickerProps) {
  const [text, setText] = useState(value ?? '')
  const [error, setError] = useState<string | null>(null)
  // What the preview shows: the typed colour while it is valid, else the stored one.
  const draft = normalizeHex(text) ?? value ?? null
  const derived = useMemo(() => (draft ? deriveAccent(draft) : null), [draft])
  const selected = value && ACCENT_SWATCHES.includes(value) ? value : null
  const [focusIndex, setFocusIndex] = useState(() => Math.max(0, selected ? ACCENT_SWATCHES.indexOf(selected) : 0))
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const pick = (hex: string) => {
    setText(hex)
    setError(null)
    if (hex !== value) onPick(hex)
  }

  const commit = () => {
    if (text.trim() === '' || text === value) { setError(null); return }
    const hex = normalizeHex(text)
    if (!hex) { setError(t('Enter a colour as #rrggbb or #rgb.')); return }
    pick(hex)
  }

  const onSwatchKey = (e: KeyboardEvent, i: number) => {
    const n = ACCENT_SWATCHES.length
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % n
    else if (e.key === 'ArrowLeft') next = (i - 1 + n) % n
    else if (e.key === 'ArrowDown') next = (i + COLS) % n
    else if (e.key === 'ArrowUp') next = (i - COLS + n) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    if (next < 0) return
    e.preventDefault()
    setFocusIndex(next)
    refs.current[next]?.focus()
  }

  const adjusted = derived && (derived.adjusted.lightness || derived.adjusted.hue)
  return (
    <div className="flex flex-col gap-3" data-accent-picker>
      <div role="radiogroup" aria-label={t('Colours')} className="grid grid-cols-9 gap-1.5">
        {ACCENT_SWATCHES.map((hex, i) => {
          const on = hex === selected
          return (
            <button key={hex} ref={(el) => { refs.current[i] = el }} type="button" role="radio" aria-checked={on} aria-label={swatchName(i, hex)}
              tabIndex={i === focusIndex ? 0 : -1} data-swatch={hex} style={{ backgroundColor: hex }}
              className={`aspect-square min-h-6 w-full rounded-control outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus ${on ? 'ring-2 ring-offset-2 ring-offset-surface ring-accent' : ''}`}
              onClick={() => { setFocusIndex(i); pick(hex) }}
              onKeyDown={(e) => onSwatchKey(e, i)} />
          )
        })}
      </div>
      <Field label={t('Hex colour')} error={error}>
        <Input value={text} placeholder="#rrggbb" spellCheck={false} autoComplete="off" autoCapitalize="off" inputMode="text" maxLength={9}
          className="font-mono" data-accent-hex
          onChange={(e) => { setText(e.target.value); if (error) setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
          onBlur={commit} />
      </Field>
      <div className="flex gap-2">
        <Preview mode="light" accent={derived} />
        <Preview mode="dark" accent={derived} />
      </div>
      {adjusted && draft && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted" data-accent-adjusted>
          <span>{[derived.adjusted.lightness && t('Adjusted for contrast'), derived.adjusted.hue && t('Turned away from the colour for errors')].filter(Boolean).join(' · ')}</span>
          <span className="sr-only">{t('Picked {picked}, shown as {used}', { picked: draft, used: derived.light })}</span>
          <span aria-hidden="true" className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded-chip border border-default" style={{ backgroundColor: draft }} />
            <span className="font-mono">{draft}</span>
            <Icon name="arrow-right" size="sm" />
            <span className="h-3 w-3 rounded-chip border border-default" style={{ backgroundColor: derived.light }} />
            <span className="font-mono">{derived.light}</span>
          </span>
        </p>
      )}
      <div className="flex justify-end">
        <Button variant="primary" onClick={onDone}>{t('Done')}</Button>
      </div>
    </div>
  )
}
