// Copying text to the clipboard (issue 525). The asynchronous Clipboard API
// exists only in secure contexts (https, localhost), so on a self-hosted server
// opened by its LAN address over plain http `navigator.clipboard` is undefined
// and every Copy button did nothing. copyText uses the API where it exists and
// otherwise the older `execCommand('copy')` on a hidden text field, which
// browsers still allow during a click. It resolves once the text is on the
// clipboard and rejects when neither way worked, so callers keep one success
// path and one error path (with the manual-copy hint) for both.

/** Puts `text` on the clipboard; rejects when the browser refuses. */
export async function copyText(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Denied (no focus, a permission policy): the fallback may still work.
    }
  }
  if (!copyWithSelection(text)) throw new Error('clipboard unavailable')
}

/** The pre-Clipboard-API copy: select a hidden field and run the copy command. */
function copyWithSelection(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  const active = document.activeElement as HTMLElement | null
  // Inside a modal dialog, so its focus trap does not pull focus away from the field.
  const host = active?.closest('[role="dialog"], [role="alertdialog"]') ?? document.body
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.setAttribute('aria-hidden', 'true')
  field.style.position = 'fixed'
  field.style.top = '0'
  field.style.left = '0'
  field.style.opacity = '0'
  host.append(field)
  const selection = document.getSelection()
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  let ok = false
  try {
    field.select()
    field.setSelectionRange(0, text.length)
    ok = document.execCommand('copy')
  } catch {
    ok = false
  } finally {
    field.remove()
    if (range && selection) {
      selection.removeAllRanges()
      selection.addRange(range)
    }
    active?.focus?.({ preventScroll: true })
  }
  return ok
}
