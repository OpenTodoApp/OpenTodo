// "Your themes" in Settings › Appearance (OpenSpec change theme-editor, design D2,
// D3, D11, D12; themes-layout-template): a card per custom theme (its colours, a
// "Low contrast · n" mark, a menu to use, edit, duplicate, export or delete it),
// then one row of actions: New theme, Import (a theme file or a VS Code theme, by
// choosing a file or dropping one here) and Download a template. At 20 themes
// adding is unavailable and says why. Files are read on the device; a VS Code
// theme shows its import report first. Lazy, with the Theme row.
import { Suspense, useEffect, useRef, useState, type DragEvent } from 'react'
import { t } from '../../lib/i18n'
import type { Side } from '../../lib/theme/choice'
import type { ContrastFailure } from '../../lib/theme/check'
import { canAddTheme, limitMessage, MAX_CUSTOM_THEMES, newThemeId, type LiveTheme } from '../../lib/theme/custom'
import { fileErrorText, importedDraft, MAX_THEME_FILE_BYTES, readThemeFile } from '../../lib/theme/files'
import type { ThemeDocument } from '../../lib/theme/format'
import { createResolver } from '../../lib/theme/resolver'
import { Button, Icon, LearnMore, Menu, MenuItem, MenuSeparator, Notice, ThemeSwatches } from '../../ui'
import { ImportReport } from './ImportReport'
import { openDraft, openTheme } from './openEditor'
import type { VsCodeReport } from '../../lib/theme/vscode'

export interface ThemeCardActions {
  onUse: (theme: LiveTheme, side: Side) => void
  onDuplicate: (theme: LiveTheme) => void
  onExport: (doc: ThemeDocument) => void
  onDelete: (theme: LiveTheme) => void
}

/** The swatches of a theme document: its seeds, and its label hues where it sets them or they are resolved. */
export function docSwatches(doc: ThemeDocument, resolved?: Record<string, string>) {
  const hue = (h: string) => doc.tokens?.[`hue-${h}`] ?? resolved?.[`hue-${h}-solid`] ?? doc.seeds.accent
  return { canvas: doc.seeds.canvas, surface: doc.seeds.surface, text: doc.seeds.text, accent: doc.seeds.accent, hues: ['green', 'blue', 'violet', 'orange'].map(hue) }
}

/** "Low contrast · 2" (themes "Themes saved with contrast warnings"). */
export const lowContrastBadge = (n: number | undefined) => (n ? t('Low contrast · {n}', { n }) : undefined)

/** The failing pairs of each custom theme and its resolved colours, measured off the main thread and kept per document. */
export function useThemeMeasures(themes: readonly LiveTheme[]): { low: Record<string, number>; resolved: Record<string, Record<string, string>> } {
  const [measures, setMeasures] = useState<Record<string, { text: string; n: number; tokens: Record<string, string> }>>({})
  const key = themes.map((x) => x.id + JSON.stringify(x.doc)).join('|')
  useEffect(() => {
    const resolver = createResolver()
    let live = true
    void (async () => {
      for (const th of themes) {
        const text = JSON.stringify(th.doc)
        if (measures[th.id]?.text === text) continue
        const r = await resolver.resolve(th.doc)
        if (!live) return
        if (r) setMeasures((c) => ({ ...c, [th.id]: { text, n: r.failures.length, tokens: r.resolved.tokens } }))
      }
    })()
    return () => { live = false; resolver.dispose() }
    // `measures` is a cache: measuring again only when a document changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const entries = Object.entries(measures)
  return { low: Object.fromEntries(entries.map(([id, v]) => [id, v.n])), resolved: Object.fromEntries(entries.map(([id, v]) => [id, v.tokens])) }
}

/** One custom theme's card menu (design D3). */
export function CustomThemeMenu({ theme, actions, room }: { theme: LiveTheme; actions: ThemeCardActions; room: boolean }) {
  const side = theme.doc.kind
  return (
    <Menu label={t('Actions for {name}', { name: theme.doc.name })} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm px-1.5"
      triggerProps={{ 'data-theme-menu': theme.id }}>
      <MenuItem icon={side === 'light' ? 'sun' : 'moon'} label={side === 'light' ? t('Use for light') : t('Use for dark')} onSelect={() => actions.onUse(theme, side)} />
      <MenuItem icon="pencil" label={t('Edit')} onSelect={() => openTheme(theme.id)} data-theme-edit={theme.id} />
      <MenuItem icon="copy" label={t('Duplicate')} disabled={!room} description={room ? undefined : limitMessage()} onSelect={() => actions.onDuplicate(theme)} />
      <MenuItem icon="download" label={t('Export')} onSelect={() => actions.onExport(theme.doc)} data-theme-export={theme.id} />
      <MenuSeparator />
      <MenuItem icon="trash-2" danger label={t('Delete')} onSelect={() => actions.onDelete(theme)} data-theme-delete={theme.id} />
    </Menu>
  )
}

export interface YourThemesProps {
  themes: readonly LiveTheme[]
  lowContrast: Record<string, number>
  /** Each theme's resolved colours (stylesheet names), for the label colours of its swatches. */
  resolved?: Record<string, Record<string, string>>
  actions: ThemeCardActions
  /** New theme: the OpenTodo theme of the current side, every colour derived. */
  onNew: () => void
  /** Download a template: a starter file made from the theme in use (themes-layout-template). */
  onTemplate: () => void | Promise<void>
  /** The names already taken, for an import's free name. */
  takenNames: readonly string[]
}

type Pending = { report: VsCodeReport; doc: ThemeDocument; failures: ContrastFailure[] | null } | null

export function YourThemes({ themes, lowContrast, resolved = {}, actions, onNew, onTemplate, takenNames }: YourThemesProps) {
  const room = canAddTheme(themes.length)
  const fileInput = useRef<HTMLInputElement>(null)
  const vsInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [dropping, setDropping] = useState(false)

  const readFile = async (file: File, as: 'theme' | 'vscode' | 'auto') => {
    setError(null)
    if (!room) { setError(limitMessage()); return }
    const { MAX_VSCODE_BYTES, importVsCodeTheme } = await import('../../lib/theme/vscode')
    if (file.size > (as === 'theme' ? MAX_THEME_FILE_BYTES : MAX_VSCODE_BYTES)) {
      setError(as === 'theme' ? t('The file is larger than 64 KB.') : t('The file is larger than 1 MB.'))
      return
    }
    const text = await file.text()
    const kind = as !== 'auto' ? as : /"opentodoTheme"\s*:/.test(text) ? 'theme' : 'vscode'
    if (kind === 'theme') {
      const r = readThemeFile(text, file.size)
      if (!r.ok) { setError(fileErrorText(r)); return }
      openDraft(importedDraft(r.doc, takenNames))
      return
    }
    const r = importVsCodeTheme(text, file.name, file.size, newThemeId())
    if (!r.ok) { setError(r.message); return }
    const doc = { ...r.doc, name: importedDraft(r.doc, takenNames, r.doc.id).name }
    setPending({ report: { ...r.report, name: doc.name }, doc, failures: null })
    const resolver = createResolver()
    const res = await resolver.resolve(doc)
    resolver.dispose()
    setPending((p) => (p && p.doc === doc ? { ...p, failures: res?.failures ?? [] } : p))
  }
  const openImported = async (fixContrast: boolean) => {
    if (!pending) return
    let doc = pending.doc
    if (fixContrast) {
      const resolver = createResolver()
      doc = (await resolver.fixAll(doc)).doc
      resolver.dispose()
    }
    setPending(null)
    openDraft(doc)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDropping(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void readFile(file, 'auto')
  }
  return (
    // A row of the Appearance section like the others: its own vertical padding, so its actions never touch the next row.
    <section aria-labelledby="your-themes-title" id="appearance-your-themes" tabIndex={-1} data-your-themes data-setting-row="appearance-your-themes"
      className={`flex flex-col gap-3 rounded-card py-3 outline-none ${dropping ? 'ring-2 ring-accent' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true) } }} onDragLeave={() => setDropping(false)} onDrop={onDrop}>
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 id="your-themes-title" className="text-body font-medium text-default">{t('Your themes')}</h3>
          <span className="text-meta text-muted" data-your-themes-count>{t('{n} of {max}', { n: themes.length, max: MAX_CUSTOM_THEMES })}</span>
        </div>
        <p className="text-meta text-muted">
          {t('Make your own theme, or import a theme file. A template lists every colour a theme file can set, with a note on each.')}{' '}
          <LearnMore screen="themes-files" topic={t('Theme files')} />
        </p>
      </div>
      {themes.length === 0 ? (
        <p className="rounded-card border border-dashed border-default px-3 py-4 text-meta text-muted" data-your-themes-empty>
          {t('No themes of your own yet. Start a new one, use Customise in any theme\'s menu, or download a template, change its colours and import it. You can also drop a file here.')}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          {themes.map((th) => (
            <li key={th.id} className="relative flex flex-col gap-2 rounded-card border border-default bg-surface p-2" data-custom-theme={th.id}>
              <ThemeSwatches swatches={docSwatches(th.doc, resolved[th.id])} />
              <button type="button" className="min-w-0 pr-7 text-left outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus rounded-control" onClick={() => openTheme(th.id)}>
                <span className="block truncate text-meta font-medium text-default"><span className="sr-only">{t('Edit')} </span>{th.doc.name}</span>
                <span className="block truncate text-hint text-muted">{th.doc.kind === 'light' ? t('Light') : t('Dark')}</span>
                {lowContrast[th.id] ? <span className="block truncate text-hint font-medium text-warning" data-theme-low-contrast={lowContrast[th.id]}>{lowContrastBadge(lowContrast[th.id])}</span> : null}
              </button>
              <div className="absolute right-1 bottom-1"><CustomThemeMenu theme={th} actions={actions} room={room} /></div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2" data-your-themes-actions>
        <Button size="sm" variant="secondary" icon="plus" disabled={!room} onClick={onNew} data-theme-new>{t('New theme')}</Button>
        <Menu label={t('Import a theme')} namedByContent kind="menu" align="start"
          triggerClassName="ui-btn ui-btn--secondary ui-btn--sm" triggerProps={{ disabled: !room, 'data-theme-import': true }}
          trigger={<><Icon name="upload" size="sm" />{t('Import')}<Icon name="chevron-down" size="sm" /></>}>
          <MenuItem icon="file" label={t('Theme file')} description={t('An OpenTodo theme or a filled-in template')} onSelect={() => fileInput.current?.click()} data-theme-import-file />
          <MenuItem icon="code" label={t('VS Code theme')} description={t('A VS Code colour theme file')} onSelect={() => vsInput.current?.click()} data-theme-import-vscode />
        </Menu>
        <Button size="sm" variant="secondary" icon="download" onClick={onTemplate} data-theme-template>{t('Download a template')}</Button>
      </div>
      {!room && <p className="text-meta text-muted" role="note" data-theme-limit>{limitMessage()}</p>}
      {error && <Notice tone="danger">{error}</Notice>}
      <input ref={fileInput} type="file" accept=".json,.jsonc,application/json" hidden aria-hidden="true" tabIndex={-1} data-theme-file
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readFile(f, 'theme') }} />
      <input ref={vsInput} type="file" accept=".json,.jsonc,application/json" hidden aria-hidden="true" tabIndex={-1} data-theme-vscode-file
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readFile(f, 'vscode') }} />
      {pending && <Suspense fallback={null}><ImportReport report={pending.report} failures={pending.failures} onCancel={() => setPending(null)} onOpen={openImported} /></Suspense>}
    </section>
  )
}
