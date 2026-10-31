// The passphrase prompt of an encrypted account (obsidian-plugin D10).
import { Modal, type App } from 'obsidian'
import { tr } from './strings'

export interface UnlockAnswer {
  secret: string
  remember: boolean
}

/** Renders the prompt into `root`; `submit` resolves with the answer or an error message to show. */
export function renderUnlock(root: HTMLElement, submit: (a: UnlockAnswer) => Promise<string | null>, cancel: () => void): void {
  const doc = root.ownerDocument
  root.replaceChildren()
  const h = doc.createElement('h2')
  h.textContent = tr('Unlock OpenTodo')
  const p = doc.createElement('p')
  p.textContent = tr('Your account is encrypted. Enter its passphrase (or recovery key) to send tasks from this device. The key stays in memory until Obsidian closes.')
  const input = doc.createElement('input')
  input.type = 'password'
  input.setAttribute('aria-label', tr('Passphrase'))
  input.autocomplete = 'current-password'
  const rememberRow = doc.createElement('label')
  const remember = doc.createElement('input')
  remember.type = 'checkbox'
  rememberRow.append(remember, ' ' + tr('Remember on this device'))
  const hint = doc.createElement('p')
  hint.className = 'setting-item-description'
  hint.textContent = tr('Remembering keeps the account key in Obsidian’s storage on this device, so anyone who can open Obsidian here can read your tasks’ titles as they are sent.')
  const error = doc.createElement('p')
  error.className = 'mod-warning'
  error.setAttribute('role', 'alert')
  const bar = doc.createElement('div')
  bar.className = 'modal-button-container'
  const cancelBtn = doc.createElement('button')
  cancelBtn.textContent = tr('Cancel')
  const ok = doc.createElement('button')
  ok.className = 'mod-cta'
  ok.textContent = tr('Unlock')
  bar.append(cancelBtn, ok)
  root.append(h, p, input, rememberRow, hint, error, bar)
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
      this.contentEl.replaceChildren()
    }
  })(app).open()
}
