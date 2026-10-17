import { liveQuery, type Subscription } from 'dexie'
import { useSyncExternalStore } from 'react'
import { attachmentCounts } from '../lib/attachments'
import { commentCounts } from '../lib/comments'
import { membershipMap } from '../lib/sharing'

// One shared live query per indicator on task rows (comments, attachments, whether
// the task's project is shared): every row reads the same map instead of opening
// its own query (large-list-performance).
function sharedCounts<V = number>(query: () => Promise<Map<string, V>>) {
  let counts = new Map<string, V>()
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
  return { subscribe, get: (taskId: string) => counts.get(taskId), has: (key: string) => counts.has(key) }
}

const comments = sharedCounts(commentCounts)
const attachments = sharedCounts(attachmentCounts)
const memberships = sharedCounts(membershipMap)
const noSubscribe = () => () => undefined

/** Live number of comments on a task (0 when none). */
export function useCommentCount(taskId: string): number {
  return useSyncExternalStore(comments.subscribe, () => comments.get(taskId) ?? 0, () => 0)
}

/** Live number of attachments on a task (0 when none; OpenSpec attachments). */
export function useAttachmentCount(taskId: string): number {
  return useSyncExternalStore(attachments.subscribe, () => attachments.get(taskId) ?? 0, () => 0)
}

/**
 * Whether a project is shared (has a cached membership), live; only read while
 * `enabled` (end-to-end encryption on), so rows open no query otherwise.
 */
export function useSharedProject(projectId: string | null | undefined, enabled: boolean): boolean {
  return useSyncExternalStore(enabled ? memberships.subscribe : noSubscribe, () => enabled && !!projectId && memberships.has(projectId), () => false)
}
