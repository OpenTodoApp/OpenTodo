// A token row of the theme editor's Advanced list (OpenSpec change theme-editor,
// design D6): the colour (a swatch that opens the colour picker), the token's name
// in the user's language and its id, its value, whether it is derived or set, its
// worst contrast pair, and Undo (its last change in this session) and Reset (make
// it derived again). Setting a derived token's value makes it Set.
import { Badge } from './Card'
import { ColourField } from './ColourField'
import { ContrastBadge } from './ContrastBadge'
import { IconButton } from './Button'
import { colourToHex } from '../lib/theme/oklch'
import { t } from '../lib/i18n'

export interface TokenRowProps {
  /** The token's name in the user's language ("Muted text"). */
  name: string
  /** The token id ("muted"), never translated. */
  id: string
  /** The explicit value; undefined when derived. */
  value: string | undefined
  /** The value that applies (resolved). */
  resolved: string
  /** The worst pair the token is in: its ratio, minimum and the other token's name. */
  worst?: { ratio: number; min: number; on: string }
  onChange: (value: string, group: string) => void
  /** Undo the token's last change; absent when it has none. */
  onUndo?: () => void
  onReset: () => void
}

export function TokenRow({ name, id, value, resolved, worst, onChange, onUndo, onReset }: TokenRowProps) {
  const set = value !== undefined
  return (
    <div className="flex items-center gap-3 py-2" data-token-row={id} data-token-state={set ? 'set' : 'derived'}>
      <ColourField compact label={name} value={value} derived={resolved} onChange={onChange} onReset={onReset} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span className="truncate text-body text-default">{name}</span>
          <span className="font-mono text-meta text-muted">{id}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-mono text-meta text-muted">{colourToHex(value ?? resolved)}</span>
          <Badge hue={set ? 'blue' : 'slate'}>{set ? t('Set', { context: 'token' }) : t('Derived')}</Badge>
          {worst && <ContrastBadge ratio={worst.ratio} min={worst.min} on={t('on {name}', { name: worst.on })} />}
        </span>
      </span>
      <span className="flex shrink-0 items-center">
        {onUndo && <IconButton icon="undo-2" size="sm" label={t('Undo {name}', { name })} onClick={onUndo} data-token-undo />}
        {set && <IconButton icon="rotate-ccw" size="sm" label={t('Reset {name} to derived', { name })} onClick={onReset} data-token-reset />}
      </span>
    </div>
  )
}
