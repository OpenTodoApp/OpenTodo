// Link, of Unlinked mentions (OpenSpec change unlinked-mentions, D3): the first plain
// mention of an item in a source note becomes a link node to the item, as an edit of the
// source's document written with its projection in one batch, so it merges with
// concurrent edits like any note edit; one Undo writes the earlier text back as the
// projection, which folds into the document as a history restore does.
import { Fragment, Slice } from 'prosemirror-model'
import { db, tableOf } from './db'
import { t } from './i18n'
import { matchTitle, mentionRange } from './noteMentions'
import { hrefOf, type LinkKind } from './noteLinks'
import { foldNote, getDeviceId } from './ops'
import { activeBody, decodeDoc, encodeDoc, renderMarkdown, toModel } from './richtext'
import { modelToPm, pmToModel, schema, writeBody } from './richtextEditor'
import { applyBatch } from './undo'

/**
 * Links the first plain mention of `title` in the source `kind:id` to `target`; the Undo
 * entry's id, or null when no mention is left (the row then leaves the list).
 */
export async function linkMention(source: { kind: LinkKind; id: string }, target: { kind: LinkKind; id: string; title: string }): Promise<string | null> {
  await foldNote(source.kind, source.id)
  const row = (await tableOf(source.kind).get(source.id)) as { notes_doc?: string; description?: string; deleted_at?: number | null } | undefined
  if (!row || row.deleted_at) return null
  const doc = decodeDoc(row.notes_doc ?? '')
  if (!doc) return null
  const pm = modelToPm(toModel(activeBody(doc)))
  // Matched again against the text as it is now (D3).
  const range = mentionRange(pm, matchTitle(target.title))
  if (!range) return null
  const node = schema.nodes.ref.create({ href: hrefOf(target.kind, target.id), label: target.title.trim() })
  const next = pm.replace(range.from, range.to, new Slice(Fragment.from(node), 0, 0))
  doc.transact(() => writeBody(activeBody(doc), next))
  const before = row.description ?? ''
  const label = t('Linked {title}', { title: target.title.trim() })
  await getDeviceId()
  const entry = await applyBatch([{ entity: source.kind, entityId: source.id, patch: { notes_doc: encodeDoc(doc), description: renderMarkdown(pmToModel(next)) } }], { source: 'action', label })
  if (!entry) return null
  // Undo writes the earlier text back as the projection only: the earlier document merged
  // into the edited one would keep the link (as Move the note out does, noteOps).
  entry.inverse = entry.inverse.map((inv) => (inv.entity === source.kind && inv.entityId === source.id ? { ...inv, patch: { description: before } } : inv))
  await db.assistantUndo.put(entry)
  return entry.id
}
