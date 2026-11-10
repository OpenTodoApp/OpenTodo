// The storage spike's screen: asks the host what to do (seed or measure, candidate A
// or B), does it, draws the Today or Inbox list as a native list, and posts the
// result as JSON. The host is spike/host.mjs on the Mac running the simulator.
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Text, View } from 'react-native'
import type { Task } from '@shared/types'
import { measure, seed, type Candidate, type Rows } from './scenario'

const HOST = 'http://127.0.0.1:8099'

const post = (path: string, body: unknown) => fetch(`${HOST}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

function hermesStats(): unknown {
  const h = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => Record<string, number> } }).HermesInternal
  const s = h?.getInstrumentedStats?.()
  return s ? { heapMB: +((s.js_heapSize ?? 0) / 2 ** 20).toFixed(1), allocatedMB: +((s.js_allocatedBytes ?? 0) / 2 ** 20).toFixed(1), gcMs: s.js_gcTime } : null
}

export default function SpikeApp() {
  const [list, setList] = useState<readonly Task[]>([])
  const [status, setStatus] = useState('Starting')
  const drawn = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!drawn.current) return
    const done = drawn.current
    drawn.current = null
    requestAnimationFrame(() => done())
  }, [list])

  const draw = useCallback((tasks: readonly Task[]) => new Promise<void>((resolve) => {
    drawn.current = resolve
    setList(tasks)
  }), [])

  useEffect(() => {
    const frames = () => {
      let last = performance.now()
      let longest = 0
      let on = true
      const tick = () => {
        const n = performance.now()
        longest = Math.max(longest, n - last)
        last = n
        if (on) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      return () => { on = false; return Math.max(longest, performance.now() - last) }
    }
    const start = (globalThis as { __spikeStart?: number }).__spikeStart ?? 0
    void (async () => {
      const step = await (await fetch(`${HOST}/next`)).json() as { candidate: Candidate; phase: 'seed' | 'measure'; run?: number }
      const fetched = performance.now()
      try {
        if (step.phase === 'seed') {
          setStatus(`Seeding ${step.candidate}`)
          const rows = await (await fetch(`${HOST}/rows.json`)).json() as Rows
          const r = await seed(step.candidate, rows)
          await post('/result', { ...r, hermes: hermesStats() })
        } else {
          setStatus(`Measuring ${step.candidate}`)
          const r = await measure(step.candidate, { draw, frames }, start)
          await post('/result', { ...r, run: step.run, instructionFetchMs: Math.round(fetched - start), hermes: hermesStats() })
        }
        setStatus('Done')
      } catch (e) {
        const error = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e)
        await post('/result', { candidate: step.candidate, phase: step.phase, error })
        setStatus(error)
      }
    })()
  }, [draw])

  return (
    <View style={{ flex: 1, paddingTop: 60 }}>
      <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '600', paddingHorizontal: 16 }}>{status}</Text>
      <FlatList
        data={list as Task[]}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <Text numberOfLines={1} style={{ fontSize: 17, paddingHorizontal: 16, paddingVertical: 11 }}>{item.title}</Text>}
      />
    </View>
  )
}
