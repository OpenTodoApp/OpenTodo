// The Theme row of Settings → Appearance (theme-engine D14, theme-catalogue D1, D4,
// D6): one list of theme cards for a fixed mode, a Light and a Dark list under
// System. The OpenTodo theme of each side comes first, then the built-in palettes of
// that kind by name, from the catalogue, which loads lazily with this row (never on
// the first load). Under System, choosing one theme of a light and dark family while
// the other side is not of that family offers its counterpart for the other side
// (one more op, only when accepted). Below a list whose chosen theme is a palette,
// About this theme opens its credits (ThemeAbout, lazy). Lazy itself: loaded with
// Settings › Appearance, out of the first load; the data is in themeCatalogue.ts.
import { lazy, Suspense, useState } from 'react'
import { BUILTIN_THEMES, setThemeChoice, type ChoiceStatus, type Side } from '../lib/theme/choice'
import type { CatalogueTheme } from '../lib/theme/builtin/index'
import { msg, t, translatedMap } from '../lib/i18n'
import { rowCopy } from '../lib/settingsCopy'
import { Button, IconButton, ThemeList, type ThemeCardData } from '../ui'
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
 * The Theme row with its data (lazy, Settings › Appearance): the cards of each side,
 * one op per choice, and under System the counterpart offer after a choice, until it
 * is accepted (one more op) or dismissed.
 */
export default function ThemeSettings({ mode, choices, catalogue }: ThemeSettingsProps) {
  const known = knownThemes(catalogue)
  const sides: Side[] = mode === 'system' ? ['light', 'dark'] : [mode]
  const [offerFor, setOfferFor] = useState<{ side: Side; id: string } | null>(null)
  const other = (s: Side): Side => (s === 'light' ? 'dark' : 'light')
  const offered = offerFor && mode === 'system' && familyOf(choices[offerFor.side].id, catalogue).family !== familyOf(offerFor.id, catalogue).family ? offerFor : null
  return (
    <ThemeRow
      lists={sides.map((side) => ({
        side, value: choices[side].id, status: choices[side].status, cards: themeCards(side, catalogue),
        about: catalogue?.CATALOGUE.find((e) => e.id === choices[side].id && choices[side].status === 'theme'),
      }))}
      onChoose={(side, id) => {
        if (id === choices[side].id || !known) return
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
  )
}

/** The Theme row: one list, or a Light and a Dark list under System. */
export function ThemeRow({ lists, onChoose, offer, creditsUrl }: ThemeChoiceProps) {
  const label = rowCopy('appearance', 'themes').label
  const [about, setAbout] = useState<CatalogueTheme | null>(null)
  return (
    <div className="py-3" id="appearance-themes" tabIndex={-1} data-setting-row="appearance-themes">
      {lists.length > 1 && <p className="mb-2 text-body font-medium text-default">{label}</p>}
      <div className="flex flex-col gap-3">
        {lists.map((l) => (
          <div key={l.side}>
            <ThemeList data-theme-side={l.side} label={lists.length > 1 ? SIDE_LABEL[l.side] : label}
              themes={l.cards} value={l.value} onChange={(id) => onChoose(l.side, id)} note={STATUS_NOTE[l.status]?.()} />
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
