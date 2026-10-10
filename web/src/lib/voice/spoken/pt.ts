import { numberWords, type SpokenTable } from './types'

export const pt: SpokenTable = {
  code: 'pt',
  hashtag: ['hashtag', 'cerquilha'],
  project: ['projeto'],
  label: ['etiqueta'],
  labelAt: [],
  priority: ['prioridade'],
  numbers: numberWords(
    ['zero', ['um', 'uma'], ['dois', 'duas'], 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze',
      'treze', ['catorze', 'quatorze'], 'quinze', ['dezesseis', 'dezasseis'], ['dezessete', 'dezassete'], 'dezoito', ['dezenove', 'dezanove']],
    ['vinte', 'trinta', 'quarenta', 'cinquenta'],
    (ten, one) => [`${ten} e ${one}`],
  ),
  minuteZero: [],
  minutes: ['minuto', 'minutos', 'min'],
  and: ['e'],
  durationBefore: ['durante'],
}
