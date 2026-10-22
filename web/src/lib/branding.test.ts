import { beforeEach, describe, expect, it } from 'vitest'
import { getBranding, instanceName, logoUrl, setBranding } from './branding'

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
