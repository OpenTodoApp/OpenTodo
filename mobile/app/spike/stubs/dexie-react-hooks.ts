// The storage spike only: shared modules of the sync path import this hook at module
// level (task 4.5 settles which of them the app runs); the spike never calls it.
export function useLiveQuery(): never {
  throw new Error('storage spike: useLiveQuery is not available')
}
