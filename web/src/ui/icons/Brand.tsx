// The OpenTodo mark and wordmark (OpenSpec change sidebar-v2, design D2 and D3).
// brand.svg is the one source: this inlines its symbols, and
// scripts/brand-icons.mjs renders every raster from the same file.
import source from './brand.svg?raw'

export type BrandVariant = 'mono' | 'colour'
export type BrandSize = 16 | 20 | 24 | 32

/** The inner markup and viewBox of one `<symbol>` in brand.svg. */
export function brandSymbol(svg: string, id: BrandVariant): { viewBox: string; body: string } {
  const m = new RegExp(`<symbol id="${id}" viewBox="([^"]+)">([\\s\\S]*?)</symbol>`).exec(svg)
  if (!m) throw new Error(`brand.svg has no symbol "${id}"`)
  return { viewBox: m[1], body: m[2] }
}

const SYMBOLS = { mono: brandSymbol(source, 'mono'), colour: brandSymbol(source, 'colour') }

export interface BrandMarkProps {
  size?: BrandSize
  /** `mono` takes the text colour with the closing stroke in the accent; `colour` is the app icon. */
  variant?: BrandVariant
  /** Accessible name; without it the mark is decorative and hidden from assistive technology. */
  title?: string
  className?: string
}

export function BrandMark({ size = 24, variant = 'mono', title, className }: BrandMarkProps) {
  const { viewBox, body } = SYMBOLS[variant]
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const, focusable: 'false' as const }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={viewBox}
      className={`shrink-0${className ? ` ${className}` : ''}`}
      data-brand-mark={variant}
      {...a11y}
      // Static markup from the bundled brand.svg (never user input).
      dangerouslySetInnerHTML={{ __html: body }}
    />
  )
}

/** The product name as text in the strong tone: it renders with the page's font and is never translated. */
export function BrandWordmark({ className }: { className?: string }) {
  return <span className={`font-semibold text-strong${className ? ` ${className}` : ''}`} data-brand-wordmark>OpenTodo</span>
}
