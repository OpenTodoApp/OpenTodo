// The Clarify move in place (loop-guided-dashboard D4, decided 2026-11-09): the full
// triage card on the first Inbox task, with its single-key decisions, embedded. Its
// keys are registered only while this move is open; Esc closes the move.
import { TriageCard } from '../../TriageView'
import type { MoveProps } from '../LoopHome'

export default function ClarifyMove({ onClose, onLeft }: MoveProps) {
  return (
    <div data-loop-part="clarify">
      <TriageCard onLeave={onClose} onLeft={onLeft} />
    </div>
  )
}
