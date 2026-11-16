// The client's copy of the server's reserved device ids (reseed-reserved-devices D1),
// pinned by the vectors internal/sync/reserved_devices_test.go reads too.
import { describe, expect, it } from 'vitest'
import vectors from '../../../internal/sync/testdata/reserved_devices.json'
import { reservedDevice } from './sync'

describe('reservedDevice', () => {
  it.each(vectors.reserved)('%s is the server\'s', (d) => expect(reservedDevice(d)).toBe(true))
  it.each(vectors.allowed)('%s is a device\'s', (d) => expect(reservedDevice(d)).toBe(false))
})
