import { numberWords, type SpokenTable } from './types'

export const de: SpokenTable = {
  code: 'de',
  hashtag: ['hashtag', 'hash tag'],
  project: ['projekt'],
  label: ['label', 'etikett'],
  labelAt: [],
  priority: ['priorität', 'prio'],
  numbers: numberWords(
    ['null', ['eins', 'ein', 'eine'], 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
      'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'],
    ['zwanzig', 'dreißig', 'vierzig', 'fünfzig'],
    // "einundzwanzig": only the "ein" form compounds.
    (ten, one) => (one === 'eins' || one === 'eine' ? [] : [`${one}und${ten}`]),
  ),
  minuteZero: [],
  minutes: ['minute', 'minuten', 'min'],
  and: ['und'],
  durationBefore: ['für'],
}
