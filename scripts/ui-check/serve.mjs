// Serves the static workbench build (web/storybook-static) on a free local port for
// the UI checks. No dependencies: node:http with a small content-type table.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json',
}

export async function serveStatic(root) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
    try {
      const body = await readFile(join(root, path.endsWith('/') ? `${path}index.html` : path))
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
}

/** Story entries from the workbench index (docs pages are skipped). */
export async function storyIds(root) {
  const index = JSON.parse(await readFile(join(root, 'index.json'), 'utf8'))
  return Object.values(index.entries).filter((e) => e.type === 'story').map((e) => e.id)
}

/** Playwright from the repo, or a global install (as scripts/e2e-layout.mjs does). */
export async function loadPlaywright(name = 'playwright') {
  return import(name).catch(async () => {
    const { createRequire } = await import('node:module')
    const { execSync } = await import('node:child_process')
    return createRequire(execSync('npm root -g').toString().trim() + '/')(name)
  })
}
