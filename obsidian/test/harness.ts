// A loaded plugin on a fake app and a fake server, for the flow tests.
import OpenTodoPlugin from '../src/main'
import type { LineEditor } from '../src/after'
import { FakeServer, type FakeOptions } from './fakeServer'
import { App, notices, setRequestHandler } from './obsidian'

export async function loaded(o: FakeOptions & { app?: App } = {}) {
  const server = new FakeServer(o)
  setRequestHandler(server.handle)
  notices.length = 0
  const app = o.app ?? new App()
  const plugin = new OpenTodoPlugin(app as never, { id: 'opentodo', version: '0.20.0' } as never)
  await plugin.onload()
  return { app, plugin, server }
}

export async function connected(o: FakeOptions & { app?: App } = {}) {
  const h = await loaded(o)
  await h.plugin.connectWith('todo.example.com', h.server.token)
  return h
}

/** An editor over an array of lines, with Obsidian's replaceRange semantics. */
export function memoryEditor(text: string): LineEditor & { text(): string } {
  let doc = text
  const offset = (p: { line: number; ch: number }) => {
    const lines = doc.split('\n')
    let o = 0
    for (let i = 0; i < p.line; i++) o += lines[i].length + 1
    return o + p.ch
  }
  return {
    getLine: (n) => doc.split('\n')[n] ?? '',
    lineCount: () => doc.split('\n').length,
    replaceRange: (t, from, to) => {
      const a = offset(from)
      const b = to ? offset(to) : a
      doc = doc.slice(0, a) + t + doc.slice(b)
    },
    text: () => doc,
  }
}

/** Waits until a condition holds (pushes run in the background). */
export async function until(cond: () => boolean, ms = 2000): Promise<void> {
  const end = performance.now() + ms
  while (!cond()) {
    if (performance.now() > end) throw new Error('condition not met in time')
    await new Promise((r) => setTimeout(r, 5))
  }
}
