// The colour field (OpenSpec change theme-editor, design D5; theme-editor "Edit the
// seeds"): a swatch button that opens a picker with the accent swatches, a hex
// field and three OKLCH sliders (Lightness 0–100 %, Chroma 0–0.37, Hue 0–360°).
// Each slider moves by 1 with the arrow keys, by 10 with Page Up and Page Down,
// to its ends with Home and End, and is announced in words ("Lightness 62
// percent"). A colour sRGB cannot show keeps its lightness and hue with less
// chroma, and the picker says "Adjusted to a displayable colour". The value is
// written in the theme document grammar (`#rrggbb` from a swatch or the hex
// field, `oklch(L C H)` from a slider). A field may be optional: empty reads as
// "Derived" and shows the derived colour, with Reset when it is set.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Button, IconButton } from './Button'
import { Icon } from './Icon'
import { Field, Input } from './Field'
import { Popover } from './overlay'
import { ACCENT_SWATCHES } from './tokens/accentSwatches'
import { clampToGamut, colourToHex, formatOklch, MAX_CHROMA, parseOklch, type Oklch } from '../lib/theme/oklch'
import { t } from '../lib/i18n'

export interface ColourFieldProps {
  /** The visible name ("Accent"). */
  label: string
  /** The set value in the document grammar; undefined when the colour is derived. */
  value: string | undefined
  /** The colour shown while derived (the resolved value). */
  derived?: string
  /** A change: `group` names the control, so a slider's drag can be one undo step. */
  onChange: (value: string, group: string) => void
  /** Optional colours offer Reset, which makes them derived again. */
  onReset?: () => void
  description?: string
  /** A contrast warning shown under the name ("2 pairs below AA"). */
  warning?: string
  /** Show only the swatch button (in a token row, whose text names the colour). */
  compact?: boolean
  /** Test and script hooks. */
  [hook: `data-${string}`]: string | boolean | undefined
}

type Axis = 'L' | 'C' | 'H'
const AXES: { axis: Axis; max: number; scale: number }[] = [
  { axis: 'L', max: 100, scale: 100 },
  { axis: 'C', max: Math.round(MAX_CHROMA * 100), scale: 100 },
  { axis: 'H', max: 360, scale: 1 },
]

function axisLabel(axis: Axis): string {
  return axis === 'L' ? t('Lightness') : axis === 'C' ? t('Chroma') : t('Hue')
}

/** The slider's value in words (design D5). */
export function axisValueText(axis: Axis, n: number): string {
  if (axis === 'L') return t('Lightness {n} percent', { n })
  if (axis === 'C') return t('Chroma {n}', { n: (n / 100).toFixed(2) })
  return t('Hue {n} degrees', { n })
}

/** The next slider value for a key, or null for a key the slider leaves alone. */
export function sliderStep(key: string, n: number, max: number): number | null {
  const clamp = (x: number) => Math.min(max, Math.max(0, x))
  switch (key) {
    case 'ArrowRight': case 'ArrowUp': return clamp(n + 1)
    case 'ArrowLeft': case 'ArrowDown': return clamp(n - 1)
    case 'PageUp': return clamp(n + 10)
    case 'PageDown': return clamp(n - 10)
    case 'Home': return 0
    case 'End': return max
    default: return null
  }
}

/** A typed hex colour: `#rrggbb`, null when empty or unchanged, false when it is not a colour. */
export function parseHex(text: string, current: string | null): string | null | false {
  const s = text.trim().toLowerCase()
  if (!s || s === current) return null
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s)
  if (!m) return false
  return '#' + (m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1])
}

/** The picker's content: swatches, hex, sliders, the gamut note and Reset. */
export function ColourPicker({ label, value, derived, onChange, onReset }: Pick<ColourFieldProps, 'label' | 'value' | 'derived' | 'onChange' | 'onReset'>) {
  const shown = value ?? derived ?? '#808080' // token-lint-allow: a neutral colour to start the picker from, data not styling
  const base = parseOklch(shown) ?? { L: 0.5, C: 0, H: 0 }
  const [text, setText] = useState(colourToHex(shown) ?? '')
  const [error, setError] = useState<string | null>(null)
  const [clamped, setClamped] = useState(false)
  const id = useId()
  const hex = colourToHex(shown)

  const setAxis = (axis: Axis, n: number) => {
    const spec = AXES.find((a) => a.axis === axis)!
    const next: Oklch = { ...base, [axis]: n / spec.scale }
    const fitted = clampToGamut(next)
    setClamped(fitted.clamped)
    const v = formatOklch(fitted.colour)
    setText(colourToHex(v) ?? '')
    onChange(v, `${label}:${axis}`)
  }
  const commitHex = () => {
    const full = parseHex(text, hex)
    if (full === null) { setError(null); return }
    if (full === false) { setError(t('Enter a colour as #rrggbb or #rgb.')); return }
    setError(null)
    setClamped(false)
    setText(full)
    onChange(full, `${label}:hex`)
  }
  return (
    <div className="flex flex-col gap-3" data-colour-picker>
      <div role="group" aria-label={t('Swatches')} className="grid grid-cols-9 gap-1.5">
        {ACCENT_SWATCHES.map((s) => (
          <button key={s} type="button" aria-label={s} aria-pressed={hex === s} data-swatch={s} style={{ backgroundColor: s }}
            className={`aspect-square min-h-6 w-full rounded-control outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus ${hex === s ? 'ring-2 ring-offset-2 ring-offset-surface ring-accent' : ''}`}
            onClick={() => { setText(s); setClamped(false); setError(null); onChange(s, `${label}:swatch`) }} />
        ))}
      </div>
      <Field label={t('Hex colour')} error={error}>
        <Input value={text} placeholder="#rrggbb" spellCheck={false} autoComplete="off" autoCapitalize="off" maxLength={7} className="font-mono" data-colour-hex
          onChange={(e) => { setText(e.target.value); if (error) setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitHex() } }} onBlur={commitHex} />
      </Field>
      <div className="flex flex-col gap-2">
        {AXES.map(({ axis, max, scale }) => {
          const n = Math.round(base[axis] * scale)
          const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key !== 'PageUp' && e.key !== 'PageDown') return
            const next = sliderStep(e.key, n, max)
            if (next === null) return
            e.preventDefault()
            setAxis(axis, next)
          }
          return (
            <label key={axis} className="flex items-center gap-3 text-meta text-muted" htmlFor={`${id}-${axis}`}>
              <span className="w-20 shrink-0">{axisLabel(axis)}</span>
              <input id={`${id}-${axis}`} type="range" min={0} max={max} step={1} value={n} aria-valuetext={axisValueText(axis, n)} data-colour-axis={axis}
                className="min-w-0 flex-1 accent-(--ot-accent)" onKeyDown={onKey} onChange={(e) => setAxis(axis, Number(e.target.value))} />
              <span className="w-10 shrink-0 text-right font-mono tabular-nums text-default" aria-hidden="true">{axis === 'C' ? (n / 100).toFixed(2) : n}</span>
            </label>
          )
        })}
      </div>
      {clamped && <p className="text-meta text-muted" role="status" data-colour-clamped>{t('Adjusted to a displayable colour')}</p>}
      {onReset && value !== undefined && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" icon="rotate-ccw" onClick={onReset} data-colour-reset>{t('Reset to derived')}</Button>
        </div>
      )}
    </div>
  )
}

/**
 * A colour as one compact row (themes-layout-template): the swatch, which opens the
 * picker; the name with Derived or Set and any contrast warning under it; the hex
 * field, which writes on Enter or when focus leaves it; and Reset for an optional
 * colour that is set. Compact: the
 * swatch alone, for a token row whose text names the colour.
 */
export function ColourField({ label, value, derived, onChange, onReset, description, warning, compact = false, ...hooks }: ColourFieldProps) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const shown = value ?? derived
  const hex = colourToHex(shown) ?? ''
  const state = value === undefined ? t('Derived') : t('Set', { context: 'token' })
  const [text, setText] = useState(hex)
  const [hexError, setHexError] = useState<string | null>(null)
  // The hex field follows the colour when it changes elsewhere (the picker, Undo, Fix).
  useEffect(() => { setText(hex); setHexError(null) }, [hex])
  const commit = () => {
    const full = parseHex(text, hex)
    if (full === null) { setText(hex); return }
    if (full === false) { setHexError(t('Enter a colour as #rrggbb or #rgb.')); return }
    setText(full)
    onChange(full, `${label}:hex`)
  }
  const swatch = (
    <button ref={anchor} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
      aria-label={t('Change {name}, {value}, {state}', { name: label, value: hex, state })}
      className="h-8 w-8 shrink-0 rounded-control border border-strong outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus"
      style={{ backgroundColor: shown }} data-colour-swatch />
  )
  const popover = (
    <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={label} width="sm:w-80" className="p-3">
      <ColourPicker label={label} value={value} derived={derived} onChange={onChange} onReset={onReset ? () => { onReset(); setOpen(false) } : undefined} />
    </Popover>
  )
  if (compact) {
    return <div {...hooks} className="contents">{swatch}{popover}</div>
  }
  const note = hexError ?? warning
  return (
    <div {...hooks} className="flex min-w-0 items-center gap-2 py-1" data-colour-row>
      {swatch}
      <span className="min-w-0 flex-1">
        <span className="block text-body text-default [overflow-wrap:anywhere]">{label}</span>
        <span className="block truncate text-meta text-muted">{state}{description ? ` · ${description}` : ''}</span>
        {note && (
          <span className="flex items-start gap-1 text-meta text-danger" data-colour-warning role={hexError ? 'alert' : undefined}>
            <Icon name="circle-alert" size="xs" className="mt-0.5 shrink-0" />{note}
          </span>
        )}
      </span>
      <Input value={text} aria-label={t('{name}, hex value', { name: label })} aria-invalid={hexError ? true : undefined} placeholder="#rrggbb"
        spellCheck={false} autoComplete="off" autoCapitalize="off" maxLength={7} className="w-[5.75rem] shrink-0 font-mono" data-colour-row-hex
        onChange={(e) => { setText(e.target.value); if (hexError) setHexError(null) }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } }} onBlur={commit} />
      {onReset && value !== undefined && <IconButton icon="rotate-ccw" size="sm" label={t('Reset {name} to derived', { name: label })} onClick={onReset} data-colour-row-reset />}
      {popover}
    </div>
  )
}
