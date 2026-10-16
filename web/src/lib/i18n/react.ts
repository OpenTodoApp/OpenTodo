// React bindings of the message layer (OpenSpec change app-localization, design D2).
import { useSyncExternalStore, type ReactNode } from 'react'
import { languageVersion, onLanguageChange, t, type RichValues, type TFunction } from './catalog'

/** The translate function; re-renders the caller when the language changes. */
export function useT(): TFunction {
  useSyncExternalStore(onLanguageChange, languageVersion, languageVersion)
  return t
}

/** The active language version, for memo keys that hold translated text. */
export function useLanguageVersion(): number {
  return useSyncExternalStore(onLanguageChange, languageVersion, languageVersion)
}

/**
 * A message as an element: `<T values={{ b: (s) => <b>{s}</b> }}>{'Press <b>Save</b>'}</T>`.
 * The children are the English source text.
 */
export function T({ children, values }: { children: string; values?: RichValues }): ReactNode {
  useT()
  return t.rich(children, values)
}
