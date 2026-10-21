// node --test scripts/deploy/easypanel.test.mjs  (OpenSpec change platform-catalogs)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { configVariables, loadFacts, readText, ROOT } from './common.mjs'
import { check, checkTemplate, checkUpstream, DIR, FILES } from './easypanel.mjs'

const facts = loadFacts()
const ctx = { facts, configVars: configVariables(), changelog: readText('CHANGELOG.md') }
const files = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(ROOT, DIR, f))]))
const has = (errors, re) => assert.ok(errors.some((e) => re.test(e)), `expected an error matching ${re}, got:\n${errors.join('\n')}`)
const edit = (file, from, to) => {
  const text = files[file].toString('utf8')
  assert.ok(text.includes(from), `${file} does not contain ${from}`)
  return { ...files, [file]: Buffer.from(text.replace(from, to)) }
}
const IMAGE = 'default: ghcr.io/pixari/opentodo:0.9.0'

test('easypanel: the committed template passes', () => {
  assert.deepEqual(check(ctx), [])
  assert.deepEqual(checkTemplate(files, ctx), [])
})

test('easypanel: image policy release (specific versions only)', () => {
  for (const tag of ['latest', 'stable', '0.6', '0.6.0']) {
    has(checkTemplate(edit('meta.yaml', IMAGE, `default: ghcr.io/pixari/opentodo:${tag}`), ctx), /image must be ghcr\.io\/pixari\/opentodo:0\.9\.0/)
  }
  has(checkTemplate(edit('index.ts', 'image: input.appServiceImage', 'image: "ghcr.io/pixari/opentodo:0.9.0"'), ctx), /image source from input\.appServiceImage/)
})

test('easypanel: port and volume', () => {
  has(checkTemplate(edit('index.ts', 'port: 8080', 'port: 3000'), ctx), /port must be 8080, got 3000/)
  has(checkTemplate(edit('index.ts', 'mountPath: "/data"', 'mountPath: "/config"'), ctx), /mounted on \/data/)
  has(checkTemplate(edit('index.ts', 'type: "volume"', 'type: "bind"'), ctx), /volume mount/)
})

test('easypanel: variables and the generated setup token', () => {
  has(checkTemplate(edit('index.ts', '`OPENTODO_SETUP_TOKEN=${setupToken}`', '`OPENTODO_SETUP_TOKEN=changeme-changeme-123`'), ctx), /never hardcoded|is unused/)
  has(checkTemplate(edit('index.ts', 'randomString(32)', 'randomString(8)'), ctx), /at least 16 characters/)
  has(checkTemplate(edit('index.ts', 'https://$(PRIMARY_DOMAIN)', 'http://$(PRIMARY_DOMAIN)'), ctx), /must be https:\/\/\$\(PRIMARY_DOMAIN\)/)
  has(checkTemplate(edit('index.ts', '`OPENTODO_ALLOW_SIGNUP=false`', '`OPENTODO_ALLOW_SIGNUP=true`'), ctx), /defaults to "true", the catalogue says "false"/)
  has(checkTemplate(edit('index.ts', '        `OPENTODO_TRUSTED_PROXIES=`,\n', ''), ctx), /OPENTODO_TRUSTED_PROXIES must be offered/)
  has(checkTemplate(edit('index.ts', '`OPENTODO_TRUSTED_PROXIES=`,', '`OPENTODO_TRUSTED_PROXIES=`,\n        `OPENTODO_NOPE=1`,'), ctx), /OPENTODO_NOPE is not read by internal\/config/)
  has(checkTemplate(edit('index.ts', '`OPENTODO_TRUSTED_PROXIES=`,', '`OPENTODO_TRUSTED_PROXIES=`,\n        `OPENTODO_MCP=on`,'), ctx), /OPENTODO_MCP is not in the variable catalogue/)
})

test('easypanel: meta.yaml rules', () => {
  has(checkTemplate(edit('meta.yaml', '  - To-Do List\n', '  - Todo\n'), ctx), /tag Todo is not one of/)
  has(checkTemplate(edit('meta.yaml', '(OPENTODO_SETUP_TOKEN)', '(the token)'), ctx), /where the setup token is/)
  has(checkTemplate(edit('meta.yaml', 'url: https://github.com/pixari/opentodo\n', 'url: https://example.com\n'), ctx), /links needs Github/)
  has(checkTemplate(edit('meta.yaml', 'default: opentodo\n', 'default: todo\n'), ctx), /appServiceName must default to opentodo/)
  has(checkTemplate(edit('meta.yaml', 'name: OpenTodo', 'name: &n OpenTodo'), ctx), /not in the supported YAML subset/)
})

test('easypanel: assets and the easypanel-io/templates copy', () => {
  has(checkTemplate({ ...files, 'assets/logo.svg': Buffer.from('<svg/>') }, ctx), /logo\.svg must be identical to deploy\/coolify\/opentodo\.svg/)
  has(checkTemplate({ ...files, 'assets/screenshot.png': Buffer.from('RIFF....WEBP') }, ctx), /not a PNG/)
  const list = [...FILES].sort()
  assert.deepEqual(checkUpstream(files, files, list), [])
  has(checkUpstream(files, { ...files, 'index.ts': Buffer.from('x') }, list), /templates\/opentodo\/index\.ts must be identical/)
  has(checkUpstream(files, files, [...list, 'meta.ts']), /meta\.ts is generated/)
})
