import { numberWords, type SpokenTable } from './types'

export const it: SpokenTable = {
  code: 'it',
  hashtag: ['hashtag', 'cancelletto'],
  project: ['progetto'],
  label: ['etichetta'],
  labelAt: [],
  priority: ['priorità'],
  numbers: numberWords(
    ['zero', ['uno', 'una', 'un'], 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici',
      'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'],
    ['venti', 'trenta', 'quaranta', 'cinquanta'],
    // "ventuno", "ventotto": the tens drop their final vowel before a vowel; "ventitré".
    (ten, one) => (one === 'una' || one === 'un' ? [] : [/^[aeiou]/.test(one) ? ten.slice(0, -1) + one : ten + one]),
  ),
  minuteZero: [],
  minutes: ['minuto', 'minuti', 'min'],
  and: ['e'],
  durationBefore: ['per'],
}
