import { formatMoney } from '../../../../shared/money'
import { cx } from './cx'

export type MoneyTone = 'auto' | 'income' | 'expense' | 'neutral' | 'planned'

const TONE_CLASSES: Record<Exclude<MoneyTone, 'auto'>, string> = {
  income: 'amount-income',
  expense: 'amount-expense',
  neutral: 'amount-neutral',
  planned: 'amount-planned',
}

export interface MoneyProps {
  /** Integer cents */
  cents: number
  currency?: string
  /** Pill look; 'auto' picks income/expense/neutral from the sign. Omit for plain text */
  tone?: MoneyTone
  /** Shows + on positive amounts (cash-flow columns) */
  signed?: boolean
  className?: string
}

/** An amount in the app's money format; plain tabular text, or a pill when a tone is given */
export function Money({ cents, currency, tone, signed = false, className }: MoneyProps) {
  const text = formatMoney(cents, { currency, sign: signed ? 'exceptZero' : 'auto' })
  if (!tone) return <span className={cx('money', className)}>{text}</span>
  const resolved = tone === 'auto' ? (cents > 0 ? 'income' : cents < 0 ? 'expense' : 'neutral') : tone
  return <span className={cx('amount-badge', TONE_CLASSES[resolved], className)}>{text}</span>
}
