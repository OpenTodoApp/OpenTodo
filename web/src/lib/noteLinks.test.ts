import { describe, expect, it } from 'vitest'
import vectors from '../../../internal/notelinks/testdata/links.vectors.json'
import { changedRows, LinkIndex, linksIn, refOf, resolveIn, snippetAround, worldOf, type World } from './noteLinks'
import type { Note, Project, Task } from './types'

describe('link grammar (shared links.vectors.json with internal/notelinks)', () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      expect(linksIn(c.markdown).map(({ kind, id, label }) => ({ kind, id, label }))).toEqual(c.links)
    })
  }

  it('gives each link its place in the text', () => {
    const text = 'a\n- see [Trip](?note=n1) soon'
    const [l] = linksIn(text)
    expect(text.slice(l.at, l.end)).toBe('[Trip](?note=n1)')
  })

  it('reads addresses', () => {
    expect(refOf('?task=a1')).toEqual({ kind: 'task', id: 'a1' })
    expect(refOf('?project=p')).toEqual({ kind: 'project', id: 'p' })
    expect(refOf('?note=x&y=1')).toBeNull()
    expect(refOf('https://x/?note=a')).toBeNull()
  })
})

const clock = (ts: number) => ({ description: { ts, device: 'd' } })
const task = (id: string, description = '', extra: Partial<Task> = {}): Task =>
  ({ id, title: `Task ${id}`, description, project_id: null, completed_at: null, deleted_at: null, _clock: clock(1), ...extra }) as unknown as Task
const project = (id: string, description = '', extra: Partial<Project> = {}): Project =>
  ({ id, name: `Project ${id}`, description, deleted_at: null, archived: false, _clock: clock(1), ...extra }) as unknown as Project
const note = (id: string, description = '', extra: Partial<Note> = {}): Note =>
  ({ id, title: `Note ${id}`, description, project_id: null, labels: [], position: 0, created_at: 1, deleted_at: null, _clock: clock(1), ...extra }) as unknown as Note

const keys = (idx: LinkIndex, kind: 'note' | 'task' | 'project', id: string) => idx.references(kind, id).map((r) => `${r.kind}:${r.id}`)

describe('link index', () => {
  it('lists the sources that link to an item, newest change first, never itself', () => {
    const w = worldOf(
      [task('t1', 'see [Trip](?note=n1)', { _clock: clock(5) } as Partial<Task>), task('t2', 'nothing')],
      [project('p1', '[x](?note=n1) [self](?project=p1)', { _clock: clock(9) } as Partial<Project>)],
      [note('n1', '[me](?note=n1)'), note('n2', 'Plan: [Trip](?note=n1) and [Call](?task=t2)', { _clock: clock(7) } as Partial<Note>)],
    )
    const idx = new LinkIndex()
    idx.buildNow(w)
    expect(keys(idx, 'note', 'n1')).toEqual(['project:p1', 'note:n2', 'task:t1'])
    expect(keys(idx, 'task', 't2')).toEqual(['note:n2'])
    expect(keys(idx, 'project', 'p1')).toEqual([])
    const ref = idx.references('task', 't2')[0]
    expect(ref.title).toBe('Note n2')
    expect(ref.snippet).toEqual({ before: 'Plan: Trip and ', link: 'Task t2', after: '' })
  })

  it('leaves out deleted sources and sources in a project in the Trash', () => {
    const w = worldOf([], [project('gone', '', { deleted_at: 3 } as Partial<Project>), project('p2', '[a](?note=x)', { deleted_at: 3 } as Partial<Project>)],
      [note('a', '[a](?note=x)', { project_id: 'gone' }), note('b', '[b](?note=x)', { deleted_at: 2 }), note('c', '[c](?note=x)')])
    const idx = new LinkIndex()
    idx.buildNow(w)
    expect(keys(idx, 'note', 'x')).toEqual(['note:c'])
  })

  it('resolves targets: renamed, in the Trash, missing (no access) and restored', () => {
    const tasks = [task('t1')]
    let w = worldOf(tasks, [project('p')], [note('n', '', { title: '' })])
    expect(resolveIn(w, 'task', 't1')?.title).toBe('Task t1')
    expect(resolveIn(w, 'note', 'n')?.title).toBe('Untitled note')
    // Missing on this device: never synced (no access) or purged; the same answer.
    expect(resolveIn(w, 'note', 'other')).toBeNull()
    expect(resolveIn(w, 'task', 'nope')).toBeNull()
    w = worldOf([task('t1', '', { title: 'Call the plumber' })], [project('p', '', { name: 'Renovation' })], [note('n', '', { deleted_at: 4 })])
    expect(resolveIn(w, 'task', 't1')?.title).toBe('Call the plumber')
    expect(resolveIn(w, 'project', 'p')?.title).toBe('Renovation')
    expect(resolveIn(w, 'note', 'n')).toBeNull()
    w = worldOf([], [project('p', '', { deleted_at: 1 })], [note('n', '', { project_id: 'p' })])
    expect(resolveIn(w, 'project', 'p')).toBeNull()
    expect(resolveIn(w, 'note', 'n')).toBeNull()
    w = worldOf([], [project('p')], [note('n', '', { project_id: 'p' })])
    expect(resolveIn(w, 'note', 'n')?.title).toBe('Note n')
  })

  it('works from decrypted rows like any other (an unlocked encrypted account)', () => {
    // The device's rows hold the decrypted projection; the raw ciphertext stays in _e2ee.
    const w = worldOf([task('t', '[Trip](?note=n)', { _e2ee: { raw: { description: 'enc:v1:AAAA' } } } as unknown as Partial<Task>)], [], [note('n')])
    const idx = new LinkIndex()
    idx.buildNow(w)
    expect(keys(idx, 'note', 'n')).toEqual(['task:t'])
  })

  it('a snippet keeps one line and highlights the link', () => {
    const text = 'Intro\n- [ ] book **ferry** for [Trip](?note=n) on Friday\nlast'
    expect(snippetAround(text, 'note', 'n', 'Holiday')).toEqual({ before: 'book ferry for ', link: 'Holiday', after: ' on Friday' })
  })

  it('follows changes incrementally and agrees with a full build (randomized)', () => {
    let seed = 7
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed % n
    }
    const ids = Array.from({ length: 30 }, (_, i) => `t${i}`)
    const noteIds = ['n0', 'n1', 'n2', 'n3']
    const text = () => {
      const parts: string[] = []
      for (let k = rand(3); k > 0; k--) {
        const kind = ['note', 'task', 'project'][rand(3)]
        const id = kind === 'note' ? noteIds[rand(4)] : kind === 'task' ? ids[rand(30)] : 'p0'
        parts.push(`[x](?${kind}=${id})`)
      }
      return parts.join(' ')
    }
    // Sorted by id, as the shared task snapshot is.
    let tasks: Task[] = ids.map((id) => task(id, text())).sort((a, b) => (a.id < b.id ? -1 : 1))
    let projects = [project('p0', text())]
    let notes = noteIds.map((id) => note(id, text()))
    let w = worldOf(tasks, projects, notes)
    const inc = new LinkIndex()
    inc.buildNow(w)
    for (let step = 0; step < 200; step++) {
      const r = rand(5)
      if (r < 3 && (tasks.length === 0 || rand(6) === 0)) {
        const added = task(`new${step}`, text())
        const next = [...tasks, added].sort((a, b) => (a.id < b.id ? -1 : 1))
        tasks = next
      } else if (r < 3) {
        const at = rand(tasks.length)
        const before = tasks[at]
        const after = rand(4) === 0 ? undefined : task(before.id, rand(2) ? text() : before.description, { title: `T${step}` })
        const next = tasks.slice()
        if (after) next[at] = after
        else next.splice(at, 1)
        tasks = next
      } else if (r === 3) {
        notes = notes.map((n) => (rand(3) === 0 ? note(n.id, text(), { deleted_at: rand(4) === 0 ? 1 : null }) : n))
      } else {
        projects = [project('p0', text())]
      }
      w = worldOf(tasks, projects, notes, w)
      inc.follow(w)
      const full = new LinkIndex()
      full.buildNow(w)
      expect(inc.edges()).toEqual(full.edges())
    }
  })

  it('finds the changed rows of two id-sorted lists by reference', () => {
    const a = task('a'), b = task('b'), c = task('c'), b2 = task('b', 'x')
    expect(changedRows([a, b], [a, b2, c])).toEqual([{ id: 'b', before: b, after: b2 }, { id: 'c', after: c }])
    expect(changedRows([a, b, c], [a, c])).toEqual([{ id: 'b', before: b }])
    expect(changedRows([b, a], [a])).toBeNull()
  })

  it('rebuilds when the task changes cannot be followed', () => {
    const w1: World = worldOf([task('a', '[x](?note=n)')], [], [note('n')])
    const idx = new LinkIndex()
    idx.buildNow(w1)
    // A list out of id order: the index builds again.
    const w2 = worldOf([task('b', '[y](?note=n)'), task('a', 'no link')], [], w1.notes, w1)
    idx.follow(w2)
    const full = new LinkIndex()
    full.buildNow(w2)
    return new Promise<void>((done) => {
      const check = () => {
        if (idx.edges().get('note:n')?.join() === 'task:b') {
          expect(idx.edges()).toEqual(full.edges())
          done()
        } else setTimeout(check, 5)
      }
      check()
    })
  })
})
