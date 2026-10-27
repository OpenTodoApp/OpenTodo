import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { channelsApi } from './notificationChannels'

let calls: { method: string; url: string; body: unknown }[]

beforeEach(() => {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ method: init.method ?? 'GET', url, body: init.body ? JSON.parse(String(init.body)) : undefined })
    return new Response('{"enabled":true}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('owner switch API client', () => {
  it('reads and sets every switch route the server registers with switchRoutes', async () => {
    const switches = [
      [api.caldavSwitch, 'caldav', 'enabled'],
      [api.calendarFeedsSwitch, 'calendar-feeds', 'enabled'],
      [api.calendarSyncSwitch, 'calendar-sync', 'enabled'],
      [api.automationsSwitch, 'automations', 'enabled'],
      [api.issuesSwitch, 'issues', 'enabled'],
      [api.projectInvitesSwitch, 'project-invites', 'membersCanInviteNewPeople'],
      [channelsApi.switch, 'notification-channels', 'enabled'],
    ] as const
    for (const [sw, name, field] of switches) {
      calls = []
      await sw.get()
      await sw.put(false)
      expect(calls).toEqual([
        { method: 'GET', url: `/api/v1/settings/${name}`, body: undefined },
        { method: 'PUT', url: `/api/v1/settings/${name}`, body: { [field]: false } },
      ])
    }
  })
})
