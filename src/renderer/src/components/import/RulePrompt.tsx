import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Banner, Button } from '../ui'

export interface RulePromptProps {
  /** As the bank writes them, e.g. ["ΒΑΣΙΛΟΠΟΥΛΟΣ"]; one rule is made for each */
  merchants: string[]
  categoryName: string
  busy?: boolean
  /** After saving: what happened, shown in place of the question */
  done?: string | null
  error?: string | null
  /** Pinned to the bottom of the window, so a long list keeps its scroll position; Esc dismisses */
  floating?: boolean
  onAccept: () => void
  onDismiss: () => void
}

/** "«Α» and «Β»", "«Α», «Β» and 3 more": the first two merchants by name */
export function merchantList(merchants: string[], t: TFunction): string {
  const [a, b] = merchants.map(m => `«${m}»`)
  const rest = merchants.length - 2
  if (rest <= 0) return b ? t('rules.and_two', { a, b }) : (a ?? '')
  return t('rules.and_more', { names: `${a}, ${b}`, count: rest })
}

/** "Always put ΒΑΣΙΛΟΠΟΥΛΟΣ in Σούπερ μάρκετ?": one click teaches a rule (or one per merchant) */
export function RulePrompt({ merchants, categoryName, busy = false, done, error, floating = false, onAccept, onDismiss }: RulePromptProps) {
  const { t } = useTranslation()

  // Bubble phase: an open dropdown's Escape (capture phase, stopped) closes the dropdown first
  useEffect(() => {
    if (!floating || busy) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onDismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [floating, busy, onDismiss])

  const place = (banner: ReactNode) =>
    floating ? (
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4" role="status" aria-live="polite">
        <div className="pointer-events-auto w-full max-w-2xl rounded-lg bg-surface shadow-lg">{banner}</div>
      </div>
    ) : (
      banner
    )

  if (done) {
    return place(
      <Banner tone="success" className={floating ? undefined : 'mb-3'} action={<Button size="sm" variant="ghost" icon="close" onClick={onDismiss}>{t('common.close')}</Button>}>
        {done}
      </Banner>,
    )
  }
  return place(
    <Banner
      tone="info"
      icon="tag"
      className={floating ? undefined : 'mb-3'}
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>{t('rules.not_now')}</Button>
          <Button size="sm" icon="check" onClick={onAccept} disabled={busy}>{t('rules.always')}</Button>
        </div>
      }
    >
      {merchants.length === 1
        ? t('rules.prompt', { merchant: merchants[0], category: categoryName })
        : t('rules.prompt_many', { merchants: merchantList(merchants, t), count: merchants.length, category: categoryName })}
      {error && <span role="alert" className="ml-2 text-red-700">{error}</span>}
    </Banner>,
  )
}
