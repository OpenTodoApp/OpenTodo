import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { resolveDraft } from '../../lib/theme/compute'
import { startHistory } from '../../lib/theme/draft'
import type { ThemeDocument } from '../../lib/theme/format'
import { importVsCodeTheme } from '../../lib/theme/vscode'
import type { LiveTheme } from '../../lib/theme/custom'
import nord from '../../lib/theme/builtin/nord.json'
import light from '../../lib/theme/builtin/opentodo-light.json'
import vscodeDark from '../../lib/theme/testdata/vscode/dark.json?raw'
import { withClock } from '../stories/fixtures'
import { ImportReport } from './ImportReport'
import { ThemeEditor } from './ThemeEditor'
import { PreviewSurface, type PreviewTab } from './ThemePreview'
import type { ThemeEditorActions, ThemeEditorState } from './useThemeEditor'
import { YourThemes } from './YourThemes'

// The theme editor (OpenSpec change theme-editor, design D3, D8, D9, D12): the page
// with two pairs below AA (two columns from 64 rem, the preview strip above the
// controls below), the four preview screens, Your themes with a low-contrast mark,
// and the VS Code import report.
const meta: Meta = { title: 'Settings/App/Theme editor', decorators: [withClock] }
export default meta

const DRAFT: ThemeDocument = {
  opentodoTheme: 1, id: 'story-theme', name: 'Morning paper', author: 'Ada', licence: 'CC0-1.0', kind: 'light',
  seeds: { ...(light as unknown as ThemeDocument).seeds, canvas: '#f3efe6', surface: '#fffdf8', accent: '#2f6f4f' },
  tokens: { faint: '#a9a49a' },
}
const noop = async () => null
const actions: ThemeEditorActions = {
  change: () => {}, undo: () => {}, redo: () => {}, undoToken: () => {}, save: async () => '', discard: () => {},
  resolveConflict: () => {}, fix: noop, fixAll: async () => 0,
}

function Editor({ doc }: { doc: ThemeDocument }) {
  const [state] = useState<ThemeEditorState>(() => ({
    status: 'ready', doc, saved: true, dirty: true, conflict: false, resolution: resolveDraft(doc), pending: false,
    canUndo: true, canRedo: false, history: startHistory(doc),
  }))
  return <ThemeEditor id={doc.id} state={state} actions={actions} />
}

/** A light theme with two set tokens below AA, the Contrast panel listing them with Fix. */
export const EditorWithWarnings: StoryObj = { render: () => <Editor doc={DRAFT} /> }

function Preview({ tab }: { tab: PreviewTab }) {
  const r = resolveDraft(nord as unknown as ThemeDocument).resolved
  return <div className="max-w-2xl"><PreviewSurface resolved={r} kind="dark" tab={tab} /></div>
}
/** The preview's four screens, drawn with Nord. */
export const PreviewList: StoryObj = { render: () => <Preview tab="list" /> }
export const PreviewBoard: StoryObj = { render: () => <Preview tab="board" /> }
export const PreviewWeek: StoryObj = { render: () => <Preview tab="calendar" /> }
export const PreviewTask: StoryObj = { render: () => <Preview tab="task" /> }

const live = (id: string, doc: ThemeDocument): LiveTheme => ({ id, doc: { ...doc, id }, position: 0, created_at: 0, deleted_at: null, _clock: {} })
/** Your themes: three custom themes, one marked low contrast. */
export const YourThemesList: StoryObj = {
  render: () => (
    <div className="max-w-3xl bg-surface p-4">
      <YourThemes themes={[live('a', DRAFT), live('b', { ...(nord as unknown as ThemeDocument), name: 'Nord (custom)' }), live('c', { ...DRAFT, name: 'Evening paper', kind: 'dark', seeds: { ...DRAFT.seeds, canvas: '#1f1d1a', surface: '#292621', text: '#ece6da' } })]}
        lowContrast={{ a: 2 }} takenNames={[]} onNew={() => {}} onTemplate={() => {}}
        actions={{ onUse: () => {}, onDuplicate: () => {}, onExport: () => {}, onDelete: () => {} }} />
    </div>
  ),
}

/** Your themes with none yet: the empty state and the actions, Download a template among them. */
export const YourThemesEmpty: StoryObj = {
  render: () => (
    <div className="max-w-3xl bg-surface p-4">
      <YourThemes themes={[]} lowContrast={{}} takenNames={[]} onNew={() => {}} onTemplate={() => {}}
        actions={{ onUse: () => {}, onDuplicate: () => {}, onExport: () => {}, onDelete: () => {} }} />
    </div>
  ),
}

/** The report of a dark VS Code theme: mapped keys, derived and ignored, contrast with Fix contrast now. */
export const VsCodeReport: StoryObj = {
  render: () => {
    const r = importVsCodeTheme(vscodeDark, 'harbour-night.json', undefined, 'story-vs')
    if (!r.ok) return <p>{r.message}</p>
    const failures = resolveDraft(r.doc).failures
    return <ImportReport report={r.report} failures={failures} onCancel={() => {}} onOpen={() => {}} />
  },
}
