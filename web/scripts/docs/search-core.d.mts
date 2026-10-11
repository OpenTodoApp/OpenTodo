// Types of search-core.mjs for the web app (the in-app Help view imports it).
export interface SearchIndex { pages: { t: string; u: string }[]; s: [number, string, string, string][] }
export interface SearchEntry { page: string; url: string; heading: string; text: string; title: string[]; head: string[]; body: string[] }
export interface SearchResult { page: string; heading: string; url: string; snippet: string }
export function normalize(s: string): string
export function stem(w: string): string
export function prepare(index: SearchIndex): SearchEntry[]
export function search(entries: SearchEntry[], query: string, limit?: number): SearchResult[]
export function snippet(text: string, terms: string[], size?: number): string
