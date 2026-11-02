// The themes of Settings → Server → Branding (OpenSpec change theme-instance-default,
// design D4): the server's default light and dark theme, chosen from OpenTodo's, the
// built-in and the server's themes with their colours, and the server themes (up to
// 20): Add from file, Offer one of my themes, Remove. A server theme with contrast
// warnings shows them, and making it a default asks first, listing the pairs. Server
// state like the rest of Branding: offline it shows the last values read, read-only.
// Lazy: loaded with the Branding card, never on the first load.
import { useEffect, useState, type ChangeEvent } from 'react'
import { api, isNetworkError } from '../lib/api'
import { t } from '../lib/i18n'
import { rowCopy } from '../lib/settingsCopy'
import { messageOf } from '../lib/errorText'
import { useAction } from '../lib/useAction'
import type { Side } from '../lib/theme/choice'
import type { ContrastFailure } from '../lib/theme/check'
import { newDocument, useCustomThemeList, type LiveTheme } from '../lib/theme/custom'
import { builtinDocument } from '../lib/theme/load'
import { downloadThemeTemplate } from './themes/downloadTemplate'
import { fileErrorText, readThemeFile, THEME_FILE_SUFFIX, withoutFileKeys } from '../lib/theme/files'
import type { ThemeDocument } from '../lib/theme/format'
import { setInstanceThemes, useInstanceThemes, type InstanceThemeEntry, type InstanceThemes } from '../lib/theme/choice'
import { createResolver } from '../lib/theme/resolver'
import { Button, ConfirmDialog, Icon, LazyContrastBadge as ContrastBadge, Menu, MenuItem, ThemeList, ThemeSwatches, type ThemeCardData } from '../ui'
import { DEFAULT_THEME } from '../lib/theme/choice'
import { themeCards } from './ThemeRow'
import { docSwatches, lowContrastBadge } from './themes/YourThemes'
import { tokenName } from './themes/tokenNames'
import { useCatalogue, type CatalogueModule } from './themeCatalogue'

/** How many server themes an instance keeps (the server's MaxInstanceThemes). */
export const MAX_INSTANCE_THEMES = 20

const SIDES: Side[] = ['light', 'dark']

export interface BrandingThemesViewProps {
  value: InstanceThemes | null
  online: boolean
  busy: boolean
  error: string | null
  catalogue: CatalogueModule | null
  /** The failing pairs of each server theme, by id, once measured. */
  warnings: Record<string, readonly ContrastFailure[]>
  /** The owner's own themes, to offer one to the server. */
  own: readonly LiveTheme[]
  onDefault: (side: Side, choice: string) => void
  onAdd: (doc: ThemeDocument) => void
  onRemove: (theme: InstanceThemeEntry) => void
  /** Download a template, made from OpenTodo Light (themes-layout-template). */
  onTemplate?: () => void | Promise<void>
}

/** The card id of a stored default: OpenTodo's theme for "", the palette id, or `instance:<id>`. */
const cardOf = (side: Side, choice: string) => (choice === '' ? DEFAULT_THEME[side] : choice.startsWith('builtin:') ? choice.slice(8) : choice)
/** The stored default of a card. */
const choiceOf = (side: Side, card: string) => (card === DEFAULT_THEME[side] ? '' : card.startsWith('instance:') ? card : `builtin:${card}`)

/** The pairs below AA, as the editor names them. */
function Pairs({ failures }: { failures: readonly ContrastFailure[] }) {
  return (
    <ul className="mt-2 flex flex-col gap-1" data-branding-theme-pairs>
      {failures.map((f) => (
        <li key={`${f.fg}/${f.bg}`} className="flex flex-wrap items-center gap-2 text-meta text-default">
          {t('{fg} on {bg}', { fg: tokenName(f.fg), bg: tokenName(f.bg) })}
          <ContrastBadge ratio={f.ratio} min={f.min} />
        </li>
      ))}
    </ul>
  )
}

export function BrandingThemesView({ value, online, busy, error, catalogue, warnings, own, onDefault, onAdd, onRemove, onTemplate }: BrandingThemesViewProps) {
  const [fileError, setFileError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ side: Side; choice: string; name: string; failures: readonly ContrastFailure[] } | null>(null)
  const disabled = !online || busy || !value
  const themes = value?.themes ?? []
  const full = themes.length >= MAX_INSTANCE_THEMES
  const cards = (side: Side): ThemeCardData[] => [
    ...themeCards(side, catalogue),
    ...themes.filter((x) => x.kind === side).map((x): ThemeCardData => ({
      id: `instance:${x.id}`, name: x.doc.name, author: x.doc.author, swatches: docSwatches(x.doc), origin: t('From this server'), badge: lowContrastBadge(warnings[x.id]?.length),
    })),
  ]
  const choose = (side: Side, card: string) => {
    if (disabled) return
    const choice = choiceOf(side, card)
    const theme = themes.find((x) => `instance:${x.id}` === choice)
    const failures = theme ? warnings[theme.id] ?? [] : []
    if (theme && failures.length) setConfirm({ side, choice, name: theme.doc.name, failures })
    else onDefault(side, choice)
  }
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const r = readThemeFile(await file.text(), file.size)
    setFileError(r.ok ? null : fileErrorText(r))
    if (r.ok) onAdd(withoutFileKeys(r.doc))
  }
  return (
    <>
      <div className="py-3" id="branding-default-theme" tabIndex={-1} data-setting-row="branding-default-theme">
        <p className="text-body font-medium text-default">{rowCopy('branding', 'defaultTheme').label}</p>
        <p className="mt-0.5 mb-2 text-meta text-muted">{rowCopy('branding', 'defaultTheme').description}</p>
        <div className="flex flex-col gap-3">
          {SIDES.map((side) => (
            <ThemeList key={side} data-branding-default={side} label={side === 'light' ? t('Light') : t('Dark')} themes={cards(side)}
              value={cardOf(side, value?.default[side] ?? '')} onChange={(id) => choose(side, id)} />
          ))}
        </div>
      </div>
      {/* One row: its title, actions and list share the row's padding, so the list never touches a divider (themes-layout-template). */}
      <div className="flex flex-col gap-3 py-3 outline-none" id="branding-server-themes" tabIndex={-1} data-setting-row="branding-server-themes">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
          <div className="min-w-0">
            <p className="text-body font-medium text-default">{rowCopy('branding', 'serverThemes').label}</p>
            <p className="mt-0.5 text-meta text-muted">{rowCopy('branding', 'serverThemes').description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end" data-setting-control>
            <label className={`ui-btn ui-btn--secondary ui-btn--sm focus-within:ring-2 focus-within:ring-focus ${disabled || full ? 'pointer-events-none text-faint' : 'cursor-pointer'}`} aria-disabled={disabled || full || undefined}>
              <Icon name="upload" size="sm" />{t('Add from file')}
              <input type="file" accept={`${THEME_FILE_SUFFIX},.json,.jsonc,application/json`} className="sr-only" disabled={disabled || full} onChange={(e) => void pick(e)} data-branding-theme-file data-touch-exempt />
            </label>
            <Menu label={t('Offer one of my themes')} kind="menu" triggerClassName="ui-btn ui-btn--secondary ui-btn--sm" trigger={<>{t('Offer one of my themes')}<Icon name="chevron-down" size="sm" /></>}
              triggerProps={{ disabled: disabled || full || !own.length, 'data-branding-offer': true }}>
              {own.map((x) => <MenuItem key={x.id} icon="palette" label={x.doc.name} onSelect={() => onAdd(x.doc)} data-branding-offer-theme={x.id} />)}
            </Menu>
            {onTemplate && <Button variant="secondary" size="sm" icon="download" onClick={onTemplate} data-branding-template>{t('Download a template')}</Button>}
          </div>
        </div>
        {full && <p className="text-meta text-muted" role="note">{t('The server has {n} themes; remove one to add another.', { n: MAX_INSTANCE_THEMES })}</p>}
        {themes.length > 0 && (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label={t('Server themes')} data-branding-themes>
            {themes.map((x) => (
              <li key={x.id} className="flex flex-col gap-2 rounded-card border border-default bg-surface p-2" data-branding-theme={x.id}>
                <ThemeSwatches swatches={docSwatches(x.doc)} />
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-meta font-medium text-default">{x.doc.name}</span>
                    <span className="block truncate text-hint text-muted">{x.kind === 'light' ? t('Light') : t('Dark')} · {t('by {name}', { name: x.doc.author })}</span>
                    {!!warnings[x.id]?.length && <span className="mt-0.5 block truncate text-hint font-medium text-warning">{lowContrastBadge(warnings[x.id].length)}</span>}
                  </span>
                  <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onRemove(x)} aria-label={t('Remove {name}', { name: x.doc.name })} data-branding-theme-remove={x.id}>{t('Remove')}</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {(fileError || error) && <p className="text-meta text-danger" role="alert">{fileError ?? error}</p>}
      </div>
      {confirm && (
        <ConfirmDialog tone="default" title={t('Make {name} the default?', { name: confirm.name })}
          consequence={<>
            <p>{t('{n, plural, one {# pair of colours is} other {# pairs of colours are}} below the contrast people need to read comfortably:', { n: confirm.failures.length })}</p>
            <Pairs failures={confirm.failures} />
          </>}
          confirmLabel={t('Make it the default')}
          onConfirm={() => onDefault(confirm.side, confirm.choice)} onCancel={() => setConfirm(null)} />
      )}
    </>
  )
}

/** The failing pairs of each server theme, measured off the main thread once per document. */
function useWarnings(themes: readonly InstanceThemeEntry[]): Record<string, readonly ContrastFailure[]> {
  const [found, setFound] = useState<Record<string, { text: string; failures: readonly ContrastFailure[] }>>({})
  const key = themes.map((x) => x.id + JSON.stringify(x.doc)).join('|')
  useEffect(() => {
    if (!themes.length) return
    const resolver = createResolver()
    let live = true
    void (async () => {
      for (const th of themes) {
        const text = JSON.stringify(th.doc)
        const r = await resolver.resolve(th.doc)
        if (!live) return
        if (r) setFound((c) => (c[th.id]?.text === text ? c : { ...c, [th.id]: { text, failures: r.failures } }))
      }
    })()
    return () => { live = false; resolver.dispose() }
    // Measured again only when a document changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return Object.fromEntries(Object.entries(found).map(([id, v]) => [id, v.failures]))
}

/** Container: reads the server's themes, writes the owner's changes and keeps this device's copy current. */
export default function BrandingThemes({ online }: { online: boolean }) {
  const cached = useInstanceThemes()
  const [loaded, setLoaded] = useState(false)
  const catalogue = useCatalogue()
  const own = useCustomThemeList()
  const { busy, error, setError, run } = useAction({ describe: messageOf })
  useEffect(() => {
    if (!online) return
    api.instanceThemes().then((v) => { setInstanceThemes(v); setLoaded(true) }, (err) => { if (!isNetworkError(err)) setError(messageOf(err)) })
  }, [online, setError])
  const value = loaded || !online ? cached : null
  const warnings = useWarnings(value?.themes ?? [])
  const write = (fn: () => Promise<unknown>) => void run(async () => setInstanceThemes(await fn()))
  return (
    <BrandingThemesView value={value} online={online} busy={busy} error={error} catalogue={catalogue} warnings={warnings} own={own}
      onDefault={(side, choice) => {
        const d = { ...(value?.default ?? { light: '', dark: '' }), [side]: choice }
        write(() => api.putThemeDefault(d))
      }}
      onAdd={(doc) => write(() => api.putInstanceTheme('new', doc))}
      onRemove={(x) => write(() => api.deleteInstanceTheme(x.id))}
      onTemplate={async () => {
        const base = await builtinDocument(DEFAULT_THEME.light)
        if (base) await downloadThemeTemplate(newDocument(base, '', t('Server theme')), t('OpenTodo Light'))
      }} />
  )
}
