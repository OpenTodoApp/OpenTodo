// The release job's public image check (scripts/release/check-public-image.sh):
// a package left private on ghcr.io fails the release with a message about its
// visibility instead of every install failing with 401.
// Run: node --test scripts/release/check-public-image.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-public-image.sh')

// A registry where `opentodoapp/public` is public with the tag 1.2.3, and
// `opentodoapp/private` refuses an anonymous token.
function registry() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/token') {
      const scope = url.searchParams.get('scope')
      if (scope === 'repository:opentodoapp/public:pull') {
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ token: 'anon' }))
      }
      res.writeHead(403)
      return res.end('{"errors":[{"code":"DENIED"}]}')
    }
    const auth = req.headers.authorization
    if (url.pathname === '/v2/opentodoapp/public/manifests/1.2.3' && auth === 'Bearer anon') {
      res.writeHead(200)
      return res.end('{}')
    }
    res.writeHead(auth === 'Bearer anon' ? 404 : 401)
    res.end()
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

function run(server, repo, tag) {
  const { port } = server.address()
  return new Promise((resolve) => {
    const child = spawn('sh', [script, repo, tag], {
      env: { ...process.env, REGISTRY: `http://127.0.0.1:${port}`, ATTEMPTS: '2', DELAY: '0' },
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('close', (status) => resolve({ status, out }))
  })
}

test('a public package with the tag passes', async () => {
  const server = await registry()
  try {
    const r = await run(server, 'OpenTodoApp/public', '1.2.3')
    assert.equal(r.status, 0, r.out)
    assert.match(r.out, /can be pulled anonymously/)
  } finally {
    server.close()
  }
})

test('a private package fails and names its visibility', async () => {
  const server = await registry()
  try {
    const r = await run(server, 'opentodoapp/private', '1.2.3')
    assert.equal(r.status, 1)
    assert.match(r.out, /cannot be pulled without signing in \(anonymous token: HTTP 403/)
    assert.match(r.out, /probably private\. Make it public/)
  } finally {
    server.close()
  }
})

test('a missing tag fails and says the tag was not published', async () => {
  const server = await registry()
  try {
    const r = await run(server, 'opentodoapp/public', '9.9.9')
    assert.equal(r.status, 1)
    assert.match(r.out, /manifest: HTTP 404/)
    assert.match(r.out, /has no tag 9\.9\.9/)
  } finally {
    server.close()
  }
})
