// The frame of every facet editor (OpenSpec change task-panel-facets, design D2): a
// popover anchored to the part that opened it (a bottom sheet below 640 px), titled
// with the facet's icon and name, with the property's editor and a footer offering
// Clear (when the part has a value) and Done. The panel never re-flows.
import type { ReactNode, RefObject } from 'react'
import { Button, Icon, type IconName, Popover } from '../../ui'
import { t } from '../../lib/i18n'

export interface FacetEditorProps {
  anchor: RefObject<HTMLElement | null>
  icon: IconName
  /** The facet's name, or the property's for single-purpose editors. */
  title: string
  onClose: () => void
  /** Removes the value and closes; omitted when there is nothing to clear. */
  onClear?: () => void
  /** A control under the title (the When segments). */
  header?: ReactNode
  /** Width from 640 px up. */
  width?: string
  children: ReactNode
}

export function FacetEditor({ anchor, icon, title, onClose, onClear, header, width = 'sm:w-80', children }: FacetEditorProps) {
  return (
    <Popover open onClose={onClose} anchor={anchor} label={title} align="start" width={width} className="p-0">
      <div className="flex flex-col" data-facet-editor>
        <div className="hidden items-center gap-2 border-b border-default px-3 py-2 text-meta font-semibold text-muted sm:flex">
          <Icon name={icon} size="xs" className="text-faint" />{title}
        </div>
        {header && <div className="border-b border-default px-3 py-2">{header}</div>}
        <div className="min-w-0 p-3">{children}</div>
        <div className="flex items-center justify-between gap-2 border-t border-default px-3 py-2">
          {onClear ? <Button variant="ghost" size="sm" onClick={() => { onClear(); onClose() }} data-facet-clear>{t('Clear')}</Button> : <span />}
          <Button size="sm" onClick={onClose} data-facet-done>{t('Done')}</Button>
        </div>
      </div>
    </Popover>
  )
}
