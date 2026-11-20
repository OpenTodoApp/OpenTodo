// A small API client written only against the types openapi-typescript generates
// from docs/openapi.json (openapi-client.test.mjs generates them into a temporary
// directory as the module 'opentodo-api' and type-checks this file; it never runs).
// It uses real paths and fields, so a renamed path or field, a lost type or a
// loosened schema in the description fails the check.
import type { components, paths } from 'opentodo-api'

type Json<R> = R extends { content: { 'application/json': infer T } } ? T : never
// The success body: 200, or 201 for a create (the server answers 201 and the description says so).
type Ok<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { responses: { 200: infer R } } ? Json<R>
  : paths[P][M] extends { responses: { 201: infer R } } ? Json<R> : never
type Body<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { requestBody?: infer B } ? Json<NonNullable<B>> : never
type ApiError = components['schemas']['Error']

// Exact type assertions: a field whose type widens (to unknown, any, never) or changes fails.
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false
function expectType<T>(_value: T): <U>(check: Equal<T, U>) => void {
  return () => {}
}

// Every error answer is the JSON error envelope.
expectType<ApiError['error']['code']>('not_found')<string>(true)
expectType<ApiError['error']['message']>('not found')<string>(true)
expectType<Json<paths['/api/v1/tasks']['post']['responses']['4XX']>>({ error: { code: 'not_found', message: 'not found' } })<ApiError>(true)

export class OpenTodoError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiError['error']['code'],
  ) {
    super(code)
  }
}

export function client(baseUrl: string, token: string) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(baseUrl + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      const envelope = (await res.json()) as ApiError
      throw new OpenTodoError(res.status, envelope.error.code)
    }
    return (await res.json()) as T
  }
  return {
    me: () => call<Ok<'/api/v1/me', 'get'>>('GET', '/api/v1/me'),
    listTasks: () => call<Ok<'/api/v1/tasks', 'get'>>('GET', '/api/v1/tasks'),
    createTask: (task: Body<'/api/v1/tasks', 'post'>) => call<Ok<'/api/v1/tasks', 'post'>>('POST', '/api/v1/tasks', task),
    getTask: (id: paths['/api/v1/tasks/{id}']['get']['parameters']['path']['id']) =>
      call<Ok<'/api/v1/tasks/{id}', 'get'>>('GET', `/api/v1/tasks/${encodeURIComponent(id)}`),
    sync: (exchange: Body<'/api/v1/sync', 'post'>) => call<Ok<'/api/v1/sync', 'post'>>('POST', '/api/v1/sync', exchange),
  }
}

export async function example(baseUrl: string, token: string): Promise<string[]> {
  const api = client(baseUrl, token)
  const lines: string[] = []

  const me = await api.me()
  expectType(me.user?.email)<string | undefined>(true)
  if (me.user) lines.push(`signed in as ${me.user.name ?? me.user.email}`)

  const created = await api.createTask({
    title: 'Buy paint for the fence',
    due: { date: '2026-11-20', time: '10:00' },
    priority: 2,
    labels: [],
  })
  expectType(created.id)<string>(true)
  expectType(created.title)<string | undefined>(true)
  expectType(created.priority)<1 | 2 | 3 | 4 | undefined>(true)

  const { tasks } = await api.listTasks()
  for (const task of tasks ?? []) {
    expectType(task.id)<string>(true)
    expectType(task.labels)<string[] | undefined>(true)
    expectType(task.completed_at)<number | null | undefined>(true)
    const due: string | undefined = task.due?.date
    lines.push(`${task.title ?? ''} ${due ?? ''}`.trim())
  }

  const again = await api.getTask(created.id)
  expectType(again.project_id)<string | null | undefined>(true)

  const reply = await api.sync({
    cursor: 0,
    device: 'example',
    ops: [
      {
        actor: me.user?.id ?? '',
        device: 'example',
        entity: 'task',
        entityId: created.id,
        field: 'title',
        id: 'example-1',
        seq: 1,
        ts: Date.now(),
        value: JSON.stringify('Buy green paint'),
      },
    ],
  })
  expectType(reply.cursor)<number | undefined>(true)
  expectType(reply.hasMore)<boolean | undefined>(true)

  try {
    await api.getTask('missing')
  } catch (err) {
    if (err instanceof OpenTodoError && err.code === 'not_found') lines.push('not found')
    else throw err
  }
  return lines
}
