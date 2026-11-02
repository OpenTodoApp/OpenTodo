// The vault folder on Obsidian (obsidian-vault-sync task 3.2): the vault's
// DataAdapter for listing and for the hidden .opentodo/ folder (which Obsidian
// does not index), and Vault for the Markdown files, so Obsidian's index and an
// open editor see every change. A file is written through vault.process, and
// only when it still holds what the sync read: an edit made while the sync ran
// is never overwritten (the next sync merges it). The state file is written as
// state.json.tmp, then renamed over state.json. A file or folder the sync removes goes
// through FileManager.trashFile, so it lands where the user's "Deleted files"
// setting says (system trash, the vault's .trash or gone).
import { normalizePath, TFile, TFolder, type FileManager, type Vault } from 'obsidian'
import type { FileAdapter } from './types'

/** A path inside the folder that Obsidian does not index: a hidden file or folder. */
const hidden = (p: string) => p.split('/').some((part) => part.startsWith('.'))

export class ObsidianFiles implements FileAdapter {
  /** The folder, vault-relative, without a trailing slash ("" for the vault's root). */
  readonly root: string

  constructor(private vault: Vault, root: string, private fileManager: Pick<FileManager, 'trashFile'>) {
    const trimmed = root.replace(/^\/+|\/+$/g, '')
    this.root = trimmed === '' ? '' : normalizePath(trimmed)
  }

  full(p: string): string {
    return this.root === '' ? p : `${this.root}/${p}`
  }

  private rel(full: string): string {
    return this.root === '' ? full : full.slice(this.root.length + 1)
  }

  async list(): Promise<string[]> {
    const a = this.vault.adapter
    const out: string[] = []
    const start = this.root === '' ? '/' : this.root
    if (this.root !== '' && !(await a.exists(this.root))) return out
    const walk = async (dir: string) => {
      const l = await a.list(dir)
      for (const f of l.files) out.push(this.rel(f.replace(/^\/+/, '')))
      for (const d of l.folders) {
        const name = d.slice(d.lastIndexOf('/') + 1)
        if (!name.startsWith('.')) await walk(d)
      }
    }
    await walk(start)
    return out.sort()
  }

  async read(p: string): Promise<string | null> {
    const full = this.full(p)
    const f = this.vault.getAbstractFileByPath(full)
    if (f instanceof TFile) return this.vault.read(f)
    if (await this.vault.adapter.exists(full)) return this.vault.adapter.read(full)
    // A state write interrupted between its two steps left only the new file.
    if (p.endsWith('/state.json') && (await this.vault.adapter.exists(full + '.tmp'))) return this.vault.adapter.read(full + '.tmp')
    return null
  }

  private async folder(p: string): Promise<void> {
    const i = p.lastIndexOf('/')
    if (i <= 0) return
    const dir = p.slice(0, i)
    if (await this.vault.adapter.exists(dir)) return
    await this.folder(dir)
    if (hidden(dir)) await this.vault.adapter.mkdir(dir)
    else await this.vault.createFolder(dir).catch(() => this.vault.adapter.mkdir(dir))
  }

  /**
   * Writes a file. With expected, the file is written only while it still holds
   * that text (null: while it does not exist), so an edit made since the sync
   * read it stays; the result says whether it was written.
   */
  async write(p: string, text: string, expected?: string | null): Promise<boolean> {
    const full = this.full(p)
    const f = this.vault.getAbstractFileByPath(full)
    if (f instanceof TFile) {
      let written = false
      await this.vault.process(f, (data) => {
        if (expected !== undefined && data !== expected) return data
        written = true
        return text
      })
      return written
    }
    if (expected !== undefined && expected !== null) return false
    await this.folder(full)
    if (!hidden(p)) {
      try {
        await this.vault.create(full, text)
        return true
      } catch {
        // Not indexed yet but on disk: written below.
      }
    }
    await this.vault.adapter.write(full, text)
    return true
  }

  async writeAtomic(p: string, text: string): Promise<void> {
    const a = this.vault.adapter
    const full = this.full(p)
    await this.folder(full)
    await a.write(full + '.tmp', text)
    if (await a.exists(full)) await a.remove(full)
    await a.rename(full + '.tmp', full)
  }

  async remove(p: string): Promise<void> {
    const full = this.full(p)
    const f = this.vault.getAbstractFileByPath(full)
    if (f instanceof TFile) await this.fileManager.trashFile(f)
    else if (await this.vault.adapter.exists(full)) await this.vault.adapter.remove(full)
  }

  async removeDir(p: string): Promise<void> {
    const full = this.full(p)
    const a = this.vault.adapter
    if (!(await a.exists(full))) return
    const l = await a.list(full)
    if (l.files.length > 0 || l.folders.length > 0) return
    const f = this.vault.getAbstractFileByPath(full)
    if (f instanceof TFolder) await this.fileManager.trashFile(f)
    else await a.rmdir(full, false)
  }

  async exists(p: string): Promise<boolean> {
    return this.vault.adapter.exists(this.full(p))
  }
}
