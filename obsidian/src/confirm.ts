// A yes/no question in a modal: adopting a folder's notes, the plaintext notice
// of an encrypted account and taking a folder over (obsidian-vault-sync 4.1).
import { Modal, type App } from 'obsidian'
import { tr } from './strings'

export interface Question {
  title: string
  body: string[]
  ok: string
  warning?: boolean
}

export class ConfirmModal extends Modal {
  private answered = false

  constructor(app: App, private q: Question, private done: (yes: boolean) => void) {
    super(app)
  }

  onOpen(): void {
    const el = this.contentEl
    el.classList.add('opentodo-confirm')
    const h = document.createElement('h3')
    h.textContent = this.q.title
    el.append(h)
    for (const text of this.q.body) {
      const p = document.createElement('p')
      p.textContent = text
      el.append(p)
    }
    const row = document.createElement('div')
    row.className = 'modal-button-container'
    const cancel = document.createElement('button')
    cancel.textContent = tr('Cancel')
    cancel.addEventListener('click', () => this.close())
    const ok = document.createElement('button')
    ok.textContent = this.q.ok
    ok.className = this.q.warning ? 'mod-warning' : 'mod-cta'
    ok.addEventListener('click', () => {
      this.answered = true
      this.close()
      this.done(true)
    })
    row.append(cancel, ok)
    el.append(row)
  }

  onClose(): void {
    this.contentEl.replaceChildren()
    if (!this.answered) this.done(false)
  }
}

export function confirm(app: App, q: Question): Promise<boolean> {
  return new Promise((resolve) => new ConfirmModal(app, q, resolve).open())
}
