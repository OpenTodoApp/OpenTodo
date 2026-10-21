// A stored icon name drawn from the icon catalogue (OpenSpec change
// icons-and-section-style, design D3): an interface icon at once, any other catalogue
// icon once the catalogue's chunk has loaded, and the fallback until then, and for
// good for a name this device does not know (written by a newer client).
import { useEffect, useState, type ReactNode } from 'react'
import { Icon, isIconName, type IconSize } from './Icon'
import { catalogueIfLoaded, isCatalogueIcon, loadCatalogue } from './icons/catalogue'

const SIZES = { xs: 12, sm: 16, md: 20, lg: 24 } as const

export function CatalogueIcon({ name, fallback = null, size = 'sm', className, label }: {
  name: string | null | undefined
  /** Shown while the catalogue loads and for unknown names (a project's dot, nothing for a section). */
  fallback?: ReactNode
  size?: IconSize
  className?: string
  label?: string
}) {
  const known = isCatalogueIcon(name)
  const interfaceIcon = known && isIconName(name)
  const [path, setPath] = useState<string | undefined>(() => (known && !interfaceIcon ? catalogueIfLoaded()?.path(name) : undefined))
  useEffect(() => {
    if (!known || interfaceIcon) return
    let live = true
    const now = catalogueIfLoaded()?.path(name)
    if (now) { setPath(now); return }
    setPath(undefined)
    loadCatalogue().then((c) => { if (live) setPath(c.path(name)) }, () => { /* offline before the first load: keep the fallback */ })
    return () => { live = false }
  }, [name, known, interfaceIcon])

  if (!name || !known) return <>{fallback}</>
  if (interfaceIcon) return <Icon name={name} size={size} className={className} label={label} />
  if (!path) return <>{fallback}</>
  const px = typeof size === 'number' ? size : SIZES[size]
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const, focusable: 'false' as const }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={px >= 20 ? 1.75 : 2} strokeLinecap="round" strokeLinejoin="round"
      className={`ui-icon shrink-0${className ? ` ${className}` : ''}`} data-icon={name} {...a11y}
      // Static, trusted path data generated from lucide-static, looked up by a catalogue name (never user input).
      dangerouslySetInnerHTML={{ __html: path }} />
  )
}
