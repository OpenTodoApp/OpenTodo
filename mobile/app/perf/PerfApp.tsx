// The performance run's screen: asks the host what to do (baseline, seed, measure, write
// or verify), does it, draws Today or Inbox as a native list, and posts the result as
// JSON. The host is perf/host.mjs on the Mac running the simulator.
import { useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, Text, View } from 'react-native'
import type { Task } from '@shared/types'
import { measure, seed, verify, write, type Rows } from './scenario'

const HOST = 'http://127.0.0.1:8099'

const post = (path: string, body: unknown) => fetch(`${HOST}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

function hermesStats(): unknown {
  const h = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => Record<string, number> } }).HermesInternal
  const s = h?.getInstrumentedStats?.()
  return s ? { heapMB: +((s.js_heapSize ?? 0) / 2 ** 20).toFixed(1), allocatedMB: +((s.js_allocatedBytes ?? 0) / 2 ** 20).toFixed(1), gcMs: s.js_gcTime } : null
}

type Step = { phase: 'baseline' | 'seed' | 'measure' | 'write' | 'verify'; run?: number; id?: string }

export default function PerfApp() {
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
    // The longest gap between frames on the JS thread while it runs.
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
    const g = globalThis as { __perfStart?: number; __perfStartedAt?: number }
    const start = g.__perfStart ?? 0
    const jsStartedAt = g.__perfStartedAt
    void (async () => {
      const asked = performance.now()
      const step = await (await fetch(`${HOST}/next`)).json() as Step
      // The harness's own request for the step, inside JS start to Today: reported apart.
      const instructionMs = Math.round(performance.now() - asked)
      try {
        setStatus(step.phase)
        let r: Record<string, unknown>
        if (step.phase === 'baseline') {
          await draw([])
          await new Promise((res) => setTimeout(res, 2000))
          r = { phase: 'baseline' }
        } else if (step.phase === 'seed') {
          r = await seed(await (await fetch(`${HOST}/rows.json`)).json() as Rows)
        } else if (step.phase === 'measure') {
          r = { ...(await measure({ draw, frames }, start)), run: step.run }
        } else if (step.phase === 'write') {
          r = await write()
        } else {
          r = await verify(step.id ?? '')
        }
        await post('/result', { ...r, jsStartedAt, instructionMs, hermes: hermesStats() })
        setStatus('Done')
      } catch (e) {
        const error = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ''}` : String(e)
        await post('/result', { phase: step.phase, error })
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
