import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, IconButton, Input, SelectMenu } from '../ui'
import { MemberDot } from '../members/MemberDot'
import type { CardDraft } from '../../lib/ledger'
import type { MemberSummary } from '../../../../shared/members'

/** Value of "no one parent" in the holder menu */
const JOINT = 'joint'

export interface CardListEditorProps {
  cards: CardDraft[]
  onChange: (cards: CardDraft[]) => void
  /** Parents a card can belong to; archived ones only when a card already has them */
  members: MemberSummary[]
  /** Holder of a new card: the account's holder, else the parent using the app */
  defaultHolderId: string | null
  /** i18n keys under `accounts.errors`, per card key */
  errors?: Record<string, string>
}

let nextKey = 0
export const newCardKey = () => `new-${++nextKey}`

/** The cards on an account: last 4 digits and holder, edited in place and saved with the account */
export function CardListEditor({ cards, onChange, members, defaultHolderId, errors = {} }: CardListEditorProps) {
  const { t } = useTranslation()
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const [focusKey, setFocusKey] = useState<string | null>(null)

  // A new card's digits get the focus once its row exists
  useEffect(() => {
    if (!focusKey) return
    inputs.current.get(focusKey)?.focus()
    setFocusKey(null)
  }, [focusKey])

  const update = (key: string, patch: Partial<CardDraft>) => onChange(cards.map(c => (c.key === key ? { ...c, ...patch } : c)))

  function add() {
    const key = newCardKey()
    onChange([...cards, { key, last4: '', holderMemberId: defaultHolderId }])
    setFocusKey(key)
  }

  const holderOptions = (current: string | null) => [
    { value: JOINT, label: t('accounts.holder_joint') },
    ...members
      .filter(m => !m.archived || m.id === current)
      .map(m => ({ value: m.id, label: <MemberDot colour={m.colour} name={m.name} />, searchText: m.name })),
  ]

  return (
    <div className="space-y-2">
      {cards.map(card => {
        const error = errors[card.key]
        const errorId = `card-error-${card.key}`
        const label = card.last4 ? t('accounts.card_named', { last4: card.last4 }) : t('accounts.card_new')
        return (
          <div key={card.key}>
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-sm tracking-widest text-gray-500">••••</span>
              <Input
                ref={el => {
                  if (el) inputs.current.set(card.key, el)
                  else inputs.current.delete(card.key)
                }}
                aria-label={t('accounts.card_last4')}
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder="1234"
                value={card.last4}
                onChange={e => update(card.key, { last4: e.target.value.replace(/\D/g, '') })}
                className="w-20 text-center tabular-nums tracking-widest"
              />
              {members.length > 0 && (
                <SelectMenu<string>
                  value={card.holderMemberId ?? JOINT}
                  ariaLabel={t('accounts.card_holder', { card: label })}
                  onChange={v => update(card.key, { holderMemberId: v === JOINT ? null : v })}
                  options={holderOptions(card.holderMemberId)}
                  triggerClassName="min-w-40"
                />
              )}
              <IconButton
                icon="trash"
                size="sm"
                label={t('accounts.card_remove', { card: label })}
                onClick={() => onChange(cards.filter(c => c.key !== card.key))}
              />
            </div>
            {error && <p id={errorId} className="mt-1 text-xs text-red-700">{t(`accounts.errors.${error}`)}</p>}
          </div>
        )
      })}
      <Button size="sm" icon="plus" onClick={add}>{t('accounts.card_add')}</Button>
    </div>
  )
}
