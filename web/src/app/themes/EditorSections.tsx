// The editor's seed, shape and type, and details sections (OpenSpec change
// theme-editor, design D4, D5, D10; themes-layout-template): four base colours and
// the optional status hues as compact rows (swatch, name, hex) in two columns when
// the controls are wide enough, each with its contrast warning beside it; every
// other token following by derivation; the corner radius as a preset or five
// values, the font (never downloaded) and the list text size, each with a visible
// label; the name's companions (kind, author, licence, notes).
import { useState, type ReactNode } from 'react'
import { t } from '../../lib/i18n'
import type { ContrastFailure } from '../../lib/theme/check'
import type { ResolvedTheme } from '../../lib/theme/derive'
import type { FontFamily, ThemeDocument } from '../../lib/theme/format'
import { DEFAULT_RADIUS, LIST_SIZES, LOCAL_FONT, RADIUS_STEPS, type RadiusStep } from '../../lib/theme/tokens'
import { Field, Input, LazyColourField as ColourField, SegmentedControl, Textarea } from '../../ui'
import { failingText } from './ContrastPanel'
import { SEEDS, STATUS_SEEDS, tokenName } from './tokenNames'

type Change = (doc: ThemeDocument, group?: string) => void

/** Colour rows two by two as soon as two rows of 12.5 rem fit beside each other (a 768 px screen with the sidebar too). */
export const TWO_COLUMNS = 'grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-x-6 gap-y-1'

export function Section({ id, title, children, note }: { id: string; title: string; children: ReactNode; note?: string }) {
  return (
    <section aria-labelledby={`theme-${id}-title`} className="flex flex-col gap-2" data-theme-section={id}>
      <div>
        <h2 id={`theme-${id}-title`} className="text-body font-semibold text-strong">{title}</h2>
        {note && <p className="mt-0.5 text-meta text-muted">{note}</p>}
      </div>
      {children}
    </section>
  )
}

/** A control with its visible label above it (a segmented control names itself only to assistive technology). */
function Labelled({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="text-body font-medium text-default" aria-hidden="true">{label}</span>
      {children}
    </div>
  )
}

/** The failing pairs a token is in, in words, or undefined. */
export function warningOf(token: string, failures: readonly ContrastFailure[] | null | undefined): string | undefined {
  const n = (failures ?? []).filter((f) => f.fg === token || f.bg === token).length
  return n ? failingText(n) : undefined
}

export function SeedsSection({ doc, resolved, failures, onChange }: { doc: ThemeDocument; resolved: ResolvedTheme | null; failures?: readonly ContrastFailure[] | null; onChange: Change }) {
  const setSeed = (name: string, value: string | undefined, group?: string) => {
    const seeds = { ...doc.seeds }
    if (value === undefined) delete seeds[name]
    else seeds[name] = value
    onChange({ ...doc, seeds }, group ? `seed:${group}` : undefined)
  }
  return (
    <>
      <Section id="seeds" title={t('Base colours')} note={t('Every other colour follows from these, unless you set it under Advanced.')}>
        <div className={TWO_COLUMNS}>
          {SEEDS.map((s) => (
            <ColourField key={s} label={tokenName(s)} value={doc.seeds[s]} derived={resolved?.tokens[s]} warning={warningOf(s, failures)} data-theme-seed={s}
              onChange={(v, g) => setSeed(s, v, g)} />
          ))}
        </div>
      </Section>
      <Section id="status" title={t('Status colours')} note={t('Optional: each one is derived until you set it.')}>
        <div className={TWO_COLUMNS}>
          {STATUS_SEEDS.map((s) => (
            <ColourField key={s} label={tokenName(s)} value={doc.seeds[s]} derived={resolved?.tokens[s]} warning={warningOf(s, failures)} data-theme-seed={s}
              onChange={(v, g) => setSeed(s, v, g)} onReset={() => setSeed(s, undefined)} />
          ))}
        </div>
      </Section>
    </>
  )
}

type RadiusPreset = 'square' | 'default' | 'round' | 'custom'
const PRESETS: Record<Exclude<RadiusPreset, 'custom'>, Record<RadiusStep, number>> = {
  square: { chip: 2, control: 2, card: 3, surface: 4, popover: 4 },
  default: DEFAULT_RADIUS,
  round: { chip: 8, control: 10, card: 12, surface: 16, popover: 20 },
}
const same = (a: Partial<Record<RadiusStep, number>>, b: Record<RadiusStep, number>) => RADIUS_STEPS.every((s) => (a[s] ?? DEFAULT_RADIUS[s]) === b[s])

/** The preset a document's radius is, or custom. */
export function radiusPreset(doc: ThemeDocument): RadiusPreset {
  const r = doc.shape?.radius ?? {}
  return (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).find((p) => same(r, PRESETS[p])) ?? 'custom'
}

type FontChoice = 'inter' | 'system' | 'serif' | 'mono' | 'local'
const fontChoice = (f: FontFamily | undefined): FontChoice => (!f ? 'inter' : typeof f === 'string' ? f : 'local')

export function ShapeTypeSection({ doc, onChange }: { doc: ThemeDocument; onChange: Change }) {
  const [custom, setCustom] = useState(radiusPreset(doc) === 'custom')
  const preset = custom ? 'custom' : radiusPreset(doc)
  const radius = { ...DEFAULT_RADIUS, ...(doc.shape?.radius ?? {}) }
  const setRadius = (r: Record<RadiusStep, number> | null, group?: string) => {
    const { shape: _s, ...rest } = doc
    void _s
    onChange(r && !same(r, DEFAULT_RADIUS) ? { ...rest, shape: { radius: r } } : rest, group)
  }
  const [wantLocal, setWantLocal] = useState(fontChoice(doc.type?.family) === 'local')
  const font: FontChoice = wantLocal ? 'local' : fontChoice(doc.type?.family)
  const [local, setLocal] = useState(typeof doc.type?.family === 'object' ? doc.type.family.local : '')
  const setType = (family: FontFamily | undefined, list = doc.type?.list) => {
    const { type: _t, ...rest } = doc
    void _t
    const type = { ...(family && family !== 'inter' ? { family } : {}), ...(list && list !== 13 ? { list } : {}) }
    onChange(Object.keys(type).length ? { ...rest, type } : rest)
  }
  const localOk = LOCAL_FONT.test(local)
  return (
    <Section id="shape" title={t('Shape and type')}>
      <div className="grid gap-3 @min-[30rem]/theme-controls:grid-cols-2">
        <Labelled label={t('Corners')} className="@min-[30rem]/theme-controls:col-span-2">
          <SegmentedControl label={t('Corners')} value={preset} data-theme-radius className="w-full"
            options={[{ id: 'square', label: t('Square') }, { id: 'default', label: t('Default') }, { id: 'round', label: t('Round') }, { id: 'custom', label: t('Custom') }]}
            onChange={(p) => { setCustom(p === 'custom'); if (p !== 'custom') setRadius(PRESETS[p]) }} />
        </Labelled>
        {preset === 'custom' && (
          <div className="grid grid-cols-5 gap-2 @min-[30rem]/theme-controls:col-span-2">
            {RADIUS_STEPS.map((s) => (
              <Field key={s} label={RADIUS_LABEL[s]()}>
                <Input type="number" min={0} max={20} step={1} value={radius[s]} inputMode="numeric" data-theme-radius-step={s}
                  onChange={(e) => { const n = Math.round(Number(e.target.value)); if (Number.isFinite(n) && n >= 0 && n <= 20) setRadius({ ...radius, [s]: n }, `radius:${s}`) }} />
              </Field>
            ))}
          </div>
        )}
        <Labelled label={t('Font')} className="@min-[30rem]/theme-controls:col-span-2">
          <SegmentedControl label={t('Font')} value={font} wrap data-theme-font className="w-full"
            options={[{ id: 'inter', label: t('OpenTodo Inter') }, { id: 'system', label: t('System') }, { id: 'serif', label: t('Serif') }, { id: 'mono', label: t('Monospace') }, { id: 'local', label: t('Installed font') }]}
            onChange={(f) => { setWantLocal(f === 'local'); if (f !== 'local') setType(f); else if (localOk) setType({ local }) }} />
        </Labelled>
        {font === 'local' && (
          <div className="flex flex-col gap-2 @min-[30rem]/theme-controls:col-span-2">
            <Field label={t('Installed font name')} error={local && !localOk ? t('Use letters, digits, spaces and hyphens only.') : undefined}
              description={t('Used only on devices that have this font installed; others show the system font. It is never downloaded.')}>
              <Input value={local} maxLength={64} spellCheck={false} data-theme-local-font
                onChange={(e) => { setLocal(e.target.value); if (LOCAL_FONT.test(e.target.value)) setType({ local: e.target.value }) }} />
            </Field>
            {localOk && <p className="text-body text-default" style={{ fontFamily: `"${local}", system-ui` }} data-theme-font-sample>{t('The quick brown fox jumps over the lazy dog')}</p>}
          </div>
        )}
        <Labelled label={t('List text size')}>
          <SegmentedControl label={t('List text size')} value={String(doc.type?.list ?? 13)} className="w-full" data-theme-list-size
            options={LIST_SIZES.map((n) => ({ id: String(n), label: `${n} px` }))}
            onChange={(v) => setType(doc.type?.family, Number(v) as 13 | 14 | 15)} />
        </Labelled>
      </div>
    </Section>
  )
}

const RADIUS_LABEL: Record<RadiusStep, () => string> = {
  chip: () => t('Chips'), control: () => t('Controls'), card: () => t('Cards'), surface: () => t('Panels'), popover: () => t('Popovers'),
}

export function DetailsSection({ doc, encrypted, onChange }: { doc: ThemeDocument; encrypted: boolean; onChange: Change }) {
  const set = (k: 'author' | 'licence', v: string) => onChange({ ...doc, [k]: v }, `detail:${k}`)
  const setNote = (v: string) => {
    const notes = { ...(doc.notes ?? {}) }
    if (v) notes.text = v
    else delete notes.text
    const { notes: _n, ...rest } = doc
    void _n
    onChange(Object.keys(notes).length ? { ...rest, notes } : rest, 'detail:notes')
  }
  return (
    <Section id="details" title={t('About this theme')}>
      {encrypted && <p className="text-meta text-muted" role="note" data-theme-encryption-note>{t('Themes are not encrypted. Don\'t put private information in a theme\'s name or notes.')}</p>}
      <div className="grid gap-3 @min-[30rem]/theme-controls:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] @min-[30rem]/theme-controls:items-end">
        <Labelled label={t('Kind')}>
          <SegmentedControl label={t('Kind')} value={doc.kind} className="w-full @min-[30rem]/theme-controls:w-40" options={[{ id: 'light', label: t('Light') }, { id: 'dark', label: t('Dark') }]}
            onChange={(k) => onChange({ ...doc, kind: k })} data-theme-kind />
        </Labelled>
        <Field label={t('Author')}><Input value={doc.author} maxLength={120} onChange={(e) => set('author', e.target.value)} /></Field>
        <Field label={t('Licence')}><Input value={doc.licence} maxLength={120} onChange={(e) => set('licence', e.target.value)} /></Field>
      </div>
      <Field label={t('Notes')}><Textarea value={doc.notes?.text ?? ''} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} /></Field>
    </Section>
  )
}
