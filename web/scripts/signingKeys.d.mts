export const repoRoot: string
export function officialKeys(root?: string): { refuse: boolean; keys: { spki: string; role: string }[] }
export function publicSpki(pem: string): string
export function buildKeys(env?: Record<string, string | undefined>, root?: string): { keys: { spki: string; role: string }[]; refuse: boolean; official: string[] }
