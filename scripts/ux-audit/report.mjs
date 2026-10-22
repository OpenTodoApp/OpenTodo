// The audit report (OpenSpec change ux-audit-three-widths task 3.3, rubric D4):
// report.json with every capture and its violations, a summary by rule and by
// screen, the findings ranked by severity × frequency, and index.html, a contact
// sheet with no script and no external asset.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const RULES = {
  M1: { name: 'Accessibility (axe-core, serious and critical)', severity: 3 },
  M2: { name: 'Rows of chrome above the first item', severity: 2 },
  M3: { name: 'Task properties visible by default', severity: 2 },
  M4: { name: 'Primary sidebar destinations', severity: 2 },
  M5: { name: 'Vertical scroll regions', severity: 3 },
  M6: { name: 'Horizontal overflow', severity: 4 },
  M7: { name: 'Target size', severity: 3 },
  M8: { name: 'Focus visibility', severity: 3 },
  M9: { name: 'Contrast', severity: 3 },
  M10: { name: 'Truncation without the full text', severity: 3 },
  M11: { name: 'Overlapping controls', severity: 2 },
  M12: { name: 'Layout shift', severity: 2 },
  M13: { name: 'First interaction from the local copy', severity: 0 },
  M14: { name: 'Story coverage of core screens', severity: 3 },
  M15: { name: 'Movement under reduced motion', severity: 2 },
  NAV: { name: 'Screen did not open', severity: 4 },
}
/** Rules strict mode fails on (D6): deterministic DOM measurements. */
export const STRICT_RULES = ['M2', 'M3', 'M4', 'M5', 'M6', 'M14']
const FREQUENCY = { daily: 3, weekly: 2, rare: 1 }

/** Severity of the rule times the frequency of the screen (S × F, D4). */
export const score = (rule, frequency) => (RULES[rule]?.severity ?? 1) * (FREQUENCY[frequency] ?? 1)

/** Findings `{rule, id, count}` sorted by score, then by the number of captures showing them. */
export function rank(findings, frequencyById) {
  return findings
    .map((f) => ({ ...f, score: score(f.rule, frequencyById[f.id]) }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.id.localeCompare(b.id) || a.rule.localeCompare(b.rule))
}

/** Folds captures into the report's summary. */
export function summarize(captures, entries, extra = []) {
  const frequencyById = Object.fromEntries(entries.map((e) => [e.id, e.frequency]))
  const byRule = {}, byScreen = {}
  const groups = new Map()
  for (const c of captures) {
    for (const v of c.violations) {
      byRule[v.rule] = (byRule[v.rule] ?? 0) + 1
      byScreen[c.id] = (byScreen[c.id] ?? 0) + 1
      const key = `${v.rule}|${c.id}|${v.element}`
      const g = groups.get(key) ?? { rule: v.rule, id: c.id, element: v.element, detail: v.detail ?? '', count: 0, where: [], languageOnly: true }
      g.count++
      if (g.where.length < 6) g.where.push(`${c.width}px ${c.theme} ${c.lang}`)
      if (!v.languageOnly) g.languageOnly = false
      groups.set(key, g)
    }
  }
  for (const v of extra) {
    byRule[v.rule] = (byRule[v.rule] ?? 0) + 1
    groups.set(`${v.rule}|${v.id}|${v.element}`, { rule: v.rule, id: v.id, element: v.element, detail: v.detail ?? '', count: 1, where: ['repository'], languageOnly: false })
  }
  return { byRule, byScreen, ranked: rank([...groups.values()], frequencyById) }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** Writes report.json and index.html into `dir`. */
export function writeReport(dir, report, entries) {
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 1) + '\n')
  const ranked = report.summary.ranked.slice(0, 200).map((f, i) => `<tr><td>${i + 1}</td><td>${f.score}</td><td>${esc(f.rule)} ${esc(RULES[f.rule]?.name ?? '')}</td><td>${esc(f.id)}</td><td>${f.count}${f.languageOnly ? ' (German only)' : ''}</td><td><code>${esc(f.element)}</code> ${esc(f.detail)}<br><small>${esc(f.where.join(', '))}</small></td></tr>`).join('\n')
  const byId = new Map()
  for (const c of report.captures) (byId.get(c.id) ?? byId.set(c.id, []).get(c.id)).push(c)
  const rows = entries.filter((e) => byId.has(e.id)).map((e) => {
    const cells = byId.get(e.id).map((c) => `<figure><a href="${esc(c.shot)}"><img loading="lazy" src="${esc(c.shot)}" alt="${esc(`${e.id} ${c.width}px ${c.theme} ${c.lang}`)}"></a><figcaption>${c.width} ${c.theme} ${c.lang} · ${c.violations.length}</figcaption></figure>`).join('')
    return `<section><h3>${esc(e.id)} <small>${esc(e.frequency)}${e.core ? ', core' : ''}</small></h3><div class="row">${cells}</div></section>`
  }).join('\n')
  const timings = (report.firstInteraction ?? []).map((t) => `<li>${esc(t.id)}: ${t.ms == null ? 'did not render' : `${t.ms} ms`}</li>`).join('')
  const rules = Object.entries(report.summary.byRule).sort((a, b) => b[1] - a[1]).map(([r, n]) => `<li>${esc(r)} ${esc(RULES[r]?.name ?? '')}: ${n}</li>`).join('')
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Interface audit</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:16px;color:#1f2328;background:#fff}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #d0d7de;padding:4px 6px;text-align:left;vertical-align:top}code{font-size:12px;word-break:break-all}.row{display:flex;gap:8px;overflow-x:auto}figure{margin:0;flex:none}img{width:160px;border:1px solid #d0d7de}figcaption{font-size:12px;color:#57606a}@media (prefers-color-scheme: dark){body{background:#0d1117;color:#e6edf3}td,th,img{border-color:#30363d}figcaption{color:#8d96a0}}</style></head>
<body><h1>Interface audit</h1><p>${esc(report.run.started)} · ${report.captures.length} captures · ${report.summary.ranked.length} findings${report.strict ? ' · strict mode' : ''}</p>
<h2>Violations by rule</h2><ul>${rules}</ul>
<h2>First interaction from the local copy (server stopped)</h2><ul>${timings || '<li>not measured</li>'}</ul>
<h2>Ranked findings</h2><table><thead><tr><th>#</th><th>Score</th><th>Rule</th><th>Screen</th><th>Captures</th><th>Element</th></tr></thead><tbody>${ranked}</tbody></table>
<h2>Contact sheet</h2>${rows}</body></html>\n`
  writeFileSync(join(dir, 'index.html'), html)
}
