import { Fragment, type ReactNode, useMemo } from 'react'
import { type Block, type Inline, LINK_REL, parseMarkdown } from '../lib/markdown'
import { t } from '../lib/i18n'

/**
 * Renders a comment body (lib/markdown.ts) as React elements. Nothing is ever
 * injected as HTML: text is text, and links open in a new tab without referrer
 * and marked nofollow/ugc (LINK_REL).
 */
export function Markdown({ source, className = '', rich = false }: { source: string; className?: string; rich?: boolean }) {
  // `rich`: a note's projection, with headings and check items (project-notes D4).
  const blocks = useMemo(() => parseMarkdown(source, 0, rich), [source, rich])
  return <div className={`markdown user-text space-y-2 ${className}`}>{blocks.map(renderBlock)}</div>
}

/** Note headings sit under the page's h1: # is h2, ## h3, the rest h4. */
const HEADING: Record<number, { tag: 'h2' | 'h3' | 'h4'; cls: string }> = {
  1: { tag: 'h2', cls: 'text-h2 font-semibold text-strong' },
  2: { tag: 'h3', cls: 'text-h3 font-semibold text-strong' },
}

function renderBlock(b: Block, i: number): ReactNode {
  switch (b.t) {
    case 'p':
      return <p key={i}>{b.c.map(renderInline)}</p>
    case 'pre':
      return <pre key={i} className="overflow-x-auto rounded-control bg-sunken dark:bg-raised p-2 font-mono text-meta" data-scroll-x><code>{b.v}</code></pre>
    case 'quote':
      return <blockquote key={i} className="space-y-2 border-l-2 border-input pl-2 text-muted">{b.c.map(renderBlock)}</blockquote>
    case 'h': {
      const h = HEADING[b.level] ?? { tag: 'h4' as const, cls: 'text-body font-semibold text-strong' }
      const Tag = h.tag
      return <Tag key={i} className={h.cls}>{b.c.map(renderInline)}</Tag>
    }
    case 'list': {
      if (b.checks) {
        // Check items read as a list of read-only boxes; editing happens in the editor.
        return (
          <ul key={i} className="space-y-1 pl-1">
            {b.items.map((item, j) => (
              <li key={j} className="flex items-start gap-2" data-checked={b.checks![j] ?? undefined}>
                {b.checks![j] !== null && <input type="checkbox" disabled checked={!!b.checks![j]} className="mt-1 h-4 w-4 shrink-0" aria-label={b.checks![j] ? t('Done') : t('Not done')} />}
                <div className={`min-w-0 flex-1 space-y-2 ${b.checks![j] ? 'text-muted line-through' : ''}`}>{item.map(renderBlock)}</div>
              </li>
            ))}
          </ul>
        )
      }
      const items = b.items.map((item, j) => <li key={j}>{item.map(renderBlock)}</li>)
      return b.ordered
        ? <ol key={i} start={b.start} className="list-decimal space-y-1 pl-5">{items}</ol>
        : <ul key={i} className="list-disc space-y-1 pl-5">{items}</ul>
    }
  }
}

function renderInline(n: Inline, i: number): ReactNode {
  switch (n.t) {
    case 'text': return <Fragment key={i}>{n.v}</Fragment>
    case 'br': return <br key={i} />
    case 'code': return <code key={i} className="rounded-control bg-sunken dark:bg-raised px-1 font-mono text-meta">{n.v}</code>
    case 'em': return <em key={i}>{n.c.map(renderInline)}</em>
    case 'strong': return <strong key={i}>{n.c.map(renderInline)}</strong>
    case 'link':
      return <a key={i} href={n.href} target="_blank" rel={LINK_REL} className="text-accent underline">{n.c.map(renderInline)}</a>
  }
}
