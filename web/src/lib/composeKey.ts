type ComposeEvent = { key: string; isComposing?: boolean; keyCode?: number; nativeEvent?: { isComposing?: boolean; keyCode?: number } }

/** Any key pressed while an input method is composing; it belongs to the input method, not the field. */
export function composing(e: ComposeEvent): boolean {
  const native = e.nativeEvent
  // Some browsers (Safari) report a composing key as key code 229 and leave isComposing false.
  return Boolean(e.isComposing || native?.isComposing || e.keyCode === 229 || native?.keyCode === 229)
}

/** Enter confirming a character in an input method, rather than committing the field. */
export function composingEnter(e: ComposeEvent): boolean {
  return e.key === 'Enter' && composing(e)
}
