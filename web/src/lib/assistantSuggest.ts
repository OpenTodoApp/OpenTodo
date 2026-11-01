// Suggest after adding (OpenSpec change `assistant-suggest-after-add`): right after a task is typed into a quick-add line,
// the assistant proposes a clearer title, the right project and a few subtasks. It reuses the assistant panel, so the
// proposal is the usual change set: every item can be unchecked, nothing changes before Apply, and Undo puts it back.
import { getMeta, setMeta } from './db'
import { assistantStatus, openAssistantWith } from './assistantStatus'
import { getDeviceSetup } from './assistantDevice/settings'
import { createTask, type NewTaskInput } from './ops'

const KEY = 'assistant.suggestAfterAdd'

/** Per device, off by default: each add that asks costs one assistant turn. */
export async function getSuggestAfterAdd(): Promise<boolean> {
  try {
    return await getMeta<boolean>(KEY, false)
  } catch {
    return false
  }
}

export async function setSuggestAfterAdd(on: boolean): Promise<void> {
  await setMeta(KEY, on)
}

/** The question the assistant gets: bounded on purpose (title, project, at most 4 subtasks, nothing else touched). */
export function suggestionPrompt(title: string): string {
  // Not translated on purpose: it is an instruction to the model (which answers in the task's language), not text the person reads.
  return `Improve the task “${title}”: propose a clearer title only if it helps, the right project only if it is clearly better, and at most 4 subtasks only if the task is really several steps. Change nothing else, invent no date, and answer in the language of the task.`
}

/**
 * Asks for a suggestion about a task that was just added. Does nothing unless the device turned it on and the
 * assistant is available to this account (enabled, available and consented, on the server or on the device).
 * Never throws: adding a task must not depend on the assistant.
 */
export async function suggestAfterAdd(taskId: string, title: string): Promise<void> {
  try {
    const s = assistantStatus()
    if (!s || !s.enabled || !s.available) return
    // An encrypted account runs the assistant on this device: the server status has no consent for it,
    // so the device's own provider and consent decide (assistant-on-device).
    if (s.mode === 'device') {
      const setup = await getDeviceSetup()
      if (!setup || s.device?.consented_provider !== setup.provider) return
    } else if (!s.consented) return
    if (!(await getSuggestAfterAdd())) return
    openAssistantWith({ text: suggestionPrompt(title), selected: [taskId], send: true })
  } catch {
    // The task is already created; a suggestion is a bonus.
  }
}

/** `createTask` for a line the person typed: the same task, then a suggestion about it when the device asks for one. */
export async function createTaskThenSuggest(input: NewTaskInput): Promise<string> {
  const id = await createTask(input)
  void suggestAfterAdd(id, input.title)
  return id
}
