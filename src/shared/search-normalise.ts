// ── Greek → Latin normaliser ──────────────────────────────────────────────────
//
// Used by the command palette and in-memory searches: Greek folds to Latin so
// "spiti" finds "Σπίτι". Any future database search index must use the same
// mapping.

const GR: Record<string, string> = {
  // Lowercase
  'α': 'a',  'ά': 'a',  'β': 'v',  'γ': 'g',  'δ': 'd',
  'ε': 'e',  'έ': 'e',  'ζ': 'z',  'η': 'i',  'ή': 'i',
  'θ': 'th', 'ι': 'i',  'ί': 'i',  'ϊ': 'i',  'ΐ': 'i',
  'κ': 'k',  'λ': 'l',  'μ': 'm',  'ν': 'n',  'ξ': 'x',
  'ο': 'o',  'ό': 'o',  'π': 'p',  'ρ': 'r',  'σ': 's',
  'ς': 's',  'τ': 't',  'υ': 'u',  'ύ': 'u',  'ϋ': 'u',
  'ΰ': 'u',  'φ': 'f',  'χ': 'ch', 'ψ': 'ps', 'ω': 'o',  'ώ': 'o',
  // Uppercase
  'Α': 'a',  'Ά': 'a',  'Β': 'v',  'Γ': 'g',  'Δ': 'd',
  'Ε': 'e',  'Έ': 'e',  'Ζ': 'z',  'Η': 'i',  'Ή': 'i',
  'Θ': 'th', 'Ι': 'i',  'Ί': 'i',  'Ϊ': 'i',  'Κ': 'k',
  'Λ': 'l',  'Μ': 'm',  'Ν': 'n',  'Ξ': 'x',  'Ο': 'o',
  'Ό': 'o',  'Π': 'p',  'Ρ': 'r',  'Σ': 's',  'Τ': 't',
  'Υ': 'u',  'Ύ': 'u',  'Ϋ': 'u',  'Φ': 'f',  'Χ': 'ch',
  'Ψ': 'ps', 'Ω': 'o',  'Ώ': 'o',
}

/**
 * Normalises text to ASCII lowercase for accent- and script-insensitive search.
 *
 * - Greek characters → Latin equivalent (β→v, θ→th, χ→ch, ψ→ps …)
 * - Latin diacritics stripped via NFD decomposition (é→e, ü→u …)
 * - Non-alphanumeric characters (hyphens, dots) collapsed to spaces
 * - Result is lowercase, trimmed, single-spaced
 *
 * @example normalise('Σούπερ μάρκετ') → 'souper market'
 * @example normalise('Van der Berg')  → 'van der berg'
 */
export function normalise(text: string): string {
  let out = ''
  for (const ch of text) {
    out += ch in GR ? GR[ch] : ch.toLowerCase()
  }
  return out
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9\s]/g, ' ')   // collapse hyphens, dots, etc.
    .replace(/\s+/g, ' ')
    .trim()
}
