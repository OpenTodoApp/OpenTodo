// The passphrase prompt of an encrypted account (obsidian-plugin D10).
import { Modal, type App } from 'obsidian'
import { tr } from './strings'

export interface UnlockAnswer {
  secret: string
  remember: boolean
}

/** Renders the prompt into `root`; `submit` resolves with the answer or an error message to show. */
export function renderUnlock(root: HTMLElement, submit: (a: UnlockAnswer) => Promise<string | null>, cancel: () => void): void {
  root.empty()
  root.createEl('h2', { text: tr('Unlock OpenTodo') })
  root.createEl('p', { text: tr('Your account is encrypted. Enter its passphrase (or recovery key) to send tasks from this device. The key stays in memory until Obsidian closes.') })
  const input = root.createEl('input', { type: 'password', attr: { 'aria-label': tr('Passphrase'), autocomplete: 'current-password' } })
  const rememberRow = root.createEl('label')
  const remember = rememberRow.createEl('input', { type: 'checkbox' })
  rememberRow.appendText(' ' + tr('Remember on this device'))
  root.createEl('p', { cls: 'setting-item-description', text: tr('Remembering keeps the account key in Obsidian’s storage on this device, so anyone who can open Obsidian here can read your tasks’ titles as they are sent.') })
  const error = root.createEl('p', { cls: 'mod-warning', attr: { role: 'alert' } })
  const bar = root.createDiv({ cls: 'modal-button-container' })
  const cancelBtn = bar.createEl('button', { text: tr('Cancel') })
  const ok = bar.createEl('button', { cls: 'mod-cta', text: tr('Unlock') })
  let busy = false
  const go = async () => {
    if (busy || !input.value) return
    busy = true
    ok.disabled = true
    error.textContent = tr('Unlocking…')
    const problem = await submit({ secret: input.value, remember: remember.checked })
    busy = false
    ok.disabled = false
    error.textContent = problem ?? ''
    if (problem) input.select()
  }
  ok.addEventListener('click', () => void go())
  cancelBtn.addEventListener('click', cancel)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void go()
    }
  })
  queueMicrotask(() => input.focus())
}

export function askUnlock(app: App, submit: (a: UnlockAnswer) => Promise<string | null>): void {
  new (class extends Modal {
    onOpen() {
      renderUnlock(this.contentEl, async (a) => {
        const problem = await submit(a)
        if (!problem) this.close()
        return problem
      }, () => this.close())
    }
    onClose() {
      this.contentEl.empty()
    }
  })(app).open()
}
