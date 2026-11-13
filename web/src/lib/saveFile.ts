// Saving a file the app made on the device (shell-repairs D1): the recovery key,
// recovery codes, an export of tracked time, a theme, a decrypted attachment.
// In a browser it is an anchor with `download`, as before. A web view ignores that,
// so in a shell that lists `files` the bytes go over the bridge in chunks and the
// shell opens the phone's save dialog. Every save in the app goes through here.
import { has, shell } from './shell'

/** `saved`: written (in a browser: handed to the browser). `cancelled`: the user closed the dialog. */
export type SaveResult = 'saved' | 'cancelled' | 'failed'

/** Bytes per bridge call, before base64. */
export const SAVE_CHUNK = 256 * 1024

/** One call of the bridge's `saveFile`: a chunk of the file `id`, in order; `last` ends it. */
export interface ShellFileChunk {
  id: string
  name: string
  type: string
  data: string
  last: boolean
}

let seq = 0
const failed = new Set<(name: string) => void>()

/** Called with the file's name when a save fails, so the app can say so. Returns the remover. */
export function onSaveFailed(listener: (name: string) => void): () => void {
  failed.add(listener)
  return () => { failed.delete(listener) }
}

function base64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** The bridge calls for a file, in order (an empty file is one empty last chunk). */
export function fileChunks(bytes: Uint8Array, id: string, name: string, type: string, size = SAVE_CHUNK): ShellFileChunk[] {
  const out: ShellFileChunk[] = []
  for (let at = 0; at === 0 || at < bytes.length; at += size) {
    out.push({ id, name, type, data: base64(bytes.subarray(at, at + size)), last: at + size >= bytes.length })
  }
  return out
}

async function throughShell(blob: Blob, name: string): Promise<SaveResult> {
  const s = shell()
  if (!s?.saveFile) return 'failed'
  const id = `${Date.now().toString(36)}-${++seq}`
  const chunks = fileChunks(new Uint8Array(await blob.arrayBuffer()), id, name, blob.type)
  for (const c of chunks) {
    const answer = await s.saveFile(JSON.stringify(c))
    if (c.last) return answer === 'saved' || answer === 'cancelled' ? answer : 'failed'
    if (answer !== 'more') return 'failed'
  }
  return 'failed'
}

function throughAnchor(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Save `blob` as a file called `name`. Never throws; a failure reaches `onSaveFailed`. */
export async function saveFile(blob: Blob, name: string): Promise<SaveResult> {
  let result: SaveResult = 'saved'
  try {
    if (has('files')) result = await throughShell(blob, name)
    else throughAnchor(blob, name)
  } catch {
    result = 'failed'
  }
  if (result === 'failed') for (const l of failed) l(name)
  return result
}
