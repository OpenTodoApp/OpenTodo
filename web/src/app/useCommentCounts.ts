import { liveQuery, type Subscription } from 'dexie'
import { useSyncExternalStore } from 'react'
import { attachmentCounts } from '../lib/attachments'
import { commentCounts } from '../lib/comments'

// One shared live query per indicator on task rows (comments, attachments):
// every row reads the same map instead of opening its own query.
function sharedCounts(query: () => Promise<Map<string, number>>) {
  let counts = new Map<string, number>()
  let sub: Subscription | null = null
  const listeners = new Set<() => void>()
  function subscribe(fn: () => void): () => void {
    listeners.add(fn)
    if (!sub) {
      sub = liveQuery(query).subscribe({
        next: (m) => {
          counts = m
          for (const l of listeners) l()
        },
        error: () => undefined,
      })
    }
    return () => {
      listeners.delete(fn)
      if (listeners.size === 0 && sub) {
        sub.unsubscribe()
        sub = null
      }
    }
  }
  return { subscribe, get: (taskId: string) => counts.get(taskId) ?? 0 }
}

const comments = sharedCounts(commentCounts)
const attachments = sharedCounts(attachmentCounts)

/** Live number of comments on a task (0 when none). */
export function useCommentCount(taskId: string): number {
  return useSyncExternalStore(comments.subscribe, () => comments.get(taskId), () => 0)
}

/** Live number of attachments on a task (0 when none; OpenSpec attachments). */
export function useAttachmentCount(taskId: string): number {
  return useSyncExternalStore(attachments.subscribe, () => attachments.get(taskId), () => 0)
}
