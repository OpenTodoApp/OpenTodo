import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadVoiceSettings, recognitionLanguage, recognitionTag, saveVoiceSettings } from './settings'

const store = new Map<string, string>()
const g = globalThis as Record<string, unknown>

beforeEach(() => {
  store.clear()
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  g.window = { dispatchEvent: () => true }
})
afterEach(() => {
  delete g.localStorage
  delete g.window
})

describe('voice settings', () => {
  it('are off by default and stored on this device only', () => {
    expect(loadVoiceSettings()).toEqual({ enabled: false, lang: null, recognizer: 'browser' })
    saveVoiceSettings({ enabled: true, lang: 'it', recognizer: 'browser' })
    expect(JSON.parse(store.get('opentodo.voice')!)).toEqual({ enabled: true, lang: 'it', recognizer: 'browser' })
    expect(loadVoiceSettings()).toEqual({ enabled: true, lang: 'it', recognizer: 'browser' })
  })

  it('ignore junk and unknown languages', () => {
    store.set('opentodo.voice', JSON.stringify({ enabled: 'yes', lang: 'xx' }))
    expect(loadVoiceSettings()).toEqual({ enabled: false, lang: null, recognizer: 'browser' })
    store.set('opentodo.voice', '{not json')
    expect(loadVoiceSettings()).toEqual({ enabled: false, lang: null, recognizer: 'browser' })
  })

  it('survive blocked storage', () => {
    g.localStorage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(loadVoiceSettings().enabled).toBe(false)
    expect(() => saveVoiceSettings({ enabled: true, lang: null, recognizer: 'browser' })).not.toThrow()
  })
})

describe('recognition language', () => {
  it('follows the first quick-add language unless overridden', () => {
    expect(recognitionLanguage({ enabled: true, lang: null }, ['de', 'en'])).toBe('de')
    expect(recognitionLanguage({ enabled: true, lang: 'it' }, ['de', 'en'])).toBe('it')
    expect(recognitionLanguage({ enabled: true, lang: null }, [])).toBe('en')
  })

  it("uses the browser's regional tag when it has one, else a default region", () => {
    expect(recognitionTag('en', ['en-GB', 'de'])).toBe('en-GB')
    expect(recognitionTag('en', ['de-DE'])).toBe('en-US')
    expect(recognitionTag('de', ['de-AT'])).toBe('de-AT')
    expect(recognitionTag('de', ['de'])).toBe('de-DE')
    expect(recognitionTag('it', ['en-US'])).toBe('it-IT')
    expect(recognitionTag('pt', ['pt_PT'])).toBe('pt-PT')
  })
})
