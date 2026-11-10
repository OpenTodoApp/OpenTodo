// The Notes page's Graph mode (OpenSpec change notes-graph-page): the graph of the
// notes the list shows, built from the device's link index (offline, on an unlocked
// encrypted account, nothing sent), and what opening a node does: a standalone note
// or a task beside the graph, a project with its note. A lazy chunk, loaded when the
// mode is first shown.
import { useEffect, useMemo, useRef, type Ref } from 'react'
import { linkRows, useLinkIndex, type LinkIndex } from '../../lib/noteLinks'
import type { NoteEntry } from '../../lib/noteList'
import { buildGraph, sameGraph, type GraphNode, type NotesGraph as Graph, type Resolve } from '../../lib/notesGraph'
import { takeGraphCentre } from '../../lib/notesGraphPrefs'
import type { Task } from '../../lib/types'
import { hueFor, type HueName } from '../../ui'
import { closeTaskPanel, openTaskPanel, panelTaskId, setTaskSplit } from '../panel'
import { navigate } from '../router'
import { openNote } from '../notes/openNote'
import { GraphView, type GraphHandle } from './GraphView'

export interface NotesGraphProps {
  entries: readonly NoteEntry[]
  topic: ReadonlySet<string> | null
  topicKey: string
  matches: readonly string[] | null
  /** The standalone note open beside the graph. */
  openId?: string
  handle?: Ref<GraphHandle>
}

/** Reads a link target that has no note (a secondary node, D2) from the device's rows. */
function resolverOf(index: LinkIndex): Resolve {
  let tasks: Map<string, Task> | null = null
  return (kind, id) => {
    const target = index.target(kind, id)
    if (!target) return null
    let labels: readonly string[] | undefined
    if (kind === 'task') {
      tasks ??= new Map((linkRows()?.tasks ?? []).map((t) => [t.id, t]))
      labels = tasks.get(id)?.labels ?? []
    }
    return { title: target.title, projectId: target.projectId, labels, done: target.done }
  }
}

/** The graph, kept as the same object while it draws the same picture. */
function useGraph(entries: readonly NoteEntry[]): Graph | null {
  const live = useLinkIndex()
  const kept = useRef<Graph | null>(null)
  const index = live?.index ?? null
  const version = live?.version
  return useMemo(() => {
    if (!index) return null
    void version
    const next = buildGraph(entries, (fn) => index.forEachLink(fn), resolverOf(index))
    if (!kept.current || !sameGraph(kept.current, next)) kept.current = next
    return kept.current
  }, [entries, index, version])
}

export default function NotesGraph({ entries, topic, topicKey, matches, openId, handle }: NotesGraphProps) {
  const graph = useGraph(entries)
  const initialCentre = useMemo(() => takeGraphCentre(), [])
  // A task opened from the graph docks beside it from 1024 px (D4).
  useEffect(() => setTaskSplit(true), [])
  const projects = linkRows()?.projects
  const hueOf = useMemo(() => {
    const hues = new Map<string, HueName>((projects ?? []).map((p) => [p.id, hueFor(p.color)]))
    return (projectId: string | null) => (projectId ? hues.get(projectId) ?? null : null)
  }, [projects])
  const open = (node: GraphNode) => {
    if (node.kind === 'note') navigate({ view: 'notes', id: node.id, graph: true })
    else if (node.kind === 'task') {
      if (openId) navigate({ view: 'notes', graph: true })
      openTaskPanel(node.id)
    } else openNote({ source: 'project', id: node.id })
  }
  const closePane = () => {
    if (openId) {
      navigate({ view: 'notes', graph: true })
      return true
    }
    if (panelTaskId()) {
      closeTaskPanel()
      return true
    }
    return false
  }
  if (!graph) return <div className="notes-graph" data-notes-graph />
  return <GraphView graph={graph} topic={topic} topicKey={topicKey} matches={matches} hueOf={hueOf} onOpen={open} onClosePane={closePane} initialCentre={initialCentre} handle={handle} />
}
