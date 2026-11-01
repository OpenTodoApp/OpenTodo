// The Theme row of Settings → Appearance (theme-engine D14, theme-catalogue D1, D4,
// D6): one list of theme cards for a fixed mode, a Light and a Dark list under
// System. The OpenTodo theme of each side comes first, then the built-in palettes of
// that kind by name, from the catalogue, which loads lazily with this row (never on
// the first load). Under System, choosing one theme of a light and dark family while
// the other side is not of that family offers its counterpart for the other side
// (one more op, only when accepted). Below a list whose chosen theme is a palette,
// About this theme opens its credits (ThemeAbout, lazy). Lazy itself: loaded with
// Settings › Appearance, out of the first load; the data is in themeCatalogue.ts.
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { BUILTIN_THEMES, customChoice, DEFAULT_THEME, readThemeChoices, setCustomThemeChoice, setThemeChoice, type ChoiceStatus, type Side } from '../lib/theme/choice'
import { canAddTheme, customiseDocument, deleteCustomThemeUndoable, duplicateDocument, knownCustom, limitMessage, newDocument, uniqueName, useCustomThemes, type LiveTheme } from '../lib/theme/custom'
import { downloadTheme } from '../lib/theme/files'
import { builtinDocument } from '../lib/theme/load'
import { effectiveSide } from '../lib/appearance'
import { useUserPrefsRow } from '../lib/localData'
import { showUndoToast } from './bulk/toastStore'
import { openDraft } from './themes/openEditor'
import { CustomThemeMenu, docSwatches, lowContrastBadge, useLowContrast, YourThemes, type ThemeCardActions } from './themes/YourThemes'
import type { CatalogueTheme } from '../lib/theme/builtin/index'
import { msg, t, translatedMap } from '../lib/i18n'
import { rowCopy } from '../lib/settingsCopy'
import { Button, Icon, IconButton, Menu, MenuItem, ThemeList, type ThemeCardData } from '../ui'
import { act } from './actionError'
import { knownThemes, type CatalogueModule, type ThemeSettingsProps } from './themeCatalogue'

const ThemeAbout = lazy(() => import('./ThemeAbout'))

/** The family and counterpart of a theme; OpenTodo Light and Dark are one family. */
export function familyOf(id: string, c: CatalogueModule | null): { family: string; counterpart?: string } {
  if (id === 'opentodo-light') return { family: 'opentodo', counterpart: 'opentodo-dark' }
  if (id === 'opentodo-dark') return { family: 'opentodo', counterpart: 'opentodo-light' }
  const e = c?.CATALOGUE.find((x) => x.id === id)
  return { family: e?.family ?? id, ...(e?.counterpart ? { counterpart: e.counterpart } : {}) }
}

/** A theme's display name. */
export function themeName(id: string, c: CatalogueModule | null): string {
  if (id === 'opentodo-light') return t('OpenTodo Light')
  if (id === 'opentodo-dark') return t('OpenTodo Dark')
  return c?.CATALOGUE.find((x) => x.id === id)?.name ?? id
}

/** The cards of one side: OpenTodo's theme, then the palettes of that kind by name. */
export function themeCards(side: Side, c: CatalogueModule | null = null): ThemeCardData[] {
  const own = BUILTIN_THEMES.filter((b) => b.kind === side).map((b): ThemeCardData => ({
    id: b.id,
    name: themeName(b.id, null),
    author: t('OpenTodo contributors'),
    // The OpenTodo themes preview through the stylesheet's own tokens, with the user's accent.
    scheme: side,
    swatches: {
      canvas: 'var(--ot-canvas)', surface: 'var(--ot-surface)', text: 'var(--ot-text)', accent: 'var(--ot-accent)',
      hues: ['green', 'blue', 'violet', 'orange'].map((h) => `var(--ot-hue-${h}-solid)`),
    },
  }))
  const palettes = (c?.CATALOGUE ?? []).filter((e) => e.kind === side).sort((a, b) => a.name.localeCompare(b.name, 'en'))
  return [...own, ...palettes.map((e): ThemeCardData => ({ id: e.id, name: e.name, author: e.author, swatches: e.swatches }))]
}

export interface ThemeChoiceProps {
  /** A menu beside each card (theme-editor D3). */
  menuFor?: (card: ThemeCardData) => ReactNode
  /** One list for a fixed mode, Light and Dark under System. */
  lists: { side: Side; value: string; status: ChoiceStatus; cards: readonly ThemeCardData[]; about?: CatalogueTheme }[]
  onChoose: (side: Side, id: string) => void
  /** The counterpart offer under System (theme-catalogue D1): the side it is for and the theme's name. */
  offer?: { side: Side; name: string; onAccept: () => void; onDismiss: () => void }
  /** The address the licence notices are served at (same origin). */
  creditsUrl?: string
}


const SIDE_LABEL = translatedMap<Side>({ light: msg('Light'), dark: msg('Dark') })
const STATUS_NOTE: Partial<Record<ChoiceStatus, () => string>> = {
  newer: () => t('Made with a newer version of OpenTodo'),
  invalid: () => t('Theme is invalid'),
}

/**
 * The Theme row with its data (lazy, Settings › Appearance): the cards of each side
 * (the built-in themes, then the user's own of that kind, theme-editor D3), one op
 * per choice, and under System the counterpart offer after a choice, until it is
 * accepted (one more op) or dismissed; below them, Your themes.
 */
export default function ThemeSettings({ mode, catalogue, author = '' }: ThemeSettingsProps) {
  const known = knownThemes(catalogue)
  const custom = useCustomThemes()
  const list = custom ?? NO_THEMES
  const prefs = useUserPrefsRow()
  const choices = readThemeChoices(prefs, known, custom ? knownCustom(list) : null)
  const sides: Side[] = mode === 'system' ? ['light', 'dark'] : [mode]
  const [offerFor, setOfferFor] = useState<{ side: Side; id: string } | null>(null)
  const other = (s: Side): Side => (s === 'light' ? 'dark' : 'light')
  const offered = offerFor && mode === 'system' && familyOf(choices[offerFor.side].id, catalogue).family !== familyOf(offerFor.id, catalogue).family ? offerFor : null
  const low = useLowContrast(list)
  const room = canAddTheme(list.length)
  const taken = list.map((x) => x.doc.name)
  const cardActions: ThemeCardActions = {
    onUse: (th, side) => act(setCustomThemeChoice(side, th.id)),
    onDuplicate: (th) => openDraft(duplicateDocument(th.doc, taken)),
    onExport: (doc) => downloadTheme(doc),
    onDelete: (th) => act(deleteCustomThemeUndoable(th.id, prefs).then((r) => { if (r.entry) showUndoToast(r.label, r.entry.id) })),
  }
  const customise = async (id: string) => {
    const doc = await builtinDocument(id)
    if (!doc) return
    const { simplifyDocument } = await import('../lib/theme/compute')
    const copy = customiseDocument(simplifyDocument(doc), author)
    openDraft({ ...copy, name: uniqueName(copy.name, taken) })
  }
  const exportBuiltin = async (id: string) => {
    const doc = await builtinDocument(id)
    if (doc) downloadTheme(doc)
  }
  const menuFor = (card: ThemeCardData) => {
    const own = list.find((x) => customChoice(x.id) === card.id)
    if (own) return <CustomThemeMenu theme={own} actions={cardActions} room={room} />
    return (
      <Menu label={t('Actions for {name}', { name: card.name })} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm px-1.5"
        triggerProps={{ 'data-theme-menu': card.id }}>
        <MenuItem icon="palette" label={t('Customise')} disabled={!room} description={room ? undefined : limitMessage()} onSelect={() => act(customise(card.id))} data-theme-customise={card.id} />
        <MenuItem icon="download" label={t('Export')} onSelect={() => act(exportBuiltin(card.id))} />
      </Menu>
    )
  }
  const cardsOf = (side: Side): ThemeCardData[] => [
    ...themeCards(side, catalogue),
    ...list.filter((x) => x.doc.kind === side).map((x): ThemeCardData => ({ id: customChoice(x.id), name: x.doc.name, author: x.doc.author, swatches: docSwatches(x.doc), badge: lowContrastBadge(low[x.id]) })),
  ]
  const valueOf = (side: Side) => (choices[side].custom ? customChoice(choices[side].id) : choices[side].id)
  const onNew = async () => {
    const side = effectiveSide(mode)
    const base = await builtinDocument(DEFAULT_THEME[side])
    if (base) openDraft(newDocument(base, author, uniqueName(t('My theme'), taken)))
  }
  return (
    <>
      <ThemeRow
        lists={sides.map((side) => ({
          side, value: valueOf(side), status: choices[side].status, cards: cardsOf(side),
          about: catalogue?.CATALOGUE.find((e) => e.id === choices[side].id && choices[side].status === 'theme' && !choices[side].custom),
        }))}
        menuFor={menuFor}
        onChoose={(side, id) => {
          if (id === valueOf(side)) return
          if (id.startsWith('user:')) { act(setCustomThemeChoice(side, id.slice(5))); setOfferFor(null); return }
          if (!known) return
          act(setThemeChoice(side, id, known))
          const counterpart = familyOf(id, catalogue).counterpart
          setOfferFor(mode === 'system' && counterpart ? { side: other(side), id: counterpart } : null)
        }}
        offer={offered && known ? {
          side: offered.side, name: themeName(offered.id, catalogue),
          onAccept: () => { setOfferFor(null); act(setThemeChoice(offered.side, offered.id, known)) },
          onDismiss: () => setOfferFor(null),
        } : undefined}
        creditsUrl={catalogue?.creditsUrl}
      />
      <YourThemes themes={list} lowContrast={low} actions={cardActions} takenNames={taken} onNew={() => act(onNew())} />
    </>
  )
}

const NO_THEMES: LiveTheme[] = []

/** The Theme row: one list, or a Light and a Dark list under System. */
export function ThemeRow({ lists, onChoose, offer, creditsUrl, menuFor }: ThemeChoiceProps) {
  const label = rowCopy('appearance', 'themes').label
  const [about, setAbout] = useState<CatalogueTheme | null>(null)
  return (
    <div className="py-3" id="appearance-themes" tabIndex={-1} data-setting-row="appearance-themes">
      {lists.length > 1 && <p className="mb-2 text-body font-medium text-default">{label}</p>}
      <div className="flex flex-col gap-3">
        {lists.map((l) => (
          <div key={l.side}>
            <ThemeList data-theme-side={l.side} label={lists.length > 1 ? SIDE_LABEL[l.side] : label}
              themes={l.cards} value={l.value} onChange={(id) => onChoose(l.side, id)} note={STATUS_NOTE[l.status]?.()} menuFor={menuFor} />
            {l.about && (
              <Button variant="ghost" size="sm" className="mt-1" data-theme-about={l.about.id} onClick={() => setAbout(l.about!)}>
                {t('About this theme')}
              </Button>
            )}
          </div>
        ))}
      </div>
      {offer && (
        <div className="mt-2 flex items-center gap-2" data-theme-offer={offer.side} role="group" aria-label={offer.name}>
          <Button variant="secondary" size="sm" onClick={offer.onAccept}>
            {offer.side === 'dark' ? t('Also use {name} at night', { name: offer.name }) : t('Also use {name} by day', { name: offer.name })}
          </Button>
          <IconButton icon="x" size="sm" label={t('Dismiss')} onClick={offer.onDismiss} />
        </div>
      )}
      {about && (
        <Suspense fallback={null}>
          <ThemeAbout theme={about} creditsUrl={creditsUrl} onClose={() => setAbout(null)} />
        </Suspense>
      )}
    </div>
  )
}
