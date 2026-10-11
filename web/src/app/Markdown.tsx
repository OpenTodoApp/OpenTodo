import { Fragment, type ReactNode, useMemo } from 'react'
import { type Block, type Inline, LINK_REL, parseMarkdown } from '../lib/markdown'

/**
 * Renders a comment body (lib/markdown.ts) as React elements. Nothing is ever
 * injected as HTML: text is text, and links open in a new tab without referrer
 * and marked nofollow/ugc (LINK_REL).
 */
export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source])
  return <div className={`markdown space-y-2 break-words ${className}`}>{blocks.map(renderBlock)}</div>
}

function renderBlock(b: Block, i: number): ReactNode {
  switch (b.t) {
    case 'p':
      return <p key={i}>{b.c.map(renderInline)}</p>
    case 'pre':
      return <pre key={i} className="overflow-x-auto rounded bg-slate-100 p-2 font-mono text-xs dark:bg-slate-800"><code>{b.v}</code></pre>
    case 'quote':
      return <blockquote key={i} className="space-y-2 border-l-2 border-slate-300 pl-2 text-slate-500 dark:border-slate-600">{b.c.map(renderBlock)}</blockquote>
    case 'list': {
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
    case 'code': return <code key={i} className="rounded bg-slate-100 px-1 font-mono text-[0.85em] dark:bg-slate-800">{n.v}</code>
    case 'em': return <em key={i}>{n.c.map(renderInline)}</em>
    case 'strong': return <strong key={i}>{n.c.map(renderInline)}</strong>
    case 'link':
      return <a key={i} href={n.href} target="_blank" rel={LINK_REL} className="text-emerald-700 underline dark:text-emerald-300">{n.c.map(renderInline)}</a>
  }
}
