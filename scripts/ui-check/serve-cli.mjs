// Serves the static workbench on UI_CHECK_PORT (default 6106) for the visual check.
// A request for a missing file (a source map, a favicon) answers 404 and nothing
// else: the file is read before any header is written, so a failure can never
// follow a sent header, and an unhandled error in the handler would otherwise end
// the process and refuse every request after it.
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const root = process.env.STORYBOOK_DIR ?? fileURLToPath(new URL('../../web/storybook-static', import.meta.url))
const port = Number(process.env.UI_CHECK_PORT ?? 6106)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json' }

export function filePath(url) {
  try {
    const path = normalize(decodeURIComponent(new URL(url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
    return path.endsWith('/') ? `${path}index.html` : path
  } catch {
    return null
  }
}

const server = createServer((req, res) => {
  const path = filePath(req.url ?? '/')
  const send = (status, type, body) => { if (!res.headersSent) res.writeHead(status, { 'content-type': type }); res.end(body) }
  if (!path) return send(400, 'text/plain', 'bad request')
  readFile(join(root, path))
    .then((body) => send(200, TYPES[extname(path)] ?? 'application/octet-stream', body))
    .catch(() => send(404, 'text/plain', 'not found'))
})
server.on('clientError', (_err, socket) => { if (!socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n') })
process.on('uncaughtException', (err) => console.error('ui-check server:', err))
process.on('unhandledRejection', (err) => console.error('ui-check server:', err))
server.listen(port, '127.0.0.1')
