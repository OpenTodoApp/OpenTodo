// A key badge that respects "Show shortcut hints" (keyboard-shortcuts "Shortcut
// hints live in tooltips and menus"): in the chrome the badge is printed only while
// the preference is on; otherwise the key is plain text, or nothing when `only`.
import { parseKeys } from '../../lib/shortcuts'
import { t } from '../../lib/i18n'
import { useShortcutHints } from './hints'

export function Kbd({ k, only = false, className = '' }: { k: string; only?: boolean; className?: string }) {
  const on = useShortcutHints()
  if (on) return <kbd className={`ui-kbd ${className}`.trim()}>{k}</kbd>
  if (only) return null
  return <span className={className || undefined}>{k}</span>
}

/**
 * The keys of a registry entry as keycaps (shortcut-spotlight D5): one keycap per
 * chord, "then" between the chords of a sequence, "or" between alternatives. A keycap
 * never wraps; only the gaps between keycaps do. Keys that are not chords (a gesture,
 * a typing rule) read as plain text.
 */
export function Keys({ keys, className = '' }: { keys: string[]; className?: string }) {
  return (
    <span className={`inline-flex flex-wrap items-center justify-end gap-1 ${className}`.trim()} data-keys>
      {keys.map((k, i) => {
        const seq = parseKeys(k)
        return (
          <span key={`${i}-${k}`} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-hint text-faint">{t('or')}</span>}
            {seq && k.includes(' ')
              ? k.split(' ').map((part, j) => (
                <span key={j} className="inline-flex items-center gap-1">
                  {j > 0 && <span className="text-hint text-faint">{t('then', { context: 'keys' })}</span>}
                  <kbd className="ui-kbd">{part}</kbd>
                </span>
              ))
              : seq ? <kbd className="ui-kbd">{k}</kbd> : <span className="text-meta text-muted">{k}</span>}
          </span>
        )
      })}
    </span>
  )
}
