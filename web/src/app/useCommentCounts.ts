import { liveQuery, type Subscription } from 'dexie'
import { useSyncExternalStore } from 'react'
import { commentCounts } from '../lib/comments'

// One shared live query for the comment indicator on task rows: every row reads
// the same map instead of opening its own query.
let counts = new Map<string, number>()
let sub: Subscription | null = null
const listeners = new Set<() => void>()

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  if (!sub) {
    sub = liveQuery(commentCounts).subscribe({
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

/** Live number of comments on a task (0 when none). */
export function useCommentCount(taskId: string): number {
  return useSyncExternalStore(subscribe, () => counts.get(taskId) ?? 0, () => 0)
}
