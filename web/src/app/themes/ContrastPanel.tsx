// The editor's Contrast panel (OpenSpec change theme-editor, design D8): every pair
// below AA on the draft, with both tokens' names, the measured and required ratio,
// a sample of the pair, Fix per pair and Fix all. A polite live region announces
// the number of failing pairs when it changes (not every frame), and each fix
// announces its result ("Muted text now 4.6 to 1 on Canvas").
import { useEffect, useRef, useState } from 'react'
import { t } from '../../lib/i18n'
import type { ContrastFailure } from '../../lib/theme/check'
import type { ResolvedTheme } from '../../lib/theme/derive'
import { formatRatio } from '../../lib/theme/ratio'
import { Button, Icon, LazyContrastBadge as ContrastBadge } from '../../ui'
import { tokenName } from './tokenNames'

export interface ContrastPanelProps {
  failures: readonly ContrastFailure[] | null
  resolved: ResolvedTheme | null
  onFix: (f: ContrastFailure) => Promise<{ token: string; ratio?: number; movedOther: boolean } | null>
  onFixAll: () => Promise<number>
}

/** The number of failing pairs, in words. */
export const failingText = (n: number) => n === 0
  ? t('Every pair reaches AA')
  : t('{n, plural, one {# pair below AA} other {# pairs below AA}}', { n })

export function ContrastPanel({ failures, resolved, onFix, onFixAll }: ContrastPanelProps) {
  const [announce, setAnnounce] = useState('')
  const count = failures?.length ?? null
  const last = useRef<number | null>(null)
  useEffect(() => {
    if (count === null || count === last.current) return
    if (last.current !== null) setAnnounce(failingText(count))
    last.current = count
  }, [count])
  const fix = async (f: ContrastFailure) => {
    const r = await onFix(f)
    if (!r) { setAnnounce(t('No lightness of these colours reaches AA at their hue.')); return }
    const ratio = r.ratio !== undefined ? formatRatio(r.ratio) : ''
    const moved = r.movedOther ? t('{name} moved instead, as no lightness of the other colour could pass.', { name: tokenName(r.token) }) : ''
    setAnnounce([t('{fg} now {ratio} to 1 on {bg}', { fg: tokenName(f.fg), ratio, bg: tokenName(f.bg) }), moved].filter(Boolean).join(' '))
  }
  return (
    <section aria-labelledby="theme-contrast-title" className="flex flex-col gap-2" data-theme-contrast>
      <div className="flex items-center gap-2">
        <h2 id="theme-contrast-title" className="flex-1 text-body font-semibold text-strong">{t('Contrast')}</h2>
        {!!count && <Button size="sm" variant="secondary" icon="sparkles" onClick={async () => {
          const n = await onFixAll()
          setAnnounce(n ? t('{n, plural, one {Fixed # pair} other {Fixed # pairs}}', { n }) : t('No lightness of these colours reaches AA at their hue.'))
        }} data-theme-fix-all>{t('Fix all')}</Button>}
      </div>
      <p className={`flex items-center gap-1.5 text-meta ${count ? 'text-danger' : 'text-muted'}`} data-theme-contrast-count={count ?? ''}>
        <Icon name={count ? 'circle-alert' : 'circle-check-big'} size="xs" />
        {count === null ? t('Measuring…') : failingText(count)}
      </p>
      {!!count && resolved && (
        <ul className="flex max-h-80 flex-col divide-y divide-(--ot-border-soft) overflow-y-auto rounded-card border border-default" aria-label={t('Pairs below AA')} tabIndex={0}>
          {failures!.map((f) => (
            <li key={`${f.fg}/${f.bg}`} className="flex items-center gap-3 px-3 py-2" data-theme-failure={`${f.fg}/${f.bg}`}>
              {/* The sample shows the failing pair on purpose: drawn as generated content, so the accessibility gate does not measure a deliberate low-contrast sample. */}
              <span aria-hidden="true" data-sample="Aa" className="flex h-8 w-12 shrink-0 items-center justify-center rounded-control border border-default text-body font-semibold before:content-[attr(data-sample)]"
                style={{ backgroundColor: resolved.tokens[f.bg] ?? resolved.tokens.surface, color: resolved.tokens[f.fg] }} />
              <span className="min-w-0 flex-1">
                <span className="block text-body text-default">{t('{fg} on {bg}', { fg: tokenName(f.fg), bg: tokenName(f.bg) })}</span>
                <ContrastBadge ratio={f.ratio} min={f.min} />
              </span>
              <Button size="sm" variant="ghost" onClick={() => fix(f)} aria-label={t('Fix {fg} on {bg}', { fg: tokenName(f.fg), bg: tokenName(f.bg) })} data-theme-fix>{t('Fix')}</Button>
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" role="status" aria-live="polite" data-theme-announce>{announce}</p>
    </section>
  )
}
