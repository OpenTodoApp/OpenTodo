// The confirmation sheet (obsidian-plugin D7): what was recognised in each line,
// as removable chips, and the project, before anything is sent. Keyboard first:
// the first title has focus, Enter sends, Escape cancels, and the tab order is
// the reading order. Plain DOM with Obsidian's own classes, so it looks native
// and is tested with happy-dom (sheet.test.ts).
import { Modal, setIcon, type App } from 'obsidian'
import { chipsOf, MAX_LINES, removeChip, type Draft, type ReadContext } from './capture'
import { tr } from './strings'

export interface SheetProject {
  id: string
  name: string
  depth: number
}

export interface SheetOptions {
  drafts: Draft[]
  projects: SheetProject[]
  /** The plugin's default project, or null for the Inbox. */
  project: string | null
  ctx: ReadContext
  /** More lines than one send takes: the sheet says so and sends nothing. */
  tooMany?: number
  onSend: (drafts: Draft[], project: string | null) => void
  onCancel: () => void
}

function el<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, props: { cls?: string; text?: string; attr?: Record<string, string> } = {}): HTMLElementTagNameMap[K] {
  const e = parent.ownerDocument.createElement(tag)
  if (props.cls) e.className = props.cls
  if (props.text !== undefined) e.textContent = props.text
  for (const [k, v] of Object.entries(props.attr ?? {})) e.setAttribute(k, v)
  parent.appendChild(e)
  return e
}

/** Renders the sheet into `root`; returns a function that sends as if Enter was pressed. */
export function renderSheet(root: HTMLElement, o: SheetOptions): { send: () => void } {
  root.replaceChildren()
  root.classList.add('opentodo-sheet')
  const drafts = o.drafts.map((d) => ({ ...d }))
  const edited = new Set<number>()
  let finished = false
  const finish = (send: boolean) => {
    if (finished) return
    finished = true
    if (send) o.onSend(drafts.filter((d) => d.include && d.title.trim()), project.value === '' ? null : project.value)
    else o.onCancel()
  }

  el(root, 'h2', { text: tr('Send to OpenTodo') })
  if (o.tooMany !== undefined) {
    el(root, 'p', { text: tr('At most {max} lines can be sent at once; {n} are selected. Select fewer lines.', { max: MAX_LINES, n: o.tooMany }), attr: { role: 'alert' } })
    const bar = el(root, 'div', { cls: 'modal-button-container' })
    const close = el(bar, 'button', { text: tr('Close'), cls: 'mod-cta' })
    close.addEventListener('click', () => finish(false))
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault()
        finish(false)
      }
    })
    queueMicrotask(() => close.focus())
    return { send: () => finish(false) }
  }

  const list = el(root, 'div', { cls: 'opentodo-sheet-lines' })
  const projectNames = new Map(o.projects.map((p) => [p.id, p.name]))
  const renderRow = (row: HTMLElement, i: number) => {
    row.replaceChildren()
    const d = drafts[i]
    const head = el(row, 'div', { cls: 'opentodo-sheet-head' })
    if (drafts.length > 1) {
      const box = el(head, 'input', { attr: { type: 'checkbox', 'aria-label': tr('Send line {n}', { n: i + 1 }) } })
      box.checked = d.include
      box.addEventListener('change', () => {
        d.include = box.checked
        row.classList.toggle('is-excluded', !d.include)
      })
    }
    const title = el(head, 'input', { cls: 'opentodo-sheet-title', attr: { type: 'text', 'aria-label': tr('Title') } })
    title.value = d.title
    title.addEventListener('input', () => {
      d.title = title.value
      edited.add(i)
    })
    const chips = chipsOf(d.fields, (id) => projectNames.get(id))
    if (chips.length) {
      const wrap = el(row, 'div', { cls: 'opentodo-sheet-chips', attr: { role: 'list', 'aria-label': tr('Recognised') } })
      for (const c of chips) {
        const chip = el(wrap, 'span', { cls: 'opentodo-chip', attr: { role: 'listitem' } })
        el(chip, 'span', { text: c.text })
        const x = el(chip, 'button', { cls: 'clickable-icon opentodo-chip-remove', attr: { 'aria-label': tr('Remove {chip}', { chip: c.text }), type: 'button' } })
        setIcon(x, 'x')
        x.addEventListener('click', () => {
          const next = removeChip(d, c.id, o.ctx)
          drafts[i] = edited.has(i) ? { ...next, title: d.title } : next
          renderRow(row, i)
          row.querySelector<HTMLInputElement>('.opentodo-sheet-title')?.focus()
        })
      }
    }
    if (d.problems.length) {
      const ul = el(row, 'ul', { cls: 'opentodo-sheet-problems' })
      for (const p of d.problems) el(ul, 'li', { text: tr('Not sent: {problem}', { problem: p }) })
    }
  }
  drafts.forEach((_, i) => renderRow(el(list, 'div', { cls: 'opentodo-sheet-line' }), i))

  const field = el(root, 'div', { cls: 'setting-item' })
  el(field, 'label', { cls: 'setting-item-name', text: tr('Project'), attr: { for: 'opentodo-sheet-project' } })
  const project = el(field, 'select', { cls: 'dropdown', attr: { id: 'opentodo-sheet-project' } })
  el(project, 'option', { text: tr('Inbox'), attr: { value: '' } })
  for (const p of o.projects) el(project, 'option', { text: ' '.repeat(p.depth) + p.name, attr: { value: p.id } })
  const named = drafts.length === 1 ? drafts[0].fields.projectId : undefined
  const initial = named && projectNames.has(named) ? named : o.project && projectNames.has(o.project) ? o.project : ''
  project.value = initial

  const bar = el(root, 'div', { cls: 'modal-button-container' })
  const cancel = el(bar, 'button', { text: tr('Cancel'), attr: { type: 'button' } })
  const send = el(bar, 'button', { text: tr('Send'), cls: 'mod-cta', attr: { type: 'button' } })
  cancel.addEventListener('click', () => finish(false))
  send.addEventListener('click', () => finish(true))
  root.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null
    if (e.key === 'Escape') {
      e.preventDefault()
      finish(false)
    } else if (e.key === 'Enter' && !e.isComposing && target?.tagName !== 'BUTTON') {
      e.preventDefault()
      finish(true)
    }
  })
  queueMicrotask(() => root.querySelector<HTMLInputElement>('.opentodo-sheet-title')?.focus())
  return { send: () => finish(true) }
}

/** The sheet as an Obsidian modal; resolves with what to send, or null when cancelled. */
export function confirmSend(app: App, o: Omit<SheetOptions, 'onSend' | 'onCancel'>): Promise<{ drafts: Draft[]; project: string | null } | null> {
  return new Promise((resolve) => {
    let settled = false
    const modal = new (class extends Modal {
      onOpen() {
        renderSheet(this.contentEl, {
          ...o,
          onSend: (drafts, project) => {
            settled = true
            resolve({ drafts, project })
            this.close()
          },
          onCancel: () => this.close(),
        })
      }
      onClose() {
        this.contentEl.replaceChildren()
        if (!settled) resolve(null)
        settled = true
      }
    })(app)
    modal.open()
  })
}
