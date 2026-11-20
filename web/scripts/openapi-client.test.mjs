// "Build your client" (docs/api.md): generate TypeScript types from docs/openapi.json
// with openapi-typescript and type-check a small client program against them
// (scripts/openapi-client/example.ts), so a broken, renamed or loosened description
// fails here. openapi-typescript is a devDependency for this test only: the most used
// OpenAPI 3.1 to TypeScript generator, MIT, types only with no runtime, so the check is
// what a third party building a client would see rather than our own reading of the file.
// The generated types go to a temporary directory and are never committed.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import openapiTS, { astToString } from 'openapi-typescript'
import { afterAll, expect, it } from 'vitest'

const web = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'opentodo-openapi-client-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

it('a client generated from docs/openapi.json type-checks', async () => {
  const description = JSON.parse(readFileSync(join(web, '../docs/openapi.json'), 'utf8'))
  writeFileSync(join(dir, 'api.d.ts'), astToString(await openapiTS(description)))
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022', 'DOM'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        types: [],
        paths: { 'opentodo-api': [join(dir, 'api.d.ts')] },
      },
      files: [join(web, 'scripts/openapi-client/example.ts')],
    }),
  )
  let output = ''
  try {
    execFileSync(join(web, 'node_modules/.bin/tsc'), ['-p', join(dir, 'tsconfig.json')], { encoding: 'utf8' })
  } catch (err) {
    output = `${err.stdout}${err.stderr}`
  }
  expect(output).toBe('')
}, 60_000)
