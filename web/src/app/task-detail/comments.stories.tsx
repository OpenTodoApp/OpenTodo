import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useState } from 'react'
import type { Comment, ProjectMember } from '../../lib/types'
import { CommentsView } from './CommentsTab'

// Comments tab of the task panel (OpenSpec change task-detail-redesign, D5). Fixed
// times and a fixed "now", so the relative times never change.
const meta: Meta = { title: 'Task/Comments' }
export default meta

const NOW = Date.UTC(2025, 9, 14, 12)
const H = 3_600_000
const c = (id: string, author: string, ago: number, body: string, extra: Partial<Comment> = {}): Comment =>
  ({ id, task_id: 't1', parent_id: null, body, author_id: author, mentions: [], created_at: NOW - ago, edited_at: null, deleted_at: null, _clock: {}, ...extra } as Comment)
const members: ProjectMember[] = [
  { userId: 'u-ada', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' },
  { userId: 'u-bob', name: 'Bob Okafor', email: 'bob@example.com', role: 'editor' },
]
const names: Record<string, string> = { 'u-ada': 'You', 'u-bob': 'Bob Okafor' }
const noop = async () => true

export const ThreadWithReplies: StoryObj = {
  render: () => (
    <div className="max-w-md">
      <CommentsView taskId="story" me="u-ada" role="admin" members={members} name={(id) => names[id] ?? 'Someone'} now={NOW}
        onCreate={noop} onEdit={noop} onDelete={async () => {}} richComposer={false}
        threads={[
          { root: c('c1', 'u-bob', 26 * H, 'Can we move the **kick-off** to Thursday? The venue is booked on Wednesday.'),
            replies: [c('r1', 'u-ada', 25 * H, 'Thursday works. I will update the invite.', { parent_id: 'c1' }), c('r2', 'u-bob', 24 * H, '', { parent_id: 'c1', deleted_at: NOW - 23 * H })] },
          { root: c('c2', 'u-ada', 2 * H, 'Agenda draft is in the notes. @Bob please add the budget slide.', { edited_at: NOW - H }), replies: [] },
        ]} />
    </div>
  ),
}

export const Empty: StoryObj = {
  render: () => (
    <div className="max-w-md">
      <CommentsView taskId="story-empty" me="u-ada" role="admin" members={[]} name={() => 'You'} now={NOW} threads={[]}
        onCreate={noop} onEdit={noop} onDelete={async () => {}} richComposer={false} />
    </div>
  ),
}

/** Marks the story pending until `selector` is in the page (the lazy editor chunk). */
function Ready({ selector, children }: { selector: string; children: ReactNode }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = setInterval(() => {
      if (document.querySelector(selector)) {
        setReady(true)
        clearInterval(id)
      }
    }, 20)
    return () => clearInterval(id)
  }, [selector])
  return <>{children}{!ready && <span data-story-pending />}</>
}

// editor-everywhere: reactions under the comments, a table, a mention chip, an issue
// chip, and the expanded composer as the rich editor.
export const ReactionsAndRichComposer: StoryObj = {
  render: () => (
    <div className="max-w-md">
      <Ready selector="[data-rich-composer] .ProseMirror">
        <CommentsView taskId="story-rich" me="u-ada" role="admin" members={members} name={(id) => names[id] ?? 'Someone'} now={NOW}
          onCreate={noop} onEdit={noop} onDelete={async () => {}} onReact={() => {}}
          threads={[
            { root: c('c1', 'u-bob', 3 * H, 'Prices so far, @BobOkafor checked them:\n\n| Item | Cost |\n| --- | ---: |\n| Paint | 40 |\n| Brushes | 12 |', {
              reactions: { 'u-ada': ['thumbs_up', 'heart'], 'u-bob': ['thumbs_up'] } }), replies: [] },
            { root: c('c2', 'u-ada', H, 'Tracked in https://github.com/pixari/opentodo/issues/198', { reactions: { 'u-bob': ['eyes'] } }), replies: [] },
          ]} />
      </Ready>
    </div>
  ),
}
