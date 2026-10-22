// Cut text that stays readable (OpenSpec change ux-fixes-phone, design D2): text cut
// with an ellipsis outside any control (a row's project name, a page title, a facet
// value) shows its full text in the Tooltip on hover and on keyboard focus. While the
// text is cut the element joins the Tab order with the token ring; whole text is
// neither focusable nor given a tip. The element's text is its whole text, so a
// screen reader reads it in full; on touch the Tooltip does not open.
import { type CSSProperties, type ElementType, type Ref, useLayoutEffect, useRef, useState } from 'react'
import { Tooltip } from './Tooltip'

export interface TruncatedTextProps {
  /** The full text. */
  text: string
  /** The element: a span by default; `h1` for a page title. */
  as?: ElementType
  className?: string
  style?: CSSProperties
  /** Extra attributes for the element (data-*, id). */
  [attr: `data-${string}`]: string | undefined
  id?: string
  /** The element's own tab index while the text fits (a page title takes focus after navigation with -1). */
  tabIndex?: number
  /** The element, for a caller that focuses or measures it. */
  elRef?: Ref<HTMLElement>
}

/** True while the element's text overflows its box. */
function isCut(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
}

export function TruncatedText({ text, as: Tag = 'span', className = '', tabIndex, elRef, ...rest }: TruncatedTextProps) {
  const ref = useRef<HTMLElement | null>(null)
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setCut(isCut(el))
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])
  return (
    <Tooltip label={text} disabled={!cut}>
      <Tag ref={(el: HTMLElement | null) => {
        ref.current = el
        if (typeof elRef === 'function') elRef(el)
        else if (elRef) (elRef as { current: HTMLElement | null }).current = el
      }} {...rest} tabIndex={cut ? 0 : tabIndex}
        className={`truncate ${cut ? 'rounded-chip focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus' : ''} ${className}`}>
        {text}
      </Tag>
    </Tooltip>
  )
}
