// The theme editor's state (OpenSpec change theme-editor, design D7, D8): the
// working copy and its session history, kept as a draft on the device on every
// change; the resolution of the draft (derived in a worker, the latest change
// wins) with its failing pairs; Save, Discard and the per-token Undo; and the
// offer when the saved theme changed on another device meanwhile.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../lib/i18n'
import type { Resolution } from '../../lib/theme/compute'
import { saveCustomTheme, useCustomThemeRow } from '../../lib/theme/custom'
import { canRedo, canUndo, changedElsewhere, clearDraft, docText, isDirty, readDraft, record, redo, startHistory, undo, undoToken, writeDraft, type History } from '../../lib/theme/draft'
import type { ThemeDocument } from '../../lib/theme/format'
import { createResolver, type Resolver } from '../../lib/theme/resolver'

export interface ThemeEditorState {
  status: 'loading' | 'missing' | 'ready'
  doc: ThemeDocument | null
  /** The theme was saved before (Save updates it). */
  saved: boolean
  dirty: boolean
  /** The saved theme changed on another device while this draft was kept. */
  conflict: boolean
  resolution: Resolution | null
  /** A newer change is being derived. */
  pending: boolean
  canUndo: boolean
  canRedo: boolean
  history: History | null
}

export interface ThemeEditorActions {
  /** Applies a change; `group` merges a slider's drag into one history entry. */
  change: (doc: ThemeDocument, group?: string) => void
  undo: () => void
  redo: () => void
  undoToken: (token: string) => void
  /** Saves; resolves to the confirmation's text. */
  save: () => Promise<string>
  discard: () => void
  /** Keeps the draft over a version changed elsewhere, or loads the saved one. */
  resolveConflict: (keep: boolean) => void
  fix: (pair: { fg: string; bg: string }) => Promise<{ token: string; ratio?: number; movedOther: boolean } | null>
  fixAll: () => Promise<number>
}

export function useThemeEditor(id: string, resolverFactory: () => Resolver = createResolver): [ThemeEditorState, ThemeEditorActions] {
  const row = useCustomThemeRow(id)
  const live = row && !row.deleted_at && row.doc ? row.doc : null
  const [history, setHistory] = useState<History | null>(null)
  const [base, setBase] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [resolution, setResolution] = useState<Resolution | null>(null)
  const [pending, setPending] = useState(false)
  const resolver = useRef<Resolver | null>(null)
  if (!resolver.current) resolver.current = resolverFactory()
  useEffect(() => () => resolver.current?.dispose(), [])

  // Start once the row has been read: the draft on this device, else the saved theme.
  const started = history !== null
  useEffect(() => {
    if (started || row === undefined) return
    const draft = readDraft(id)
    if (draft) {
      setHistory(startHistory(draft.doc))
      setBase(draft.base)
      setConflict(changedElsewhere(draft, live))
    } else if (live) {
      setHistory(startHistory(live))
      setBase(docText(live))
    }
  }, [started, row, id, live])

  const present = history?.present ?? null
  // Every change: kept on the device, then derived (one request per frame; a newer one replaces it).
  useEffect(() => {
    if (!present) return
    if (isDirty({ ...present, id }, live)) writeDraft(id, { v: 1, doc: present, base })
    else clearDraft(id)
    let live2 = true
    setPending(true)
    const frame = requestAnimationFrame(() => {
      resolver.current!.resolve(present).then((r) => {
        if (!live2 || !r) return
        setResolution(r)
        setPending(false)
      }, () => { if (live2) setPending(false) })
    })
    return () => { live2 = false; cancelAnimationFrame(frame) }
    // `live` and `base` are read for the draft only; a change of them alone is no new draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, id])

  const change = useCallback((doc: ThemeDocument, group?: string) => setHistory((h) => (h ? record(h, doc, group) : h)), [])
  const actions: ThemeEditorActions = {
    change,
    undo: () => setHistory((h) => (h ? undo(h) : h)),
    redo: () => setHistory((h) => (h ? redo(h) : h)),
    undoToken: (token) => setHistory((h) => (h ? undoToken(h, token) : h)),
    save: async () => {
      if (!present) return ''
      await saveCustomTheme(id, present)
      clearDraft(id)
      setBase(docText({ ...present, id }))
      setConflict(false)
      const r = resolution ?? await resolver.current!.resolve(present)
      const n = r?.failures.length ?? 0
      return n ? t('{n, plural, one {Saved with # contrast warning} other {Saved with # contrast warnings}}', { n }) : t('Theme saved')
    },
    discard: () => {
      clearDraft(id)
      if (live) setHistory(startHistory(live))
    },
    resolveConflict: (keep) => {
      setConflict(false)
      if (keep) { setBase(docText(live)); return }
      clearDraft(id)
      if (live) { setHistory(startHistory(live)); setBase(docText(live)) }
    },
    fix: async (pair) => {
      if (!present) return null
      const r = await resolver.current!.fix(present, pair)
      if (!r) return null
      change(r.doc)
      return { token: r.fixes[0].token, ratio: r.ratio, movedOther: r.fixes[0].movedOther }
    },
    fixAll: async () => {
      if (!present) return 0
      const r = await resolver.current!.fixAll(present)
      if (r.fixes.length) change(r.doc)
      return r.fixes.length
    },
  }
  const state = useMemo<ThemeEditorState>(() => ({
    status: row === undefined || (!history && (readDraft(id) || live)) ? 'loading' : history ? 'ready' : 'missing',
    doc: present,
    saved: !!live,
    dirty: !!present && isDirty({ ...present, id }, live),
    conflict,
    resolution,
    pending,
    canUndo: !!history && canUndo(history),
    canRedo: !!history && canRedo(history),
    history,
  }), [row, history, id, live, present, conflict, resolution, pending])
  return [state, actions]
}
