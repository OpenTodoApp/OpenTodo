// @vitest-environment happy-dom
// The ramble and photos in the assistant composer (OpenSpec change voice-ramble,
// tasks 3.2, 4.2, 4.4 and 6.1): the microphone only with voice capture on,
// "Add photo" only when the model reads photos, the first-photo note, photos sent
// with one message and kept as a count, and a model that refuses photos.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listThreads } from '../lib/assistant'
import { resetSkills } from '../lib/assistantSkills'
import { openAssistantWith, resetAssistantStatus, setAssistantStatus, type AssistantStatus } from '../lib/assistantStatus'
import { db } from '../lib/db'
import { resetDeviceId } from '../lib/ops'
import { FakeRecognition } from '../lib/voice/fakeRecognition'
import { saveVoiceSettings } from '../lib/voice/settings'
import { click, flush, key, render, waitFor } from '../ui/test-utils'
import { AssistantPanel } from './assistant/AssistantPanel'

const base: AssistantStatus = {
  available: true, enabled: true, reason: '', provider: 'gemini', provider_label: 'Google Gemini', model: 'm', consented: true,
  disclosure_version: 2, fields: [], allow_member_keys: false, own_key_set: false, operator_key_set: true, images: true,
}
const SKILLS = [{ id: 'capture', name: 'Turn this into tasks', description: 'Speak, paste or photograph a list; get the tasks to review.', example: 'Turn this into tasks', result: 'changes' as const, subject: 'pasted' as const }]

let status = base
let turns: Record<string, unknown>[] = []
let turnAnswer: () => Response
const ok = () => new Response('event: text\ndata: {"text":"Two tasks."}\n\nevent: done\ndata: {"stop_reason":"end_turn"}\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } })

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetAssistantStatus()
  resetSkills(SKILLS)
  status = base
  setAssistantStatus(status)
  turns = []
  turnAnswer = ok
  localStorage.clear()
  FakeRecognition.reset()
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/v1/me/assistant') return new Response(JSON.stringify(status), { status: 200 })
    if (path === '/api/v1/assistant/skills') return new Response(JSON.stringify({ skills: SKILLS }), { status: 200 })
    if (path === '/api/v1/assistant/turn') {
      turns.push(JSON.parse(String(init?.body)))
      return turnAnswer()
    }
    return new Response('{}', { status: 404 })
  }))
  // A browser that decodes and encodes images (createImageBitmap and OffscreenCanvas).
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close() {} })))
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) {}
    getContext() { return { drawImage() {} } }
    async convertToBlob() { return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], { type: 'image/jpeg' }) }
  })
})
afterEach(() => { vi.unstubAllGlobals() })

const panel = () => render(<AssistantPanel onClose={() => {}} context={() => ({ view: 'today' })} onApplied={() => {}} />)
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const field = () => $<HTMLTextAreaElement>('[data-assistant-composer]')!

function voiceOn() {
  saveVoiceSettings({ enabled: true, lang: 'en', recognizer: 'browser' })
  vi.stubGlobal('SpeechRecognition', class extends FakeRecognition {})
}

async function choose(files: File[]) {
  const input = $<HTMLInputElement>('[data-assistant-photo-input]')!
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
}

/** Types into the composer's field through React's change path. */
async function typeInto(text: string) {
  const input = field()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const jpeg = (name = 'notes.jpg') => new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' })

describe('the microphone', () => {
  it('is hidden with voice capture off, and shown with it on', async () => {
    const r = await panel()
    await waitFor(() => !!$('[data-assistant-composer]'), 'the composer')
    expect($('[data-assistant-mic]')).toBeNull()
    await r.unmount()
    voiceOn()
    const r2 = await panel()
    await waitFor(() => !!$('[data-assistant-mic]'), 'the microphone')
    await r2.unmount()
  })

  it('writes the ramble into the field, unnormalised and unsent; Escape stops it and returns focus', async () => {
    voiceOn()
    const r = await panel()
    await waitFor(() => !!$('[data-assistant-mic]'), 'the microphone')
    await click($('[data-assistant-mic]')!)
    await waitFor(() => FakeRecognition.instances.length === 1 && FakeRecognition.last.started, 'recognition started')
    await flush()
    expect(FakeRecognition.last.continuous).toBe(true)
    await waitFor(() => $('[data-assistant-mic-status]')?.textContent === 'Listening', 'Listening announced')
    expect($('[data-assistant-listening]')!.textContent).toContain('0:00 / 5:00')
    await act(async () => { FakeRecognition.last.hear('buy printer paper p1 and call Marta on Friday', true) })
    expect(field().value).toBe('buy printer paper p1 and call Marta on Friday')
    await key(field(), 'Escape')
    await waitFor(() => $('[data-assistant-mic-status]')?.textContent === 'Stopped', 'Stopped announced')
    expect(document.activeElement).toBe(field())
    expect(field().selectionStart).toBe(field().value.length)
    expect(turns).toHaveLength(0)
    await r.unmount()
  })

  it('Ramble into tasks opens with the capture skill and the microphone listening', async () => {
    voiceOn()
    openAssistantWith({ skill: 'capture', listen: true })
    const r = await panel()
    await waitFor(() => !!$('[data-assistant-chosen]') && FakeRecognition.instances.length === 1, 'skill chosen and listening')
    expect($('[data-assistant-chosen]')!.textContent).toContain('Turn this into tasks')
    await r.unmount()
  })

  it('without voice capture the palette entry opens the skill and starts nothing', async () => {
    openAssistantWith({ skill: 'capture', listen: true })
    const r = await panel()
    await waitFor(() => !!$('[data-assistant-chosen]'), 'skill chosen')
    await flush()
    expect(FakeRecognition.instances).toHaveLength(0)
    await r.unmount()
  })
})

describe('photos', () => {
  it('are offered only when the model reads them', async () => {
    status = { ...base, images: false }
    setAssistantStatus(status)
    const r = await panel()
    await waitFor(() => !!$('[data-assistant-composer]'), 'the composer')
    await flush()
    expect($('[data-assistant-photo]')).toBeNull()
    await r.unmount()
  })

  it('ask once per device, then attach, show thumbnails and remove', async () => {
    const r = await panel()
    await waitFor(() => !!$('[data-assistant-photo]'), 'Add photo')
    await choose([jpeg()])
    await waitFor(() => !!$('[data-assistant-photo-note]'), 'the first-photo note')
    expect($('[data-assistant-photo-note]')!.textContent).toContain('Photos you add go to Google Gemini with this message and are not kept by OpenTodo.')
    expect($('[data-assistant-photos]')).toBeNull()
    const cont = [...document.querySelectorAll('[data-assistant-photo-note] button')].find((b) => b.textContent === 'Continue')!
    await click(cont)
    await waitFor(() => document.querySelectorAll('[data-assistant-photos] li').length === 1, 'one thumbnail')
    // Remembered on this device: the second photo is attached at once.
    await choose([jpeg('b.jpg')])
    await waitFor(() => document.querySelectorAll('[data-assistant-photos] li').length === 2, 'two thumbnails')
    expect($('[data-assistant-photo-note]')).toBeNull()
    await click($('[data-assistant-photos] button[aria-label="Remove photo 1"]')!)
    await waitFor(() => document.querySelectorAll('[data-assistant-photos] li').length === 1, 'one left')
    await r.unmount()
  })

  it('refuse a fifth photo and a PDF', async () => {
    localStorage.setItem('opentodo.assistant.photo-note', 'true')
    const r = await panel()
    await waitFor(() => !!$('[data-assistant-photo]'), 'Add photo')
    await choose([new File(['%PDF'], 'agenda.pdf', { type: 'application/pdf' })])
    await waitFor(() => !!$('[data-assistant-photo-error]'), 'the refusal')
    expect($('[data-assistant-photo-error]')!.textContent).toContain('JPEG, PNG, WebP, GIF or HEIC')
    await choose([jpeg('1.jpg'), jpeg('2.jpg'), jpeg('3.jpg'), jpeg('4.jpg'), jpeg('5.jpg')])
    await waitFor(() => document.querySelectorAll('[data-assistant-photos] li').length === 4, 'four thumbnails')
    expect($('[data-assistant-photo-error]')!.textContent).toContain('At most 4 photos')
    expect($<HTMLButtonElement>('[data-assistant-photo]')!.disabled).toBe(true)
    await r.unmount()
  })

  it('go with one message only; the conversation keeps "1 photo (not kept)"', async () => {
    localStorage.setItem('opentodo.assistant.photo-note', 'true')
    const r = await panel()
    await waitFor(() => !!$('[data-assistant-photo]'), 'Add photo')
    await choose([jpeg()])
    await waitFor(() => document.querySelectorAll('[data-assistant-photos] li').length === 1, 'a thumbnail')
    await click($('[data-composer-send]')!)
    await waitFor(() => turns.length === 1 && !!document.querySelector('[aria-label="Conversation"]')?.textContent?.includes('1 photo (not kept)'), 'the turn and the note')
    const msgs = turns[0].messages as { text: string; images?: { media_type: string; data: string }[] }[]
    expect(msgs.at(-1)!.images).toEqual([{ media_type: 'image/jpeg', data: btoa(String.fromCharCode(0xff, 0xd8, 0xff, 1, 2, 3)) }])
    expect($('[data-assistant-photos]')).toBeNull()
    const saved = (await listThreads())[0].messages[0]
    expect(saved).toMatchObject({ role: 'user', photos: 1 })
    expect(JSON.stringify(saved)).not.toContain(msgs.at(-1)!.images![0].data)
    // A follow-up does not resend them.
    await typeInto('and one more')
    await click($('[data-composer-send]')!)
    await waitFor(() => turns.length === 2, 'the second turn')
    expect((turns[1].messages as { images?: unknown }[]).some((m) => m.images)).toBe(false)
    await r.unmount()
  })

  it('a model that refuses photos keeps the message and the photos in the composer', async () => {
    localStorage.setItem('opentodo.assistant.photo-note', 'true')
    turnAnswer = () => new Response(JSON.stringify({ error: { code: 'images_unsupported', message: 'the model in use here does not read photos' } }), { status: 422 })
    const r = await panel()
    await waitFor(() => !!$('[data-assistant-photo]'), 'Add photo')
    await choose([jpeg()])
    await waitFor(() => document.querySelectorAll('[data-assistant-photos] li').length === 1, 'a thumbnail')
    await typeInto('my whiteboard')
    await click($('[data-composer-send]')!)
    await waitFor(() => turns.length === 1 && !!$('[role="alert"]'), 'the explanation')
    expect($('[role="alert"]')!.textContent).toContain('does not read photos')
    expect(document.querySelectorAll('[data-assistant-photos] li')).toHaveLength(1)
    expect(field().value).toBe('my whiteboard')
    expect(document.querySelector('[aria-label="Conversation"]')).toBeNull()
    await r.unmount()
  })

  it('nothing is offered when the assistant is not available', async () => {
    voiceOn()
    status = { ...base, available: false, enabled: false, reason: 'disabled' }
    setAssistantStatus(status)
    const r = await panel()
    await flush()
    expect($('[data-assistant-mic]')).toBeNull()
    expect($('[data-assistant-photo]')).toBeNull()
    await r.unmount()
  })
})
