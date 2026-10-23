// The visual filter builder (OpenSpec change filter-builder): the query as
// groups ("All of these", "Any of these") of conditions that read in words.
// The formula text stays the stored form (design D1): every edit here hands the
// screen a new formula, and every parseable formula re-derives the builder.
import { useRef, useState, type KeyboardEvent } from 'react'
import { Button, IconButton, Notice } from '../../ui'
import { parse } from '../../lib/filter'
import {
  MAX_DEPTH, builderQuery, formatQuery, newId, removeItem, replaceItem, toBuilder, updateGroup,
  type BCondition, type BGroup, type Leaf,
} from '../../lib/filter/builder'
import type { FieldDef, Label, Project } from '../../lib/types'
import { t } from '../../lib/i18n'
import { conditionText } from './conditionText'
import { ConditionEditor } from './ConditionEditor'

export interface FilterBuilderProps {
  /** The formula as typed; it may not parse. */
  query: string
  onChange: (query: string) => void
  /** Tasks the query matches, or null while unknown. */
  count: number | null
  labels: readonly Label[]
  projects: readonly Project[]
  fields: readonly FieldDef[]
}

type Derived = { kind: 'ok'; tree: BGroup } | { kind: 'unsupported' } | { kind: 'invalid' }

function derive(query: string): Derived {
  try {
    const tree = toBuilder(parse(query))
    return tree ? { kind: 'ok', tree } : { kind: 'unsupported' }
  } catch {
    return { kind: 'invalid' }
  }
}

/** The formula in canonical spacing, or null when it does not parse. */
function normalised(query: string): string | null {
  try {
    const ast = parse(query)
    return ast ? formatQuery(ast) : ''
  } catch {
    return null
  }
}

interface Editing { groupId: string; item: BCondition | null }

export function FilterBuilder({ query, onChange, count, labels, projects, fields }: FilterBuilderProps) {
  const [tree, setTree] = useState<BGroup>(() => {
    const d = derive(query)
    return d.kind === 'ok' ? d.tree : (toBuilder(null) as BGroup)
  })
  const [unsupported, setUnsupported] = useState(() => derive(query).kind === 'unsupported')
  const [editing, setEditing] = useState<Editing | null>(null)
  const root = useRef<HTMLDivElement>(null)

  // A typed change that parses re-derives the builder; an invalid one keeps the last builder.
  const typed = normalised(query)
  if (typed !== null && typed !== builderQuery(tree)) {
    const d = derive(query)
    if (d.kind === 'ok') { setTree(d.tree); if (unsupported) setUnsupported(false) }
    else if (d.kind === 'unsupported' && !unsupported) setUnsupported(true)
  } else if (typed !== null && unsupported && derive(query).kind === 'ok') {
    setUnsupported(false)
  }

  const commit = (next: BGroup) => {
    setTree(next)
    onChange(builderQuery(next))
  }

  if (unsupported) {
    return (
      <div data-filter-builder="unsupported" className="mb-2">
        <Notice>{t('This query uses more nesting than the builder shows. Edit it as text below.')}</Notice>
      </div>
    )
  }

  const save = (leaf: Leaf, not: boolean) => {
    if (!editing) return
    const item: BCondition = { type: 'condition', id: editing.item?.id ?? newId(), not, leaf }
    commit(editing.item ? replaceItem(tree, item.id, item) : updateGroup(tree, editing.groupId, (g) => ({ ...g, items: [...g.items, item] })))
    setEditing(null)
  }

  return (
    <div ref={root} data-filter-builder className="mb-2">
      <GroupBlock group={tree} depth={1} root tree={tree} commit={commit} onEdit={setEditing} />
      <p className="px-1 pt-1.5 text-meta text-muted" aria-live="polite" data-filter-count>
        {count === null ? ' ' : t('{n, plural, one {# task matches} other {# tasks match}}', { n: count })}
      </p>
      {editing && (
        <ConditionEditor leaf={editing.item?.leaf ?? null} not={editing.item?.not ?? false} labels={labels} projects={projects} fields={fields}
          onSave={save}
          onRemove={editing.item ? () => { commit(removeItem(tree, editing.item!.id)); setEditing(null) } : undefined}
          onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

interface GroupProps {
  group: BGroup
  depth: number
  root?: boolean
  tree: BGroup
  commit: (next: BGroup) => void
  onEdit: (e: Editing) => void
}

function GroupBlock({ group, depth, root, tree, commit, onEdit }: GroupProps) {
  const name = group.op === 'and' ? t('All of these') : t('Any of these')
  const setGroup = (patch: Partial<BGroup>) => commit(updateGroup(tree, group.id, (g) => ({ ...g, ...patch })))
  const addGroup = () => commit(updateGroup(tree, group.id, (g) => ({ ...g, items: [...g.items, { type: 'group', id: newId(), not: false, op: g.op === 'and' ? 'or' : 'and', items: [] }] })))

  // Arrows move between this group's chips; Delete or Backspace removes the focused one.
  const onChipKey = (e: KeyboardEvent<HTMLButtonElement>, item: BCondition) => {
    const list = e.currentTarget.closest('[data-filter-items]')
    const chips = list ? [...list.querySelectorAll<HTMLButtonElement>(':scope > li > [data-filter-chip] > button[data-chip-open]')] : []
    const i = chips.indexOf(e.currentTarget)
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? Math.min(chips.length - 1, i + 1) : Math.max(0, i - 1)
      chips[next]?.focus()
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      const after = chips[i + 1] ?? chips[i - 1]
      const afterId = after?.closest('[data-item-id]')?.getAttribute('data-item-id')
      commit(removeItem(tree, item.id))
      requestAnimationFrame(() => {
        const target = afterId ? list?.querySelector<HTMLButtonElement>(`[data-item-id="${afterId}"] button[data-chip-open]`) : null
        ;(target ?? list?.closest('[data-filter-group]')?.querySelector<HTMLButtonElement>('[data-add-condition]'))?.focus()
      })
    }
  }

  return (
    <section role="group" aria-label={group.not ? t('Not: {group}', { group: name }) : name} data-filter-group={group.op} data-depth={depth}
      className={root ? 'space-y-2' : 'space-y-2 rounded-card border border-default bg-sunken p-2 sm:p-3'}>
      {(!root || group.items.length > 1 || group.not) && (
        <div className="flex flex-wrap items-center gap-2">
          <select className="ui-input w-auto py-1 text-meta font-medium" aria-label={t('Combine the conditions')} value={group.op}
            onChange={(e) => setGroup({ op: e.target.value as 'and' | 'or' })}>
            <option value="and">{t('All of these')}</option>
            <option value="or">{t('Any of these')}</option>
          </select>
          <Button variant={group.not ? 'primary' : 'ghost'} size="sm" aria-pressed={group.not} onClick={() => setGroup({ not: !group.not })}>{t('Not')}</Button>
          {!root && <span className="flex-1" />}
          {!root && <IconButton icon="x" size="sm" label={t('Remove this group')} onClick={() => commit(removeItem(tree, group.id))} />}
        </div>
      )}
      {group.items.length === 0 && (
        <p className="px-1 text-meta text-faint">{root ? t('No conditions yet: every open task matches.') : t('Empty group: add a condition to it.')}</p>
      )}
      {group.items.length > 0 && (
        <ul data-filter-items className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
          {group.items.map((item) => (
            <li key={item.id} data-item-id={item.id} className={item.type === 'group' ? 'basis-full' : 'min-w-0'}>
              {item.type === 'group'
                ? <GroupBlock group={item} depth={depth + 1} tree={tree} commit={commit} onEdit={onEdit} />
                : <Chip item={item} onOpen={() => onEdit({ groupId: group.id, item })} onKey={(e) => onChipKey(e, item)}
                    onRemove={() => commit(removeItem(tree, item.id))} />}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon="plus" data-add-condition onClick={() => onEdit({ groupId: group.id, item: null })}>{t('Condition')}</Button>
        {depth < MAX_DEPTH && <Button variant="ghost" size="sm" icon="layers" onClick={addGroup}>{t('Group')}</Button>}
      </div>
    </section>
  )
}

function Chip({ item, onOpen, onKey, onRemove }: { item: BCondition; onOpen: () => void; onKey: (e: KeyboardEvent<HTMLButtonElement>) => void; onRemove: () => void }) {
  const text = conditionText(item.leaf)
  return (
    <span data-filter-chip data-not={item.not || undefined}
      className="flex min-h-9 w-full items-center gap-1 rounded-control border border-default bg-surface pl-3 pr-1 text-body shadow-1 sm:w-auto pointer-coarse:min-h-11">
      {/* Named by its visible text ("Not" and the condition), so speech and sight agree. */}
      <button type="button" data-chip-open className="flex min-w-0 flex-1 items-center gap-2 rounded-control py-1 text-left"
        onClick={onOpen} onKeyDown={onKey}>
        {item.not && <span className="shrink-0 rounded-chip bg-danger-soft px-1.5 text-hint font-semibold uppercase text-on-danger-soft">{t('Not')}</span>}
        <span className="min-w-0 truncate">{text}</span>
      </button>
      <IconButton icon="x" size="sm" label={t('Remove {condition}', { condition: text })} onClick={onRemove} tabIndex={-1} />
    </span>
  )
}
