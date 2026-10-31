// IBANs: normalising, checking (length per country + ISO 13616 mod-97) and finding
// them in bank text. Used for the household's own accounts and the import's
// "money out to IBAN" rows.

// Lengths for SEPA countries the household is likely to meet; other countries need 15–34 characters
const LENGTHS: Record<string, number> = {
  AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22,
  GR: 27, HR: 21, HU: 28, IE: 22, IT: 27, LT: 20, LU: 20, LV: 21, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25,
  RO: 24, SE: 24, SI: 19, SK: 24,
}

/** Spaces and dashes taken out, upper case */
export function normaliseIban(text: string): string {
  return text.replace(/[\s-]/g, '').toUpperCase()
}

/** A normalised IBAN with the right length for its country and a valid check number */
export function isValidIban(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  const length = LENGTHS[iban.slice(0, 2)]
  if (length !== undefined && iban.length !== length) return false
  // Country and check digits move to the end; letters become 10..35; the number mod 97 must be 1
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55))
  let rest = 0
  for (const d of digits) rest = (rest * 10 + Number(d)) % 97
  return rest === 1
}

/** Groups of four for reading: "GR16 0110 1250 …" */
export function formatIban(iban: string): string {
  return normaliseIban(iban).replace(/(.{4})(?=.)/g, '$1 ')
}

/** Valid IBANs written in a text (unspaced), in order of appearance */
export function findIbans(text: string): string[] {
  const found = text.toUpperCase().match(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g) ?? []
  return [...new Set(found.filter(isValidIban))]
}
