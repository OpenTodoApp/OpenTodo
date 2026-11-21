import { useRef, useState } from 'react'
import { CatalogueIcon, hueFor, Icon, Popover, Tooltip } from '../ui'
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
  const hue = color ? hueFor(color) : undefined
  const mark = color ? <span className="block size-3 rounded-full bg-hue-solid" /> : <Icon name="palette" size="sm" />
  return (
    <>
      <Tooltip label={label} disabled={open}>
        <button ref={anchor} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
          data-hue={hue} className={`ui-btn ui-btn--secondary ui-btn--sm touch-target shrink-0 px-2${hue ? ' text-hue-solid' : ''}`}
          onMouseDown={(e) => e.preventDefault()} onClick={() => changeOpen(!open)}>
          <CatalogueIcon name={icon} fallback={mark} />
        </button>
      </Tooltip>
      {/* In the phone's sheet the swatches, the field and the icons share the menus' 8 px inset (phone-icon-picker). */}
      <Popover open={open} onClose={close} anchor={anchor} label={label} align="start" width={onIcon ? 'sm:w-80' : 'sm:w-56'} className="in-data-[overlay=sheet]:px-2">
        <ColourSwatches color={color} onPick={pick} onDefault={() => pick(undefined)} />
        {onIcon && <ProjectIconPicker icon={icon} color={color} onClose={close} onPick={(next) => { onIcon(next); close() }} />}
      </Popover>
    </>
  )
}
