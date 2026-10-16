// The guide stays English (OpenSpec change app-localization, "Help stays English,
// and says so"): in another interface language, Help starts with a short note in
// that language.
import { currentLanguage, t, useLanguageVersion } from '../../lib/i18n'

export function EnglishGuideNote() {
  useLanguageVersion()
  if (currentLanguage() === 'en') return null
  return <p className="mb-3 rounded-control bg-sunken px-3 py-2 text-meta text-muted dark:bg-raised" data-help-english-note>{t('The guide is in English.')}</p>
}
