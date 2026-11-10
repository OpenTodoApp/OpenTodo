// Opening the device's start view (OpenSpec `custom-views`): on launch at the app's
// root, and from the sidebar's Tasks space (notes-space D2), through one function.
import { resolveStartView } from '../lib/views'
import { t } from '../lib/i18n'
import { showActionToast } from './bulk/toastStore'
import { navigate, parseRoute } from './router'

/** Resolves the start view and opens it; `still()` false drops a late answer (the user went elsewhere). */
export async function openStartView(opts: { replace?: boolean; still?: () => boolean } = {}): Promise<void> {
  const start = await resolveStartView()
  if (opts.still && !opts.still()) return
  const how = { replace: !!opts.replace }
  if (start.kind === 'saved') navigate({ view: 'view', id: start.id }, how)
  // A display start view (display-mode D6): the app renders the display instead of the shell.
  else if (start.kind === 'display') navigate(parseRoute(start.path), how)
  else {
    // At the root on launch the Inbox is already shown; from the sidebar it is opened.
    if (start.view !== 'inbox' || !opts.replace) navigate({ view: start.view }, how)
    if (start.removed) showActionToast(t('Your start view was deleted, so the Inbox opened instead.'))
  }
}
