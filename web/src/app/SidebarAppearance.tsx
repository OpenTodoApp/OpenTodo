import { useRef, useState } from 'react'
import { CatalogueIcon, Icon, Popover, Tooltip } from '../ui'
import { t } from '../lib/i18n'
import { ColourSwatches, ProjectIconPicker } from './menus/projectAppearance'

/** An optional draft appearance, contained in one control beside the name. */
export function SidebarAppearance({ color, onColor, icon, onIcon, onOpenChange }: {
  color?: string
  onColor: (color: string | undefined) => void
  icon?: string | null
  onIcon?: (icon: string | null) => void
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const label = onIcon ? t('Appearance') : t('Colour')
  const changeOpen = (next: boolean) => { setOpen(next); onOpenChange?.(next) }
  const close = () => changeOpen(false)
  const pick = (next: string | undefined) => {
    onColor(next)
    if (!onIcon) close()
  }
  const mark = color ? <span className="block size-3 rounded-full" style={{ backgroundColor: color }} /> : <Icon name="palette" size="sm" />
  return (
    <>
      <Tooltip label={label} disabled={open}>
        <button ref={anchor} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
          className="ui-btn ui-btn--secondary ui-btn--sm touch-target shrink-0 px-2" style={{ color }}
          onMouseDown={(e) => e.preventDefault()} onClick={() => changeOpen(!open)}>
          <CatalogueIcon name={icon} fallback={mark} />
        </button>
      </Tooltip>
      <Popover open={open} onClose={close} anchor={anchor} label={label} align="start" width={onIcon ? 'sm:w-80' : 'sm:w-56'}>
        <ColourSwatches color={color} onPick={pick} onDefault={() => pick(undefined)} />
        {onIcon && <ProjectIconPicker icon={icon} color={color} onClose={close} onPick={(next) => { onIcon(next); close() }} />}
      </Popover>
    </>
  )
}
