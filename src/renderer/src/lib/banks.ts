// Which banks a picker offers, and which one an account keeps when its kind
// changes. Pure, so the rules can be unit-tested.

import { institutionKindFor, type AccountKind, type InstitutionKind, type InstitutionSummary } from '../../../shared/ledger'

/** Active banks of the kind, in the user's order; an archived one stays while it is chosen or saved (`keep`) */
export function banksFor(institutions: InstitutionSummary[], kind: InstitutionKind, keep: (string | null)[] = []): InstitutionSummary[] {
  return institutions.filter(i => i.kind === kind && (!i.archived || keep.includes(i.id)))
}

/**
 * The bank an account keeps when its kind changes: the current one while it fits,
 * else the first active issuer for a meal-voucher card, else no bank.
 */
export function bankAfterKindChange(institutions: InstitutionSummary[], current: string | null, kind: AccountKind): string | null {
  const wanted = institutionKindFor(kind)
  if (institutions.find(i => i.id === current)?.kind === wanted) return current
  if (wanted === 'VOUCHER_ISSUER') return banksFor(institutions, wanted)[0]?.id ?? null
  return null
}
