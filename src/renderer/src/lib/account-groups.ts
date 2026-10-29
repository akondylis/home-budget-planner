// Grouping and filtering of the Accounts screen: by bank, holder or type, each
// group with its subtotal. Pure, so the order and the totals can be unit-tested.

import type { TFunction } from 'i18next'
import { sumMoney } from '../../../shared/money'
import { ACCOUNT_KINDS, INSTITUTIONS, type AccountKind, type AccountSummary, type Institution } from '../../../shared/ledger'
import type { MemberColour, MemberSummary } from '../../../shared/members'

export const ACCOUNT_GROUP_BYS = ['none', 'institution', 'holder', 'kind'] as const
export type AccountGroupBy = (typeof ACCOUNT_GROUP_BYS)[number]

/** Holder value of a joint account (no holder) */
export const JOINT = 'JOINT'

/** Empty list = any value; values within a list are alternatives */
export interface AccountFilter {
  kinds: AccountKind[]
  institutions: Institution[]
  /** Member ids and/or `JOINT` */
  holders: string[]
}

export const EMPTY_ACCOUNT_FILTER: AccountFilter = { kinds: [], institutions: [], holders: [] }

/** Selected values in all sections: the "(n)" on the Filters button */
export const countAccountFilters = (f: AccountFilter) => f.kinds.length + f.institutions.length + f.holders.length

export const isAccountFilterActive = (f: AccountFilter) => countAccountFilters(f) > 0

export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value]
}

export interface HolderOption {
  /** A member id or `JOINT` */
  id: string
  name: string | null
  colour: MemberColour | null
}

export interface AccountGroup {
  /** A kind, an institution, a member id or `JOINT` */
  key: string
  /** Set when grouped by holder (null for joint) */
  holder?: HolderOption
  accounts: AccountSummary[]
  totalCents: number
}

/** The account's holder, or the holder of one of its cards (a parent's card on a joint account counts as theirs) */
function heldBy(a: AccountSummary, holder: string): boolean {
  return holder === JOINT
    ? a.holderMemberId === null
    : a.holderMemberId === holder || a.cards.some(c => c.holderMemberId === holder)
}

/** Any of the chosen values within a section, every section with a choice */
export function filterAccounts(accounts: AccountSummary[], filter: AccountFilter): AccountSummary[] {
  return accounts.filter(a =>
    (filter.kinds.length === 0 || filter.kinds.includes(a.kind))
    && (filter.institutions.length === 0 || filter.institutions.includes(a.institution))
    && (filter.holders.length === 0 || filter.holders.some(h => heldBy(a, h))),
  )
}

/** Members in their saved order, then holders no longer listed, then Joint */
function holderRank(members: MemberSummary[], id: string): number {
  if (id === JOINT) return Number.MAX_SAFE_INTEGER
  const index = members.findIndex(m => m.id === id)
  return index === -1 ? members.length : index
}

/** Kinds and banks in their declared order ("Other" is last there), holders by member order with Joint last */
export function groupAccounts(accounts: AccountSummary[], by: AccountGroupBy, members: MemberSummary[]): AccountGroup[] {
  if (by === 'none') return [{ key: 'all', accounts, totalCents: sumMoney(accounts.map(a => a.balanceCents)) }]
  const groups = new Map<string, AccountGroup>()
  for (const a of accounts) {
    const key = by === 'kind' ? a.kind : by === 'institution' ? a.institution : a.holderMemberId ?? JOINT
    let group = groups.get(key)
    if (!group) {
      group = { key, accounts: [], totalCents: 0 }
      if (by === 'holder') group.holder = { id: key, name: a.holderName, colour: a.holderColour }
      groups.set(key, group)
    }
    group.accounts.push(a)
    group.totalCents += a.balanceCents
  }
  const rank = (key: string) =>
    by === 'kind' ? ACCOUNT_KINDS.indexOf(key as AccountKind)
      : by === 'institution' ? INSTITUTIONS.indexOf(key as Institution)
        : holderRank(members, key)
  return [...groups.values()].sort((x, y) => rank(x.key) - rank(y.key))
}

/** A value offered as a filter chip, with how many accounts it alone would show */
export interface FilterValue<T> {
  value: T
  count: number
}

export interface PresentValues {
  kinds: FilterValue<AccountKind>[]
  institutions: FilterValue<Institution>[]
  holders: (HolderOption & { count: number })[]
}

/** The kinds, banks and holders (account or card) that occur, in group order; drives which filters are offered */
export function presentValues(accounts: AccountSummary[], members: MemberSummary[]): PresentValues {
  const holders = new Map<string, HolderOption>()
  for (const a of accounts) {
    const id = a.holderMemberId ?? JOINT
    if (!holders.has(id)) holders.set(id, { id, name: a.holderName, colour: a.holderColour })
    for (const c of a.cards) {
      if (c.holderMemberId && !holders.has(c.holderMemberId)) {
        holders.set(c.holderMemberId, { id: c.holderMemberId, name: c.holderName, colour: c.holderColour })
      }
    }
  }
  const present = <T>(all: readonly T[], of: (a: AccountSummary) => T): FilterValue<T>[] =>
    all.map(value => ({ value, count: accounts.filter(a => of(a) === value).length })).filter(v => v.count > 0)
  return {
    kinds: present(ACCOUNT_KINDS, a => a.kind),
    institutions: present(INSTITUTIONS, a => a.institution),
    holders: [...holders.values()]
      .sort((x, y) => holderRank(members, x.id) - holderRank(members, y.id))
      .map(h => ({ ...h, count: accounts.filter(a => heldBy(a, h.id)).length })),
  }
}

/**
 * The filter as applied: a section counts only while it is offered (two or more values, holders only with members)
 * and keeps only values that still occur, so a stored choice never hides accounts behind a missing control.
 */
export function applicableFilter(stored: AccountFilter, values: PresentValues, hasMembers: boolean): AccountFilter {
  const offered = <T>(present: T[], chosen: T[]) => (present.length > 1 ? chosen.filter(v => present.includes(v)) : [])
  return {
    kinds: offered(values.kinds.map(v => v.value), stored.kinds),
    institutions: offered(values.institutions.map(v => v.value), stored.institutions),
    holders: hasMembers ? offered(values.holders.map(h => h.id), stored.holders) : [],
  }
}

export interface AccountFilterPill {
  key: string
  label: string
  /** The filter without this one value */
  clear: (f: AccountFilter) => AccountFilter
}

/** One removable pill per chosen value, in section order */
export function describeAccountFilters(filter: AccountFilter, t: TFunction, values: PresentValues): AccountFilterPill[] {
  return [
    ...filter.kinds.map(k => ({
      key: `kind-${k}`,
      label: t(`accounts.kind.${k}`),
      clear: (f: AccountFilter) => ({ ...f, kinds: f.kinds.filter(x => x !== k) }),
    })),
    ...filter.institutions.map(i => ({
      key: `bank-${i}`,
      label: t(`accounts.institution.${i}`),
      clear: (f: AccountFilter) => ({ ...f, institutions: f.institutions.filter(x => x !== i) }),
    })),
    ...filter.holders.map(h => ({
      key: `holder-${h}`,
      label: h === JOINT ? t('accounts.holder_joint') : values.holders.find(v => v.id === h)?.name ?? '?',
      clear: (f: AccountFilter) => ({ ...f, holders: f.holders.filter(x => x !== h) }),
    })),
  ]
}
