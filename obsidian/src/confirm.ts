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
    el.addClass('opentodo-confirm')
    this.setTitle(this.q.title)
    for (const text of this.q.body) el.createEl('p', { text })
    const row = el.createDiv({ cls: 'modal-button-container' })
    const cancel = row.createEl('button', { text: tr('Cancel') })
    cancel.addEventListener('click', () => this.close())
    const ok = row.createEl('button', { text: this.q.ok, cls: this.q.warning ? 'mod-warning' : 'mod-cta' })
    ok.addEventListener('click', () => {
      this.answered = true
      this.close()
      this.done(true)
    })
  }

  onClose(): void {
    this.contentEl.empty()
    if (!this.answered) this.done(false)
  }
}

export function confirm(app: App, q: Question): Promise<boolean> {
  return new Promise((resolve) => new ConfirmModal(app, q, resolve).open())
}
