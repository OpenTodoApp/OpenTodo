import { numberWords, type SpokenTable } from './types'

export const en: SpokenTable = {
  code: 'en',
  hashtag: ['hashtag', 'hash tag'],
  project: ['project'],
  label: ['label'],
  labelAt: ['at'],
  priority: ['priority'],
  numbers: numberWords(
    ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
      'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'],
    ['twenty', 'thirty', 'forty', 'fifty'],
    (ten, one) => [`${ten}-${one}`],
  ),
  minuteZero: ['oh', 'o'],
  minutes: ['minute', 'minutes', 'min', 'mins'],
  and: ['and'],
  durationBefore: ['for'],
}
