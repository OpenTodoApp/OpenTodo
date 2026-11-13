// Live reads for the app's screens: the adapter reports the stores each committed write
// changed (src/storage/adapter.ts), and a screen reads again when one of its stores is
// among them. dexie-react-hooks' liveQuery is not live on SQLite.
import { useEffect, useRef, useState } from 'react'
import { db } from '@shared/db'
import type { SqliteDatabase } from '../storage/adapter'

/**
 * The result of `read`, read again after a write to any of `stores` and when `deps`
 * change; undefined until the first read answers.
 */
export function useLive<T>(read: () => Promise<T>, stores: readonly string[], deps: readonly unknown[]): T | undefined {
  const [value, setValue] = useState<T>()
  const latest = useRef(read)
  latest.current = read
  const key = stores.join(',')
  useEffect(() => {
    let run = 0
    let alive = true
    const load = () => {
      const mine = ++run
      latest.current().then((v) => { if (alive && mine === run) setValue(v) }, () => undefined)
    }
    load()
    const watched = new Set(key.split(','))
    const off = (db as unknown as SqliteDatabase).onChange((changed) => {
      for (const s of changed) if (watched.has(s)) return load()
    })
    return () => { alive = false; off() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller's deps decide when to read again
  }, [key, ...deps])
  return value
}
