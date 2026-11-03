// The budgets of scripts/perf/budgets.json and the verdict of one setting's
// samples, shared by run.mjs, the docs check and internal/perf (which reads the
// same file and writes the same report shape).
import { readFileSync } from 'node:fs'

export const BUDGETS = new URL('./budgets.json', import.meta.url)

export function loadBudgets(path = BUDGETS) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

const num = (x) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10)

/**
 * The report of one setting: each metric with a limit there, its runs, median and
 * verdict. A metric with a limit and no sample fails (the benchmark lost it).
 * The failure reads like the nightly alert: "first sync, desktop, 41 s, budget 30 s".
 */
export function evaluate(budgets, setting, samples, only = () => true) {
  const metrics = []
  for (const m of budgets.metrics) {
    if (!only(m.id)) continue
    const limit = m.limits[setting]
    if (limit === undefined) continue
    const runs = samples[m.id] ?? []
    const out = { id: m.id, name: m.name, unit: m.unit, runs, median: 0, limit, ok: false }
    if (runs.length === 0) out.failure = `${m.name}, ${setting}: not measured`
    else {
      out.median = num(median(runs))
      out.ok = out.median <= limit
      if (!out.ok) out.failure = `${m.name}, ${setting}, ${out.median} ${m.unit}, budget ${limit} ${m.unit}`
    }
    metrics.push(out)
  }
  return { setting, metrics }
}
