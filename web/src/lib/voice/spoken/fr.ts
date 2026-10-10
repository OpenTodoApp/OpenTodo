import { numberWords, type SpokenTable } from './types'

export const fr: SpokenTable = {
  code: 'fr',
  hashtag: ['hashtag', 'dièse'],
  project: ['projet'],
  label: ['étiquette', 'label'],
  labelAt: [],
  priority: ['priorité'],
  numbers: numberWords(
    ['zéro', ['un', 'une'], 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze',
      'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'],
    ['vingt', 'trente', 'quarante', 'cinquante'],
    // "vingt et un", then "vingt-deux".
    (ten, one, unit) => (unit === 1 ? (one === 'un' ? [`${ten} et un`, `${ten}-et-un`] : []) : [`${ten}-${one}`]),
  ),
  minuteZero: [],
  minutes: ['minute', 'minutes', 'min'],
  and: ['et'],
  durationBefore: ['pendant'],
}
