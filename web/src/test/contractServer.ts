// Global setup of the contract tests (vitest.contract.config.ts): starts the
// server binary on a fresh data directory with sign-up open, and hands its URL
// to the tests (inject('serverUrl')). Stopped and removed after the run.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TestProject } from 'vitest/node'
import { startRecorder, writeRecordings } from './recorder'

declare module 'vitest' {
  export interface ProvidedContext {
    serverUrl: string
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const bin = path.resolve(process.env.OPENTODO_BIN ?? fileURLToPath(new URL('../../../bin/opentodo', import.meta.url)))
  if (!existsSync(bin)) throw new Error(`contract tests: no server binary at ${bin}; run \`make server\` or set OPENTODO_BIN`)
  const data = mkdtempSync(path.join(tmpdir(), 'opentodo-contract-'))
  const port = 18600 + Math.floor(Math.random() * 300)
  const url = `http://127.0.0.1:${port}`
  const out: Buffer[] = []
  const proc = spawn(bin, [], {
    env: { ...process.env, OPENTODO_DATA_DIR: data, OPENTODO_ADDR: `127.0.0.1:${port}`, OPENTODO_ALLOW_SIGNUP: 'true', OPENTODO_LOG_LEVEL: 'warn' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  proc.stdout.on('data', (d: Buffer) => out.push(d))
  proc.stderr.on('data', (d: Buffer) => out.push(d))
  const exited = new Promise<void>((resolve) => proc.on('exit', () => resolve()))
  let up = false
  for (let i = 0; i < 100 && proc.exitCode === null && !up; i++) {
    up = await fetch(`${url}/healthz`).then((r) => r.ok, () => false)
    if (!up) await new Promise((r) => setTimeout(r, 100))
  }
  if (!up) {
    proc.kill('SIGKILL')
    throw new Error(`contract tests: the server did not start:\n${Buffer.concat(out).toString()}`)
  }
  // RECORD_V1_CLIENTS=1 records the web client's calls for the client
  // compatibility test (stability-contract D5; scripts/record-v1-clients.sh).
  const recorder = process.env.RECORD_V1_CLIENTS === '1' ? await startRecorder(url) : null
  project.provide('serverUrl', recorder?.url ?? url)
  return async () => {
    if (recorder) {
      await recorder.close()
      writeRecordings(fileURLToPath(new URL('../../../internal/sync/testdata/v1_clients', import.meta.url)), recorder.pairs)
    }
    proc.kill('SIGTERM')
    await exited
    rmSync(data, { recursive: true, force: true })
  }
}
