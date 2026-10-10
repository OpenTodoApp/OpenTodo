import { describe, expect, it } from 'vitest'
import { qrMatrix, qrPath } from './qr'

describe('qrMatrix', () => {
  it('encodes a provisioning URI into a square matrix with finder patterns', () => {
    const m = qrMatrix('otpauth://totp/OpenTodo:a%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=OpenTodo&algorithm=SHA1&digits=6&period=30')
    const n = m.length
    expect(n).toBeGreaterThanOrEqual(21)
    expect((n - 17) % 4).toBe(0) // versions are 21, 25, 29, … modules wide
    for (const row of m) expect(row).toHaveLength(n)
    // Top-left finder pattern: a 7x7 dark ring around a light ring and a 3x3 core.
    expect(m[0].slice(0, 7).every(Boolean)).toBe(true)
    expect(m[1][1]).toBe(false)
    expect(m[3][3]).toBe(true)
    expect(m[n - 1][0]).toBe(true) // bottom-left finder
    expect(m[0][n - 1]).toBe(true) // top-right finder
  })

  it('renders one path segment per dark module', () => {
    const d = qrPath([[true, false], [false, true]])
    expect(d).toBe('M0 0h1v1h-1zM1 1h1v1h-1z')
  })
})
