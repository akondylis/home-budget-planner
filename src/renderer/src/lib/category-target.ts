// Values a category picker can hold besides a category: "transfer to/from one of my accounts".
// Shared by every picker that assigns a category, so they all offer and read transfers alike.

import type { TFunction } from 'i18next'
import type { SelectMenuOption } from '../components/ui'
import type { AccountSummary } from '../../../shared/ledger'

export const TRANSFER_TO = 'transfer:'
const TRANSFER_HEADING = 'transfer-heading'

export type CategoryTarget = { kind: 'category'; categoryId: string } | { kind: 'transfer'; toAccountId: string }

export const transferValue = (accountId: string) => `${TRANSFER_TO}${accountId}`

/** What a picked value means: a transfer to one of my accounts, else a category id */
export function parseTarget(value: string): CategoryTarget {
  return value.startsWith(TRANSFER_TO)
    ? { kind: 'transfer', toAccountId: value.slice(TRANSFER_TO.length) }
    : { kind: 'category', categoryId: value }
}

/** "Transfer between my accounts" heading over one row per account; worded by the money's direction */
export function transferOptions(targets: AccountSummary[], incoming: boolean, t: TFunction): SelectMenuOption<string>[] {
  if (targets.length === 0) return []
  const label = incoming ? 'picker.transfer_from' : 'picker.transfer_to'
  return [
    { value: TRANSFER_HEADING, label: t('picker.transfer_heading'), kind: 'heading' },
    ...targets.map(a => ({
      value: transferValue(a.id),
      label: t(label, { account: a.name }),
      searchText: [t('picker.transfer_search'), t('picker.transfer_heading'), a.name, a.institutionName].filter(Boolean).join(' '),
    })),
  ]
}
