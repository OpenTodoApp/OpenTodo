import { numberWords, type SpokenTable } from './types'

export const es: SpokenTable = {
  code: 'es',
  hashtag: ['hashtag', 'almohadilla'],
  project: ['proyecto'],
  label: ['etiqueta'],
  labelAt: [],
  priority: ['prioridad'],
  numbers: numberWords(
    ['cero', ['uno', 'una', 'un'], 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce',
      'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'],
    ['veinte', 'treinta', 'cuarenta', 'cincuenta'],
    // "veintiuno" … "veintinueve" are one word; from 31 on "treinta y uno".
    (ten, one) => (one === 'una' || one === 'un' ? [] : ten === 'veinte' ? [`veinti${one}`] : [`${ten} y ${one}`]),
  ),
  minuteZero: [],
  minutes: ['minuto', 'minutos', 'min'],
  and: ['y'],
  durationBefore: ['durante'],
}
