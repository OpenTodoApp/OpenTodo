/** Enter confirming a character in an input method, rather than committing the field. */
export function composingEnter(e: { key: string; isComposing?: boolean; keyCode?: number; nativeEvent?: { isComposing?: boolean; keyCode?: number } }): boolean {
  if (e.key !== 'Enter') return false
  const native = e.nativeEvent
  // Some browsers report a composing Enter as key code 229 and leave isComposing false.
  return Boolean(e.isComposing || native?.isComposing || e.keyCode === 229 || native?.keyCode === 229)
}
