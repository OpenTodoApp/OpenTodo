// Colour names as people read them, in the interface language (OpenSpec change
// app-localization). Stored values stay the hex codes and the English ids.
import { msg, t, translatedMap } from './i18n/catalog'

const HUE_NAME = translatedMap({
  red: msg('red'), orange: msg('orange'), yellow: msg('yellow'), lime: msg('lime'), green: msg('green'), teal: msg('teal'),
  cyan: msg('cyan'), blue: msg('blue'), indigo: msg('indigo'), violet: msg('violet'), pink: msg('pink'), slate: msg('slate'),
})

/** A project or label colour by its hue name ("red"); an unknown name is shown as it is. */
export function hueName(name: string): string {
  return (HUE_NAME as Record<string, string>)[name] ?? name
}

/** An accent theme's name ("Emerald"), from its English label. */
export function accentName(label: string): string {
  return t(label)
}

/** Accent labels for extraction (ui/tokens/accents.ts keeps the English labels). */
export const ACCENT_LABELS = [msg('Emerald'), msg('Blue'), msg('Indigo'), msg('Violet'), msg('Rose'), msg('Orange'), msg('Teal'), msg('Graphite')]
