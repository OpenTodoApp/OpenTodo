// Card and Badge (OpenSpec change ui-primitives, design D9 / "Surfaces and data display").
import type { HTMLAttributes, ReactNode } from 'react'
import { hueFor, type HueName } from './tokens/palette'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding: none for lists that bring their own rows. */
  padding?: 'none' | 'md'
  as?: 'div' | 'section' | 'article'
}

export function Card({ padding = 'md', as: Tag = 'div', className, ...rest }: CardProps) {
  return (
    <Tag
      {...rest}
      className={`rounded-card border border-default bg-surface shadow-1 ${padding === 'md' ? 'p-4 sm:p-6' : ''}${className ? ` ${className}` : ''}`}
    />
  )
}

export interface BadgeProps {
  children: ReactNode
  /** A palette hue, or any stored colour (mapped to its nearest hue). */
  hue?: HueName
  color?: string | null
  /** soft: tinted background with readable text; solid: a coloured dot before the text. */
  tone?: 'soft' | 'solid'
  className?: string
  title?: string
}

export function Badge({ children, hue, color, tone = 'soft', className, title }: BadgeProps) {
  const name = hue ?? (color ? hueFor(color) : 'slate')
  return (
    <span
      data-hue={name}
      title={title}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-chip px-2 py-0.5 text-meta font-medium ${tone === 'soft' ? 'bg-hue-soft text-hue' : 'border border-default text-default'}${className ? ` ${className}` : ''}`}
    >
      {tone === 'solid' && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-hue-solid" />}
      <span className="truncate">{children}</span>
    </span>
  )
}
