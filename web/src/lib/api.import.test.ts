import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'

type Call = { url: string; init: RequestInit }
let calls: Call[]
let respond: () => Response

beforeEach(() => {
  calls = []
  respond = () => new Response('{}', { status: 200 })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return respond()
  }))
})
afterEach(() => vi.unstubAllGlobals())

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('import API client', () => {
  it('uploads the file and the options as multipart for a preview', async () => {
    respond = () => json(200, { format: 'csv', totals: { rows: 1 }, rows: [], truncated: false, options: {} })
    const file = new Blob(['title\nA\n'], { type: 'text/csv' })
    const res = await api.previewImport(file, 'tasks.csv', { timeZone: 'Europe/Rome', duplicates: 'skip' })
    expect(res.format).toBe('csv')
    expect(calls[0].url).toBe('/api/v1/import/preview')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.credentials).toBe('same-origin')
    // No explicit Content-Type: the browser sets the multipart boundary.
    expect(calls[0].init.headers).toBeUndefined()
    const form = calls[0].init.body as FormData
    expect(JSON.parse(form.get('options') as string)).toEqual({ timeZone: 'Europe/Rome', duplicates: 'skip' })
    const sent = form.get('file') as File
    expect(sent.name).toBe('tasks.csv')
    expect(await sent.text()).toBe('title\nA\n')
  })

  it('starts a job, reads it and undoes it', async () => {
    respond = () => json(202, { job: { id: 'j1', status: 'running' } })
    const started = await api.startImport(new Blob(['x']), 'x.json', {})
    expect(started.job.id).toBe('j1')
    expect(calls[0].url).toBe('/api/v1/import')

    respond = () => json(200, { job: { id: 'j1', status: 'done' } })
    expect((await api.getImportJob('j1')).job.status).toBe('done')
    expect(calls[1].url).toBe('/api/v1/import/jobs/j1')

    respond = () => json(200, { jobs: [] })
    expect((await api.listImportJobs()).jobs).toEqual([])
    expect(calls[2].url).toBe('/api/v1/import/jobs')

    respond = () => json(200, { job: { id: 'j1', status: 'undone' } })
    expect((await api.undoImport('j1')).job.status).toBe('undone')
    expect(calls[3].url).toBe('/api/v1/import/jobs/j1/undo')
    expect(calls[3].init.method).toBe('POST')
  })

  it('surfaces server errors with their code', async () => {
    respond = () => json(413, { error: { code: 'too_large', message: 'the file exceeds the import limit of 20 MB' } })
    const err = await api.previewImport(new Blob(['x']), 'big.csv', {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(413)
    expect((err as ApiError).code).toBe('too_large')
  })
})
