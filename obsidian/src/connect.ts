// Connecting to a server (spec "The plugin connects to the user's server only"):
// the address rules, the health route and the minimum version, then the token's
// account and scope. Nothing is stored here; the settings tab stores the result
// only when everything passed, so a refused token leaves nothing behind.
import { checkAddress, MIN_SERVER_VERSION, serverVersionOK } from './address'
import { ApiError, Client, NetworkError, type Request } from './api'
import { tr } from './strings'

export interface Account {
  userId: string
  name: string
  email: string
  serverVersion: string
  encrypted: boolean
  dayParts: boolean
  energy: boolean
  tokenName: string
}

export class ConnectError extends Error {
  /** An https address to offer instead of a refused http one. */
  suggestion?: string
  constructor(message: string, suggestion?: string) {
    super(message)
    this.suggestion = suggestion
  }
}

/** The server address to use, or a ConnectError naming why not. */
export function serverAddress(input: string): { url: string; plainHttp: boolean } {
  const a = checkAddress(input)
  if (a.ok) return { url: a.url, plainHttp: a.warning === 'plain_http' }
  if (a.reason === 'insecure') throw new ConnectError(tr('Plain http is only allowed for this device and private networks. Use {https}.', { https: a.suggestion }), a.suggestion)
  throw new ConnectError(tr('This is not a server address. Enter the address you open OpenTodo at, such as todo.example.com.'))
}

/** Checks the server and the token; resolves with the account to show and store. */
export async function connect(server: string, token: string, request: Request): Promise<Account> {
  if (!token.trim()) throw new ConnectError(tr('Paste an API token. Create one in OpenTodo under Settings → Integrations → API tokens.'))
  let version: string | undefined
  try {
    version = (await new Client(server, '', request).health()).version
  } catch (err) {
    if (err instanceof NetworkError) throw new ConnectError(tr('Could not reach {server}. Check the address and your connection.', { server }))
    throw new ConnectError(tr('{server} does not look like an OpenTodo server.', { server }))
  }
  if (!serverVersionOK(version)) throw new ConnectError(tr('This server runs OpenTodo {version}. The plugin needs OpenTodo {min} or newer; ask the server owner to update it.', { version: version ?? '?', min: MIN_SERVER_VERSION }))
  const client = new Client(server, token.trim(), request)
  let me
  try {
    me = await client.me()
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) throw new ConnectError(tr('The server did not accept this token. Check that it was copied whole and has not been revoked.'))
    if (err instanceof NetworkError) throw new ConnectError(tr('Could not reach {server}. Check the address and your connection.', { server }))
    throw new ConnectError(err instanceof Error ? err.message : String(err))
  }
  const scope = me.auth?.scope ?? 'full'
  if (scope !== 'full' && scope !== 'admin') {
    throw new ConnectError(tr('This is a {scope} token. The plugin writes tasks, so it needs a full token: a read token cannot write, and an agent token is meant for AI assistants and labels changes as theirs.', { scope }))
  }
  return {
    userId: me.user.id, name: me.user.name ?? '', email: me.user.email ?? '', serverVersion: version ?? '', encrypted: me.encryption?.enabled === true,
    dayParts: me.day_parts === true, energy: me.energy_levels === true, tokenName: me.auth?.token_name ?? '',
  }
}
