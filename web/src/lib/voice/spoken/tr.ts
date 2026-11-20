import { numberWords, type SpokenTable } from './types'

export const tr: SpokenTable = {
  code: 'tr',
  hashtag: ['hashtag', 'etiket'],
  project: ['proje'],
  label: ['etiket'],
  labelAt: [],
  priority: ['öncelik', 'oncelik'],
  numbers: numberWords(
    ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz', 'on',
      'on bir', 'on iki', 'on üç', 'on dört', 'on beş', 'on altı', 'on yedi', 'on sekiz', 'on dokuz'],
    ['yirmi', 'otuz', 'kırk', 'elli'],
    (ten, one) => [`${ten} ${one}`],
  ),
  minuteZero: ['sıfır', 'sifir'],
  minutes: ['dakika', 'dk'],
  and: ['ve'],
  durationBefore: ['için', 'icin'],
}
