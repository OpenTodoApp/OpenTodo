// QR matrix for the second-factor enrolment code, computed in the browser so
// the secret never leaves the device in an image request (OpenSpec `mfa-totp`,
// design D9). qrcode-generator is a zero-dependency encoder pinned in
// package.json; only its matrix is used and rendering is plain SVG.
import qrcode from 'qrcode-generator'

/** Dark/light modules of the QR code for text, row by row (error correction M). */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(text, 'Byte')
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
}

/** One SVG path ("M x y h1 v1 h-1 z" per dark module) for a matrix. */
export function qrPath(m: boolean[][]): string {
  let d = ''
  m.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) d += `M${x} ${y}h1v1h-1z`
  }))
  return d
}
