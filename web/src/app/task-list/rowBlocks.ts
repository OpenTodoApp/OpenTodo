// A long list's rows in blocks (OpenSpec change incremental-list-updates, design D5).
// The browser skips blocks far from the viewport (`content-visibility: auto` on the
// block, not on each row): with one rule per row, every frame of a 2,000-row list
// worked out which of 2,000 rows to skip (10-25 ms a frame in the phone profile,
// and more for each hit test), even when only one dot on screen changed. Blocks keep
// their rows from one drawing to the next, so a row that comes or goes moves no other
// row to another block (which would draw those rows again).

/** Rows of a new block; a block that grows past twice this is split. */
export const BLOCK_ROWS = 50
/** A list draws blocks from this many rows; under half of it again, plain rows. */
export const BLOCKS_FROM = 2 * BLOCK_ROWS

export interface RowBlock {
  key: string
  ids: string[]
}

/**
 * The rows `ids` (in order) in blocks, keeping each row in the block it was in
 * (`prev`: row id → block key, from the last call): a row that was in no block
 * joins the block before it, or starts one when that block is full; a block that
 * grew past twice its size is split. `newKey` names a new block.
 */
export function rowBlocks(ids: readonly string[], prev: ReadonlyMap<string, string>, newKey: () => string): RowBlock[] {
  const out: RowBlock[] = []
  const used = new Set<string>()
  const start = (key: string, id: string) => {
    used.add(key)
    out.push({ key, ids: [id] })
  }
  for (const id of ids) {
    const was = prev.get(id)
    const cur = out[out.length - 1]
    if (!cur) start(was ?? newKey(), id)
    else if (was !== undefined && was !== cur.key && !used.has(was)) start(was, id)
    else if (was === cur.key ? cur.ids.length >= 2 * BLOCK_ROWS : cur.ids.length >= BLOCK_ROWS && (was === undefined || cur.ids.length >= 2 * BLOCK_ROWS)) start(newKey(), id)
    else cur.ids.push(id)
  }
  return out
}

/** Row id → block key, for the next call. */
export function blockOf(blocks: readonly RowBlock[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const b of blocks) for (const id of b.ids) m.set(id, b.key)
  return m
}
