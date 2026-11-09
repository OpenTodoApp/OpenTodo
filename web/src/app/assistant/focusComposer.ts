/** Puts the cursor in the assistant's composer (a starter, Edit, a choice's "Something else"). */
export function focusComposer() {
  requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[data-assistant-composer]')?.focus())
}
