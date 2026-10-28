import { useTranslation } from 'react-i18next'
import { Segmented, SelectMenu } from '../ui'
import { Icon } from '../shell/icons'
import { MemberDot } from '../members/MemberDot'
import { useUiStore } from '../../store/ui'
import { JOINT, type AccountFilter, type AccountGroupBy, type HolderOption, type PresentValues } from '../../lib/account-groups'
import type { AccountKind, Institution } from '../../../../shared/ledger'

export interface AccountsToolbarProps {
  /** As applied (a stored choice whose control is hidden reads as none) */
  groupBy: AccountGroupBy
  filter: AccountFilter
  /** What occurs among the open accounts; a filter is offered only with two or more values */
  values: PresentValues
  hasMembers: boolean
}

/** Group by bank / holder / type, and filter by the same three; changes apply live */
export function AccountsToolbar({ groupBy, filter, values, hasMembers }: AccountsToolbarProps) {
  const { t } = useTranslation()
  const setGroupBy = useUiStore(s => s.setAccountsGroupBy)
  const setFilter = useUiStore(s => s.setAccountsFilter)
  const holderLabel = (h: HolderOption) =>
    h.id !== JOINT && h.name && h.colour
      ? <MemberDot colour={h.colour} name={h.name} />
      : <span className="inline-flex items-center gap-1.5"><Icon name="users" size={12} />{t('accounts.holder_joint')}</span>

  const groupOptions: { value: AccountGroupBy; label: string }[] = [
    { value: 'none', label: t('accounts.group.none') },
    { value: 'institution', label: t('accounts.group.institution') },
    ...(hasMembers ? [{ value: 'holder' as const, label: t('accounts.group.holder') }] : []),
    { value: 'kind', label: t('accounts.group.kind') },
  ]

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <span className="section-label">{t('accounts.group_by')}</span>
        <Segmented<AccountGroupBy>
          label={t('accounts.group_by')}
          value={groupBy}
          options={groupOptions}
          onChange={setGroupBy}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('ui.filters')}>
        {values.kinds.length > 1 && (
          <SelectMenu<string>
            value={filter.kind ?? ''}
            ariaLabel={t('accounts.kind_label')}
            onChange={v => setFilter({ kind: (v || null) as AccountKind | null })}
            options={[
              { value: '', label: t('accounts.all_kinds') },
              ...values.kinds.map(k => ({ value: k, label: t(`accounts.kind.${k}`) })),
            ]}
            triggerClassName="min-w-36"
          />
        )}
        {values.institutions.length > 1 && (
          <SelectMenu<string>
            value={filter.institution ?? ''}
            ariaLabel={t('accounts.institution_label')}
            onChange={v => setFilter({ institution: (v || null) as Institution | null })}
            options={[
              { value: '', label: t('accounts.all_banks') },
              ...values.institutions.map(i => ({ value: i, label: t(`accounts.institution.${i}`) })),
            ]}
            triggerClassName="min-w-36"
          />
        )}
        {hasMembers && values.holders.length > 1 && (
          <SelectMenu<string>
            value={filter.holder ?? ''}
            ariaLabel={t('accounts.holder')}
            onChange={v => setFilter({ holder: v || null })}
            options={[
              { value: '', label: t('accounts.all_holders') },
              ...values.holders.map(h => ({ value: h.id, label: holderLabel(h), searchText: h.name ?? t('accounts.holder_joint') })),
            ]}
            triggerClassName="min-w-36"
          />
        )}
      </div>
    </div>
  )
}
