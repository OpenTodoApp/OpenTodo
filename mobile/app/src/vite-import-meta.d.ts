// The Vite forms the shared library uses, as babel/vite-import-meta.js compiles them.
interface ImportMeta {
  glob<T = unknown>(patterns: string | string[], options?: { import?: string }): Record<string, () => Promise<T>>
  readonly env: { readonly MODE: string }
}
