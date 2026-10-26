// Whether the server can send email (OpenSpec change outgoing-email, "Availability
// reported to clients"): read from the authentication status on every refresh, so
// the email actions in Settings and the share dialog appear and disappear with it.
// Memory only: offline, the actions need a connection anyway.
import { createStore } from './store'

const store = createStore('outgoingEmail', false)

export function setOutgoingEmail(on: boolean | undefined): void {
  store.set(on === true)
}

export const outgoingEmailEnabled = store.get

/** True when the server reported outgoing email as configured. */
export const useOutgoingEmail = store.use
