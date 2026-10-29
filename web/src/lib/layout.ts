// Side-by-side layout of overlapping calendar blocks (OpenSpec `time-blocking`, design D3).
// Pure: a sweep line groups blocks into clusters of transitively overlapping blocks;
// inside a cluster each block takes the first free lane and the cluster is split into
// as many equal columns as it needs lanes. Clusters needing more than `maxLanes` keep
// `maxLanes - 1` lanes of blocks and use the last column for a "+N" overflow marker.
// A block is drawn at least `minLength` minutes tall (room for its title), so lanes
// follow the drawn length: short blocks close together sit side by side instead of
// covering each other (issue 526). `overlap` (the marker) still means the times overlap.

export interface BlockInput {
  id: string
  /** Minutes from midnight. */
  start: number
  /** Minutes from midnight, exclusive; a block ending at 10:00 does not overlap one starting at 10:00. */
  end: number
}

export interface PlacedBlock extends BlockInput {
  /** Column index inside its cluster, 0-based. */
  lane: number
  /** Number of columns its cluster is split into; the block's width is 1 / lanes. */
  lanes: number
  /** True when the block overlaps at least one other block. */
  overlap: boolean
  /** True when the cluster overflowed and this block is only reachable through the "+N" marker. */
  hidden: boolean
}

export interface Overflow {
  /** Lane of the marker (always the last column of its cluster). */
  lane: number
  lanes: number
  start: number
  end: number
  /** Hidden block ids in time order. */
  ids: string[]
}

export interface DayLayout {
  /** Every input block, in time order (start, then longer first, then id). */
  blocks: PlacedBlock[]
  overflow: Overflow[]
}

export const MAX_LANES = 4

export function layoutDay(input: readonly BlockInput[], maxLanes = MAX_LANES, minLength = 0): DayLayout {
  const cap = Math.max(2, Math.floor(maxLanes))
  const sorted = input
    .map((b) => ({ id: b.id, start: b.start, end: b.end > b.start ? b.end : b.start + 1 }))
    .sort((a, b) => a.start - b.start || b.end - a.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  /** Where a block's drawn box ends. */
  const drawnEnd = (b: BlockInput) => Math.max(b.end, b.start + minLength)
  const blocks: PlacedBlock[] = []
  const overflow: Overflow[] = []

  let cluster: { b: BlockInput; lane: number }[] = []
  let laneEnds: number[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (cluster.length === 0) return
    const needed = laneEnds.length
    // The marker: the block's own time overlaps another block's time.
    const overlaps = (x: BlockInput) => cluster.some(({ b }) => b !== x && b.start < x.end && x.start < b.end)
    if (needed <= cap) {
      for (const { b, lane } of cluster) blocks.push({ ...b, lane, lanes: needed, overlap: overlaps(b), hidden: false })
    } else {
      const markerLane = cap - 1
      const hidden: BlockInput[] = []
      for (const { b, lane } of cluster) {
        const hide = lane >= markerLane
        blocks.push({ ...b, lane: hide ? markerLane : lane, lanes: cap, overlap: overlaps(b), hidden: hide })
        if (hide) hidden.push(b)
      }
      overflow.push({
        lane: markerLane, lanes: cap,
        start: Math.min(...hidden.map((b) => b.start)), end: Math.max(...hidden.map((b) => b.end)),
        ids: hidden.map((b) => b.id),
      })
    }
    cluster = []
    laneEnds = []
    clusterEnd = -Infinity
  }

  for (const b of sorted) {
    if (b.start >= clusterEnd) flush()
    const end = drawnEnd(b)
    let lane = laneEnds.findIndex((e) => e <= b.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else laneEnds[lane] = end
    cluster.push({ b, lane })
    clusterEnd = Math.max(clusterEnd, end)
  }
  flush()
  return { blocks, overflow }
}
