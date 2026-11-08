// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { getBranding, instanceName, logoUrl, setBranding } from './branding'
import { watchPageBranding } from './pageBranding'

describe('branding store', () => {
  beforeEach(() => setBranding(undefined))

  it('defaults to OpenTodo without a logo', () => {
    expect(instanceName()).toBe('OpenTodo')
    expect(logoUrl(32)).toBeUndefined()
    expect(getBranding()).toEqual({ name: '', logoVersion: 0 })
  })

  it('names the instance and versions the logo address', () => {
    setBranding({ name: 'Acme Tasks', logoVersion: 3 })
    expect(instanceName()).toBe('Acme Tasks')
    expect(logoUrl(192)).toBe('/branding/logo-192.png?v=3')
    // Absent on an older server: back to the default.
    setBranding(undefined)
    expect(instanceName()).toBe('OpenTodo')
  })
})

describe('the page brands itself (signed-web-app D7)', () => {
  beforeEach(() => setBranding(undefined))

  function page(): Document {
    const doc = document.implementation.createHTMLDocument('OpenTodo')
    doc.head.innerHTML = '<meta name="description" content="OpenTodo: your tasks."><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">'
    return doc
  }

  it('sets the logo, the touch icon, the description and the title, and puts them back', () => {
    const doc = page()
    const stop = watchPageBranding(doc)
    expect(doc.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/favicon.svg')
    setBranding({ name: 'Acme Tasks', logoVersion: 3 })
    expect(doc.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/branding/logo-32.png?v=3')
    expect(doc.querySelector('link[rel="icon"]')?.getAttribute('type')).toBe('image/png')
    expect(doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toBe('/branding/logo-180.png?v=3')
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Acme Tasks')
    expect(doc.title).toBe('Acme Tasks')
    setBranding(undefined)
    expect(doc.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/favicon.svg')
    expect(doc.querySelector('link[rel="icon"]')?.getAttribute('type')).toBe('image/svg+xml')
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('OpenTodo: your tasks.')
    stop()
  })
})
