// A key badge that respects "Show shortcut hints" (keyboard-shortcuts "Shortcut
// hints live in tooltips and menus"): in the chrome the badge is printed only while
// the preference is on; otherwise the key is plain text, or nothing when `only`.
import { useShortcutHints } from './hints'

export function Kbd({ k, only = false, className = '' }: { k: string; only?: boolean; className?: string }) {
  const on = useShortcutHints()
  if (on) return <kbd className={`ui-kbd ${className}`.trim()}>{k}</kbd>
  if (only) return null
  return <span className={className || undefined}>{k}</span>
}
