// The merchant part of a bank description, shared by the import engine (rules,
// "last category for this payee") and the renderer (the "Always put X in Y?" prompt).

import { normalise } from './search-normalise'

// Words banks put before the merchant ("POS ΣΚΛΑΒΕΝΙΤΗΣ", "ΑΓΟΡΑ LIDL")
const LEADING_NOISE = new Set(['pos', 'agora', 'agores', 'e', 'commerce', 'ecommerce', 'contactless', 'anepafi', 'pliromi'])

/**
 * Description reduced to the merchant, for rules and "last category for this payee":
 * no digits (card masks, dates, terminal ids) and no leading words like POS or ΑΓΟΡΑ.
 */
export function payeeKey(description: string): string {
  const words = normalise(description.replace(/[x*]{2,}\d*/gi, ' ').replace(/\d+/g, ' '))
    .split(' ')
    .filter(w => w.length > 0)
  let start = 0
  while (start < words.length - 1 && LEADING_NOISE.has(words[start])) start++
  return words.slice(start).join(' ')
}

/**
 * The same merchant part, as the bank wrote it, for showing to the user:
 * "POS ΒΑΣΙΛΟΠΟΥΛΟΣ ΚΗΦΙΣΙΑ 4411" → "ΒΑΣΙΛΟΠΟΥΛΟΣ ΚΗΦΙΣΙΑ". Folding it gives payeeKey().
 */
export function merchantText(description: string): string {
  const words = description.replace(/[x*]{2,}\d*/gi, ' ').replace(/\d+/g, ' ')
    .split(/\s+/)
    .filter(w => normalise(w).length > 0)
  let start = 0
  while (start < words.length - 1 && LEADING_NOISE.has(normalise(words[start]))) start++
  return words.slice(start).join(' ')
}
