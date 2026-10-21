// node --test scripts/templates-check.test.mjs (OpenSpec change template-library, tasks 1.2, 1.3, 3.3)
// One fixture per rule of the library check: each must fail and name the template, the file and the path.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { compileLibrary, compileTemplate } from './templates-build.mjs'
import { checkLibrary, personalData, readTemplate, repoRoot, sourceHash } from './templates-check.mjs'
import { parseYaml, YAML_TEMPLATE } from './deploy/yaml.mjs'

const ICONS = new Set(['plane', 'house', 'leaf'])
const BASE = `title: Garden season
summary: Sow, plant and harvest through the year.
description: |
  A season in the garden, from the first seeds to the harvest.
howToUse:
  - Start it in early spring.
makeItYours:
  - Add your own plants.
category: home
icon: leaf
author: OpenTodo
reviewed: 2026-10-15
labels:
  - name: outside
projects:
  - name: Garden
    sections:
      - name: Spring
        tasks:
          - title: Sow tomatoes
            due: +0d
            labels: [outside]
          - title: Plant out
            due: +8w
`

function lib(files, opts = {}) {
  const root = mkdtempSync(join(tmpdir(), 'tpl-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, 'templates', path.split('/')[0]), { recursive: true })
    writeFileSync(join(root, 'templates', path), text)
  }
  return checkLibrary(repoRoot, { dir: join(root, 'templates'), icons: ICONS, sectionStyle: false, languages: ['de', 'it'], ...opts })
}
const expectProblem = (res, re) => assert.ok(res.problems.some((p) => re.test(p)), `expected ${re} in:\n${res.problems.join('\n')}`)

test('a valid template passes and compiles', () => {
  const res = lib({ 'garden-season/template.yaml': BASE })
  assert.deepEqual(res.problems, [])
  const entry = compileTemplate(res.templates[0])
  assert.equal(entry.slug, 'garden-season')
  assert.deepEqual(entry.counts, { projects: 1, sections: 1, tasks: 2, labels: 1 })
  assert.deepEqual(entry.projects[0].sections[0].tasks[0], { title: { en: 'Sow tomatoes' }, due: '+0d', labels: [0] })
})

test('undeclared label names the template, file and path', () => {
  const res = lib({ 'moving-house/template.yaml': BASE.replace('labels: [outside]', 'labels: [boxes]') })
  expectProblem(res, /^moving-house\/template\.yaml: projects\[0\]\.sections\[0\]\.tasks\[0\]\.labels: label "boxes" is not declared$/)
})

test('field rules', () => {
  const cases = [
    [BASE.replace('title: Garden season', `title: ${'x'.repeat(61)}`), /: title: is 61 characters, at most 60/],
    [BASE.replace('category: home', 'category: garden'), /: category: must be one of/],
    [BASE.replace('icon: leaf', 'icon: tractor'), /: icon: "tractor" is not in the icon catalogue/],
    [BASE.replace('reviewed: 2026-10-15', 'reviewed: soon'), /: reviewed: must be a date/],
    [BASE.replace('due: +8w', 'due: next week'), /tasks\[1\]\.due: must be an offset/],
    [BASE.replace('due: +8w', 'time: 09:00'), /tasks\[1\]\.time: needs a due offset/],
    [BASE.replace('due: +8w', 'due: +8w\n            priority: 7'), /tasks\[1\]\.priority: must be 1, 2, 3 or 4/],
    [BASE.replace('due: +8w', 'due: +8w\n            owner: me'), /tasks\[1\]\.owner: unknown field/],
    [BASE.replace('makeItYours:\n  - Add your own plants.', 'makeItYours: []'), /: makeItYours: must list 1 to 5 steps/],
    [BASE.replace('author: OpenTodo\n', ''), /: author: is required/],
    [BASE + 'docs: [nowhere.md]\n', /: docs\[0\]: "nowhere.md" is not a page in docs\//],
    [BASE.replace('title: Garden season', 'title: "Garden'), /garden-season\/template\.yaml: line \d+:/],
  ]
  for (const [text, re] of cases) expectProblem(lib({ 'garden-season/template.yaml': text }), re)
})

test('personal data: e-mail, phone, non-https and links outside descriptions', () => {
  expectProblem(lib({ 'g/template.yaml': BASE.replace('title: Plant out', 'title: Plant out\n            description: call Anna on +39 333 1234567') }), /^g\/template\.yaml: projects\[0\]\.sections\[0\]\.tasks\[1\]\.description: holds a phone number$/)
  expectProblem(lib({ 'g/template.yaml': BASE.replace('title: Plant out', 'title: Mail anna@example.org') }), /tasks\[1\]\.title: holds an e-mail address/)
  expectProblem(lib({ 'g/template.yaml': BASE.replace('first seeds', 'first seeds, see http://example.org') }), /: description: holds a link that is not https/)
  expectProblem(lib({ 'g/template.yaml': BASE.replace('title: Plant out', 'title: Read https://example.org') }), /tasks\[1\]\.title: holds a URL/)
  assert.equal(personalData('See [the guide](https://open-todo.app/docs/).', true), null)
  assert.equal(personalData('Due in 2026, 3 tasks', false), null)
})

test('limits: tasks and file size', () => {
  const many = Array.from({ length: 201 }, (_, i) => `          - title: Task ${i}`).join('\n')
  expectProblem(lib({ 'g/template.yaml': BASE.replace(/        tasks:\n[\s\S]*$/, `        tasks:\n${many}\n`) }), /: projects: holds 201 tasks and subtasks, at most 200/)
  expectProblem(lib({ 'g/template.yaml': BASE + '# ' + 'x'.repeat(66 * 1024) + '\n' }), /g\/template\.yaml: is \d+ bytes, at most 65536/)
})

test('unique English titles across the library', () => {
  expectProblem(lib({ 'a/template.yaml': BASE, 'b/template.yaml': BASE }), /^b\/template\.yaml: title: "Garden season" is also the title of a$/)
})

test('translations: text only, known paths, known languages, stale warning', () => {
  const ok = lib({ 'g/template.yaml': BASE, 'g/it.yaml': 'title: Stagione dell\'orto\nprojects.0.sections.0.tasks.0.title: Semina i pomodori\n' })
  assert.deepEqual(ok.problems, [])
  const entry = compileTemplate(ok.templates[0])
  assert.deepEqual(entry.text.title, { en: 'Garden season', it: "Stagione dell'orto" })
  assert.deepEqual(entry.projects[0].sections[0].tasks[1].title, { en: 'Plant out' }, 'untranslated text falls back to English')
  assert.deepEqual(entry.languages, ['en', 'it'])
  expectProblem(lib({ 'trip-planning/template.yaml': BASE, 'trip-planning/de.yaml': 'projects.0.sections.0.tasks.5.title: Neu\n' }), /^trip-planning\/de\.yaml: projects\[0\]\.sections\[0\]\.tasks\[5\]\.title: is not in the English source/)
  expectProblem(lib({ 'g/template.yaml': BASE, 'g/xx.yaml': 'title: X\n' }), /^g\/xx\.yaml: unexpected file/)
  const hash = sourceHash(parseYaml(BASE, YAML_TEMPLATE))
  assert.deepEqual(lib({ 'g/template.yaml': BASE, 'g/it.yaml': `sourceHash: ${hash}\ntitle: Orto\n` }).warnings, [])
  const stale = lib({ 'g/template.yaml': BASE, 'g/it.yaml': 'sourceHash: sha-000000000000\ntitle: Orto\n' })
  assert.deepEqual(stale.problems, [])
  assert.match(stale.warnings[0], /^g\/it\.yaml: the English text changed since this translation/)
})

test('section colour and icon wait for icons-and-section-style (design D7)', () => {
  const styled = BASE.replace('      - name: Spring\n', '      - name: Spring\n        icon: leaf\n')
  expectProblem(lib({ 'g/template.yaml': styled }), /sections\[0\]\.icon: section colour and icon need the change icons-and-section-style/)
  assert.deepEqual(lib({ 'g/template.yaml': styled }, { sectionStyle: true }).problems, [])
  expectProblem(lib({ 'g/template.yaml': styled.replace('        icon: leaf', '        icon: tractor') }, { sectionStyle: true }), /sections\[0\]\.icon: "tractor" is not in the icon catalogue/)
})

test('the repository library is valid and its compiled file is current', () => {
  const { library, problems } = compileLibrary()
  assert.deepEqual(problems, [])
  assert.ok(library.templates.length >= 10)
  assert.equal(readFileSync(join(repoRoot, 'web/src/generated/templates.json'), 'utf8'), JSON.stringify(library, null, 1) + '\n', 'run `make templates`')
  const trip = library.templates.find((t) => t.slug === 'trip-planning')
  assert.deepEqual(trip.counts, { projects: 1, sections: 3, tasks: 10, labels: 2 })
})

test('readTemplate reports a missing template.yaml', () => {
  const root = mkdtempSync(join(tmpdir(), 'tpl-'))
  mkdirSync(join(root, 'empty'))
  assert.deepEqual(readTemplate(join(root, 'empty'), { icons: ICONS, sectionStyle: false, languages: [] }).problems, ['empty/template.yaml: missing'])
})
