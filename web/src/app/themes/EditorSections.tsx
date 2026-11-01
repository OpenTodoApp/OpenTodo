// The editor's seed, shape and type, and details sections (OpenSpec change
// theme-editor, design D4, D5, D10): four seed colours and the optional status
// hues, every other token following by derivation; the corner radius as a preset
// or five values; the font (never downloaded) and the list text size; the name's
// companions (author, licence, notes).
import { useState } from 'react'
import { t } from '../../lib/i18n'
import type { ResolvedTheme } from '../../lib/theme/derive'
import type { FontFamily, ThemeDocument } from '../../lib/theme/format'
import { DEFAULT_RADIUS, LIST_SIZES, LOCAL_FONT, RADIUS_STEPS, type RadiusStep } from '../../lib/theme/tokens'
import { Field, Input, LazyColourField as ColourField, SegmentedControl, Textarea } from '../../ui'
import { SEEDS, STATUS_SEEDS, tokenName } from './tokenNames'

type Change = (doc: ThemeDocument, group?: string) => void

function Section({ id, title, children, note }: { id: string; title: string; children: React.ReactNode; note?: string }) {
  return (
    <section aria-labelledby={`theme-${id}-title`} className="flex flex-col gap-1" data-theme-section={id}>
      <h2 id={`theme-${id}-title`} className="text-body font-semibold text-strong">{title}</h2>
      {note && <p className="text-meta text-muted">{note}</p>}
      {children}
    </section>
  )
}

export function SeedsSection({ doc, resolved, onChange }: { doc: ThemeDocument; resolved: ResolvedTheme | null; onChange: Change }) {
  const setSeed = (name: string, value: string | undefined, group?: string) => {
    const seeds = { ...doc.seeds }
    if (value === undefined) delete seeds[name]
    else seeds[name] = value
    onChange({ ...doc, seeds }, group ? `seed:${group}` : undefined)
  }
  return (
    <Section id="seeds" title={t('Base colours')} note={t('Every other colour follows from these, unless you set it under Advanced.')}>
      {SEEDS.map((s) => (
        <ColourField key={s} label={tokenName(s)} value={doc.seeds[s]} derived={resolved?.tokens[s]} data-theme-seed={s}
          onChange={(v, g) => setSeed(s, v, g)} />
      ))}
      <h3 className="mt-2 text-meta font-semibold text-muted">{t('Status colours')}</h3>
      {STATUS_SEEDS.map((s) => (
        <ColourField key={s} label={tokenName(s)} value={doc.seeds[s]} derived={resolved?.tokens[s]} data-theme-seed={s}
          onChange={(v, g) => setSeed(s, v, g)} onReset={() => setSeed(s, undefined)} />
      ))}
    </Section>
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
      <SegmentedControl label={t('Corners')} value={preset} data-theme-radius
        options={[{ id: 'square', label: t('Square') }, { id: 'default', label: t('Default') }, { id: 'round', label: t('Round') }, { id: 'custom', label: t('Custom') }]}
        onChange={(p) => { setCustom(p === 'custom'); if (p !== 'custom') setRadius(PRESETS[p]) }} />
      {preset === 'custom' && (
        <div className="grid grid-cols-5 gap-2">
          {RADIUS_STEPS.map((s) => (
            <Field key={s} label={RADIUS_LABEL[s]()}>
              <Input type="number" min={0} max={20} step={1} value={radius[s]} inputMode="numeric" data-theme-radius-step={s}
                onChange={(e) => { const n = Math.round(Number(e.target.value)); if (Number.isFinite(n) && n >= 0 && n <= 20) setRadius({ ...radius, [s]: n }, `radius:${s}`) }} />
            </Field>
          ))}
        </div>
      )}
      <SegmentedControl label={t('Font')} value={font} wrap data-theme-font className="mt-2"
        options={[{ id: 'inter', label: t('OpenTodo Inter') }, { id: 'system', label: t('System') }, { id: 'serif', label: t('Serif') }, { id: 'mono', label: t('Monospace') }, { id: 'local', label: t('Installed font') }]}
        onChange={(f) => { setWantLocal(f === 'local'); if (f !== 'local') setType(f); else if (localOk) setType({ local }) }} />
      {font === 'local' && (
        <Field label={t('Installed font name')} error={local && !localOk ? t('Use letters, digits, spaces and hyphens only.') : undefined}
          description={t('Used only on devices that have this font installed; others show the system font. It is never downloaded.')}>
          <Input value={local} maxLength={64} spellCheck={false} data-theme-local-font
            onChange={(e) => { setLocal(e.target.value); if (LOCAL_FONT.test(e.target.value)) setType({ local: e.target.value }) }} />
        </Field>
      )}
      {font === 'local' && localOk && <p className="text-body text-default" style={{ fontFamily: `"${local}", system-ui` }} data-theme-font-sample>{t('The quick brown fox jumps over the lazy dog')}</p>}
      <SegmentedControl label={t('List text size')} value={String(doc.type?.list ?? 13)} className="mt-2" data-theme-list-size
        options={LIST_SIZES.map((n) => ({ id: String(n), label: `${n} px` }))}
        onChange={(v) => setType(doc.type?.family, Number(v) as 13 | 14 | 15)} />
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
      <SegmentedControl label={t('Kind')} value={doc.kind} options={[{ id: 'light', label: t('Light') }, { id: 'dark', label: t('Dark') }]}
        onChange={(k) => onChange({ ...doc, kind: k })} data-theme-kind />
      {encrypted && <p className="text-meta text-muted" role="note" data-theme-encryption-note>{t('Themes are not encrypted. Don\'t put private information in a theme\'s name or notes.')}</p>}
      <Field label={t('Author')}><Input value={doc.author} maxLength={120} onChange={(e) => set('author', e.target.value)} /></Field>
      <Field label={t('Licence')}><Input value={doc.licence} maxLength={120} onChange={(e) => set('licence', e.target.value)} /></Field>
      <Field label={t('Notes')}><Textarea value={doc.notes?.text ?? ''} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
    </Section>
  )
}
