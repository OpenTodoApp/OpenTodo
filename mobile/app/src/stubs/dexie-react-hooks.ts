// dexie-react-hooks in the app (design D2, D4): shared modules of the sync path import
// useLiveQuery at module level for the web's screens, so Metro and Jest resolve the
// package here; the app's screens never call it and read again on the database's
// change event instead. Calling it is a mistake, so it throws.
export function useLiveQuery(): never {
  throw new Error('useLiveQuery is web-only: the app reads again on the database change event (src/storage)')
}
