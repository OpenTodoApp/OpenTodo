// An answer with its blocks (OpenSpec change assistant-generative-ui D3, D4): the
// Markdown cut where the model called each display tool, and each block in a
// labelled frame with its own lazily loaded renderer, which reads the device's rows.
import { Component, lazy, Suspense, type ReactNode } from 'react'
import { blockLabel, splitAnswer, type AssistantBlock } from '../../../lib/assistantBlocks'
import type { AssistantMessage } from '../../../lib/assistant'
import { t } from '../../../lib/i18n'
import { Skeleton } from '../../../ui'
import { Markdown } from '../../Markdown'
import { ChoiceBlock, type ChoiceState } from './ChoiceBlock'

const TasksBlock = lazy(() => import('./TasksBlock'))
const CalendarBlock = lazy(() => import('./CalendarBlock'))
const MapBlock = lazy(() => import('./MapBlock'))
const NoteBlock = lazy(() => import('./NoteBlock'))
const ProjectBlock = lazy(() => import('./ProjectBlock'))

/** A block that fails to render (or whose chunk is gone after an upgrade) says so; the answer stays. */
class BlockBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p className="text-meta text-muted">{t('This part of the answer could not be shown.')}</p> : this.props.children
  }
}

function BlockBody({ block, choice }: { block: AssistantBlock; choice?: ChoiceState }) {
  switch (block.kind) {
    case 'tasks':
      return <TasksBlock block={block} />
    case 'calendar':
      return <CalendarBlock block={block} />
    case 'choice':
      return <ChoiceBlock block={block} state={choice} />
    case 'map':
      return <MapBlock block={block} />
    case 'note':
      return <NoteBlock block={block} />
    case 'project':
      return <ProjectBlock block={block} />
  }
}

/** One block in the answer: a labelled group naming its kind and size (spec "Blocks are accessible"). */
export function BlockFrame({ block, choice }: { block: AssistantBlock; choice?: ChoiceState }) {
  return (
    <div role="group" aria-label={blockLabel(block)} data-assistant-block={block.kind} className="my-2 overflow-hidden rounded-card border border-default bg-surface">
      <BlockBoundary>
        <Suspense fallback={<div className="p-3"><Skeleton shape="line" count={2} label={blockLabel(block)} /></div>}>
          <BlockBody block={block} choice={choice} />
        </Suspense>
      </BlockBoundary>
    </div>
  )
}

/** The text of an answer with its blocks where they arrived. */
export function AnswerContent({ text, blocks, choice }: { text: string; blocks?: AssistantMessage['blocks']; choice?: ChoiceState }) {
  if (!blocks?.length) return text ? <Markdown source={text} /> : null
  return (
    <>
      {splitAnswer(text, blocks).map((part, i) => (part.kind === 'text'
        ? <Markdown key={i} source={part.text} />
        : <BlockFrame key={i} block={part.block} choice={choice} />))}
    </>
  )
}
