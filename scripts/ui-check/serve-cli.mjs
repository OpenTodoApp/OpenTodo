// Serves the static workbench on UI_CHECK_PORT (default 6106) for the visual check.
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const root = process.env.STORYBOOK_DIR ?? fileURLToPath(new URL('../../web/storybook-static', import.meta.url))
const port = Number(process.env.UI_CHECK_PORT ?? 6106)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  try {
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(await readFile(join(root, path === '/' ? 'index.html' : path)))
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(port, '127.0.0.1')
