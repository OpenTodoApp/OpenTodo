// The editor's Advanced list (OpenSpec change theme-editor, design D6): every token
// of the theme format in its group, each group collapsible with the count of set
// tokens and of warnings; a filter that matches names in the user's language and
// in English, and ids. A token row shows its value, Derived or Set, its worst pair,
// Undo of its last change and Reset.
import { useId, useState } from 'react'
import { t } from '../../lib/i18n'
import type { ContrastFailure } from '../../lib/theme/check'
import type { ResolvedTheme } from '../../lib/theme/derive'
import type { ThemeDocument } from '../../lib/theme/format'
import { cssName, TOKEN_GROUPS } from '../../lib/theme/tokens'
import { Icon, Input, LazyTokenRow as TokenRow } from '../../ui'
import { GROUP_NAME, matchesFilter, tokenName, type TokenGroup } from './tokenNames'

/** Shown while the theme resolves. */
const NEUTRAL = '#808080' // token-lint-allow: a neutral placeholder colour, data not styling

export interface TokenListProps {
  doc: ThemeDocument
  resolved: ResolvedTheme | null
  failures: readonly ContrastFailure[]
  /** The worst ratio of each stylesheet token's pairs, from the resolution. */
  worst: Record<string, { ratio: number; min: number; other: string }>
  onSet: (token: string, value: string | undefined, group?: string) => void
  /** Undo of a token's last change, or null when it has none. */
  canUndoToken: (token: string) => boolean
  onUndoToken: (token: string) => void
}

export function TokenList({ doc, resolved, failures, worst, onSet, canUndoToken, onUndoToken }: TokenListProps) {
  const [q, setQ] = useState('')
  const filterId = useId()
  const failing = new Set(failures.flatMap((f) => [f.fg, f.bg]))
  const groups = (Object.entries(TOKEN_GROUPS) as [TokenGroup, readonly string[]][])
    .map(([g, tokens]) => [g, tokens.filter((tok) => matchesFilter(tok, q))] as const)
    .filter(([, tokens]) => tokens.length > 0)
  return (
    <section aria-labelledby="theme-advanced-title" className="flex flex-col gap-2" data-theme-advanced>
      <h2 id="theme-advanced-title" className="text-body font-semibold text-strong">{t('Advanced')}</h2>
      <p className="text-meta text-muted">{t('Every colour of the theme. Setting one keeps it as you set it; Reset lets it follow the base colours again.')}</p>
      <label htmlFor={filterId} className="sr-only">{t('Filter colours')}</label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-muted"><Icon name="search" /></span>
        <Input id={filterId} type="search" value={q} placeholder={t('Filter colours')} className="pl-8" onChange={(e) => setQ(e.target.value)} data-theme-token-filter />
      </div>
      {groups.length === 0 && <p className="text-meta text-muted" role="status">{t('No colour matches “{q}”.', { q })}</p>}
      {groups.map(([g, tokens]) => {
        const set = tokens.filter((tok) => doc.tokens?.[tok] !== undefined).length
        const warn = tokens.filter((tok) => failing.has(cssName(tok))).length
        return (
          <details key={g} open={!!q || warn > 0 || undefined} className="rounded-card border border-default" data-theme-group={g}>
            <summary className="flex cursor-pointer items-center gap-2 rounded-card px-3 py-2 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus">
              <span className="flex-1 text-body font-medium text-default">{GROUP_NAME[g]}</span>
              <span className="text-meta text-muted" data-theme-group-counts>
                {[t('{n} set', { n: set }), warn ? t('{n, plural, one {# warning} other {# warnings}}', { n: warn }) : ''].filter(Boolean).join(' · ')}
              </span>
            </summary>
            <div className="divide-y divide-(--ot-border-soft) px-3">
              {tokens.map((tok) => {
                const css = cssName(tok)
                const w = worst[css]
                return (
                  <TokenRow key={tok} id={tok} name={tokenName(tok)} value={doc.tokens?.[tok]} resolved={resolved?.tokens[css] ?? doc.tokens?.[tok] ?? NEUTRAL}
                    worst={w ? { ratio: w.ratio, min: w.min, on: tokenName(w.other) } : undefined}
                    onChange={(v, grp) => onSet(tok, v, `token:${tok}:${grp}`)} onReset={() => onSet(tok, undefined)}
                    onUndo={canUndoToken(tok) ? () => onUndoToken(tok) : undefined} />
                )
              })}
            </div>
          </details>
        )
      })}
    </section>
  )
}
