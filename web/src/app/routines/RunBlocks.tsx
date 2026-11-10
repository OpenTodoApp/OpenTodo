// A routine run's blocks (OpenSpec change assistant-routine-blocks, D2): what its
// Ask AI steps showed, rendered with the assistant's own block renderers from this
// device's rows, live and offline. The run keeps kinds and parameters only; a
// deleted task reads "removed" as in the chat. Lazy chunk: the Inbox card and the
// run's detail load it only for a run with blocks.
import { blockOf, type AssistantBlock } from '../../lib/assistantBlocks'
import type { RoutineRunBlock } from '../../lib/types'
import { BlockFrame } from '../assistant/blocks/AnswerContent'

export default function RunBlocks({ blocks }: { blocks: readonly RoutineRunBlock[] }) {
  const list = blocks.map((b) => blockOf(b as unknown as Record<string, unknown>)).filter((b): b is AssistantBlock => !!b)
  if (!list.length) return null
  return (
    <div data-run-blocks>
      {list.map((b, i) => <BlockFrame key={i} block={b} />)}
    </div>
  )
}
