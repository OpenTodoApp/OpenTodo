// Whether the "Something isn't working" dialog is open (OpenSpec `feedback-door`, design D1). A
// tiny store, like the help request: the account menu, the phone drawer's footer and Settings →
// About open it, and the Shell renders it on top without unmounting what is underneath.
import { createStore } from './store'

const store = createStore<boolean>('feedbackOpen', false)

export const openFeedback = (): void => store.set(true)
export const closeFeedback = (): void => store.set(false)
export const useFeedbackOpen = store.use
