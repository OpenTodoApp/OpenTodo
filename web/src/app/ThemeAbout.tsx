// About this theme (theme-catalogue D4; themes "Credits and licences of built-in
// palettes"): the palette's name, author, licence and copyright line, the project's
// address as text (never a link that loads anything inside the app), the note when
// some colours were adapted for contrast, the not-affiliated line, and a Licence
// link to the full notices served by the user's own server. Lazy: loaded when the
// dialog first opens.
import type { CatalogueTheme } from '../lib/theme/builtin/index'
import { t } from '../lib/i18n'
import { Button, Dialog } from '../ui'

export default function ThemeAbout({ theme, creditsUrl, onClose }: { theme: CatalogueTheme; creditsUrl?: string; onClose: () => void }) {
  const row = (term: string, value: string) => (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-28 shrink-0 text-meta text-muted">{term}</dt>
      <dd className="min-w-0 break-words text-body text-default">{value}</dd>
    </div>
  )
  return (
    <Dialog title={theme.name} label={t('About this theme')} onClose={onClose} testId="theme-about">
      <div className="flex flex-col gap-3 p-4" data-theme-about-dialog={theme.id}>
        <dl className="flex flex-col gap-2">
          {row(t('Author'), theme.author)}
          {row(t('Licence'), theme.licence)}
          {row(t('Copyright'), theme.copyright)}
          {row(t('Project'), theme.source)}
        </dl>
        {theme.adapted && <p className="text-meta text-muted" data-theme-adapted>{t('Some colours were adapted for contrast')}</p>}
        <p className="text-meta text-muted">{t('OpenTodo is not affiliated with this project')}</p>
        <div className="flex items-center justify-between gap-2">
          {creditsUrl ? <a className="text-meta text-accent underline" href={creditsUrl} target="_blank" rel="noopener" data-theme-licence>{t('Licence')}</a> : <span />}
          <Button variant="secondary" onClick={onClose}>{t('Close')}</Button>
        </div>
      </div>
    </Dialog>
  )
}
