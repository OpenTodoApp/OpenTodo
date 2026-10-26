import { createStore } from './store'

/**
 * Hosted service (OpenSpec `multi-tenant-host`): set from `auth/status` on every
 * profile read. On a hosted server the operator owns outgoing email, single
 * sign-on, backups, attachment limits and the AI switches, so their panels are
 * hidden, and the owner gets a download of the whole server instead.
 */

const store = createStore('hosted', false)

/** Record whether this server is hosted (absent on a self-hosted server). */
export function setHosted(hosted: boolean | undefined): void {
  store.set(hosted === true)
}

export const getHosted = store.get

/** Whether this server is hosted, re-rendering when it changes. */
export const useHosted = store.use
