// The Markdown renderer without the local database (the public task page uses it
// as it is; app/Markdown.tsx adds images and live task links from the device).
import { type ComponentType, Fragment, type ReactNode, useMemo } from 'react'
import { type Block, type Inline, LINK_REL, parseMarkdown } from '../lib/markdown'
import { originFromUrl } from '../lib/taskOrigin'
import { t } from '../lib/i18n'
import { Icon, Tooltip } from '../ui'

/** What the app resolves on the device: embedded attachments and links to tasks. */
export interface MarkdownEmbeds {
  Image: ComponentType<{ id: string; alt: string; taskId: string | null }>
  TaskLink: ComponentType<{ id: string; children: ReactNode }>
}

export interface MarkdownProps {
  source: string
  className?: string
  /** The task the text belongs to: only its attachments are shown as images. */
  taskId?: string | null
  /** Mention tokens of members (`@token` → display name), shown as chips. */
  mentions?: ReadonlyMap<string, string>
}

interface Ctx {
  taskId: string | null
  mentions: ReadonlyMap<string, string> | undefined
  embeds: MarkdownEmbeds | undefined
}

/**
 * Renders a comment body or a note's projection (lib/markdown.ts) as React
 * elements. Nothing is ever injected as HTML: text is text, and links open in a
 * new tab without referrer and marked nofollow/ugc (LINK_REL). Images come
 * only from the task's own attachments (OpenSpec editor-everywhere D5).
 */
export function MarkdownView({ source, className = '', taskId = null, mentions, embeds }: MarkdownProps & { embeds?: MarkdownEmbeds }) {
  const blocks = useMemo(() => parseMarkdown(source, 0, mentions?.size ? { mention: (token) => mentions.has(token) } : {}), [source, mentions])
  const ctx: Ctx = { taskId, mentions, embeds }
  return <div className={`markdown user-text space-y-2 ${className}`}>{blocks.map((b, i) => renderBlock(b, i, ctx))}</div>
}

/** Note headings sit under the page's h1: # is h2, ## h3, the rest h4. */
const HEADING: Record<number, { tag: 'h2' | 'h3' | 'h4'; cls: string }> = {
  1: { tag: 'h2', cls: 'text-h2 font-semibold text-strong' },
  2: { tag: 'h3', cls: 'text-h3 font-semibold text-strong' },
}

function renderBlock(b: Block, i: number, ctx: Ctx): ReactNode {
  const inl = (c: Inline[]) => c.map((n, k) => renderInline(n, k, ctx))
  switch (b.t) {
    case 'p':
      return <p key={i}>{inl(b.c)}</p>
    case 'pre':
      return <pre key={i} className="overflow-x-auto rounded-control bg-sunken dark:bg-raised p-2 font-mono text-meta" data-scroll-x data-lang={b.lang}><code>{b.v}</code></pre>
    case 'quote':
      return <blockquote key={i} className="space-y-2 border-l-2 border-input pl-2 text-muted">{b.c.map((x, k) => renderBlock(x, k, ctx))}</blockquote>
    case 'h': {
      const h = HEADING[b.level] ?? { tag: 'h4' as const, cls: 'text-body font-semibold text-strong' }
      const Tag = h.tag
      return <Tag key={i} className={h.cls}>{inl(b.c)}</Tag>
    }
    case 'table':
      // The table scrolls inside its own box; the page never scrolls sideways.
      return (
        <div key={i} className="max-w-full overflow-x-auto" data-scroll-x>
          <table className="md-table border-collapse text-meta">
            <thead><tr>{b.head.map((c, k) => <th key={k} style={b.align[k] ? { textAlign: b.align[k] as 'left' } : undefined} className="border border-default px-2 py-1 text-left font-semibold">{inl(c)}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} style={b.align[k] ? { textAlign: b.align[k] as 'left' } : undefined} className="border border-default px-2 py-1">{inl(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
    case 'img':
      return ctx.embeds ? <ctx.embeds.Image key={i} id={b.id} alt={b.alt} taskId={ctx.taskId} /> : <ImagePlaceholder key={i} text={t('Image')} alt={b.alt} />
    case 'list': {
      if (b.checks) {
        // Check items read as a list of read-only boxes; editing happens in the editor.
        return (
          <ul key={i} className="space-y-1 pl-1">
            {b.items.map((item, j) => (
              <li key={j} className="flex items-start gap-2" data-checked={b.checks![j] ?? undefined}>
                {b.checks![j] !== null && <input type="checkbox" disabled checked={!!b.checks![j]} className="mt-1 h-4 w-4 shrink-0" aria-label={b.checks![j] ? t('Done') : t('Not done')} />}
                <div className={`min-w-0 flex-1 space-y-2 ${b.checks![j] ? 'text-muted line-through' : ''}`}>{item.map((x, k) => renderBlock(x, k, ctx))}</div>
              </li>
            ))}
          </ul>
        )
      }
      const items = b.items.map((item, j) => <li key={j}>{item.map((x, k) => renderBlock(x, k, ctx))}</li>)
      return b.ordered
        ? <ol key={i} start={b.start} className="list-decimal space-y-1 pl-5">{items}</ol>
        : <ul key={i} className="list-disc space-y-1 pl-5">{items}</ul>
    }
  }
}

function renderInline(n: Inline, i: number, ctx: Ctx): ReactNode {
  const inl = (c: Inline[]) => c.map((x, k) => renderInline(x, k, ctx))
  switch (n.t) {
    case 'text': return <Fragment key={i}>{n.v}</Fragment>
    case 'br': return <br key={i} />
    case 'code': return <code key={i} className="rounded-control bg-sunken dark:bg-raised px-1 font-mono text-meta">{n.v}</code>
    case 'em': return <em key={i}>{inl(n.c)}</em>
    case 'strong': return <strong key={i}>{inl(n.c)}</strong>
    case 'strike': return <s key={i}>{inl(n.c)}</s>
    case 'mention':
      return <Tooltip key={i} label={ctx.mentions?.get(n.v) ?? `@${n.v}`}><span className="mention-chip" data-mention-token={n.v}>@{n.v}</span></Tooltip>
    case 'task':
      return ctx.embeds ? <ctx.embeds.TaskLink key={i} id={n.id}>{inl(n.c)}</ctx.embeds.TaskLink> : <Fragment key={i}>{inl(n.c)}</Fragment>
    case 'link': {
      const origin = originFromUrl(n.href)
      if (origin?.kind === 'issue' && origin.id) {
        // A recognised issue address reads as its id; recognition makes no request.
        return (
          <Tooltip key={i} label={n.href}>
            <a href={n.href} target="_blank" rel={LINK_REL} className="issue-chip">
              <Icon name="link" size="xs" />{origin.id}
            </a>
          </Tooltip>
        )
      }
      return <a key={i} href={n.href} target="_blank" rel={LINK_REL} className="text-accent underline">{inl(n.c)}</a>
    }
  }
}

/** Where an image would be: its state in words, announced with the alternative text. */
export function ImagePlaceholder({ text, alt, state, locked = false }: { text: string; alt: string; state?: string; locked?: boolean }) {
  return (
    <span role="img" aria-label={alt ? `${text}: ${alt}` : text} className="image-placeholder inline-flex items-center gap-2 rounded-control border border-dashed border-input px-2 py-1 text-meta text-muted" data-state={state}>
      <Icon name={locked ? 'lock' : 'image'} size="sm" />{text}
    </span>
  )
}
