import { describe, expect, it } from 'vitest'
import { ICONS, type IconName } from './lucide'

// Every vendored icon must be used somewhere in the app, or be reserved here for
// a planned screen change (design D2), so the set does not grow unnoticed.
export const RESERVED: readonly IconName[] = [
  // settings-redesign, task-detail-redesign, labels-and-menus
  'copy', 'pin', 'pin-off', 'tag', 'folder', 'flag', 'link', 'key-round', 'shield-check', 'log-out',
  'download', 'upload', 'external-link', 'sun', 'moon', 'grip-vertical', 'eye', 'eye-off',
  'globe', 'hash', 'at-sign', 'send', 'rotate-ccw', 'history',
  // icons-and-section-style: the 24 former project icons stay interface icons, so a
  // project that already carries one draws it at once, before the catalogue loads.
  'book-open', 'briefcase', 'camera', 'car', 'dumbbell', 'gift', 'graduation-cap', 'leaf', 'music', 'plane',
  'shopping-cart', 'wallet', 'wrench',
]

const sources = import.meta.glob<string>(['../../**/*.tsx', '../../**/*.ts', '!../../**/*.test.*', '!../../**/*.stories.tsx', '!./**'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

export function unusedIcons(names: readonly string[], files: Record<string, string>, reserved: readonly string[]): string[] {
  const text = Object.values(files).join('\n')
  return names.filter((n) => !reserved.includes(n) && !new RegExp(`['"\`]${n}['"\`]`).test(text))
}

describe('icon set', () => {
  it('has no unused icons outside the reserved list', () => {
    expect(unusedIcons(Object.keys(ICONS), sources, RESERVED)).toEqual([])
  })

  it('flags an icon nobody uses', () => {
    expect(unusedIcons(['bell', 'banana'], { 'a.tsx': '<Icon name="bell" />' }, [])).toEqual(['banana'])
  })
})
