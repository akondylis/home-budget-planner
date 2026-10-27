import { useTranslation } from 'react-i18next'
import { Banner, Button } from '../ui'

export interface RulePromptProps {
  /** As the bank writes it, e.g. "ΒΑΣΙΛΟΠΟΥΛΟΣ" */
  merchant: string
  categoryName: string
  busy?: boolean
  /** After saving: what happened, shown in place of the question */
  done?: string | null
  error?: string | null
  onAccept: () => void
  onDismiss: () => void
}

/** "Always put ΒΑΣΙΛΟΠΟΥΛΟΣ in Σούπερ μάρκετ?": one click teaches a rule */
export function RulePrompt({ merchant, categoryName, busy = false, done, error, onAccept, onDismiss }: RulePromptProps) {
  const { t } = useTranslation()
  if (done) {
    return (
      <Banner tone="success" className="mb-3" action={<Button size="sm" variant="ghost" icon="close" onClick={onDismiss}>{t('common.close')}</Button>}>
        {done}
      </Banner>
    )
  }
  return (
    <Banner
      tone="info"
      icon="tag"
      className="mb-3"
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>{t('rules.not_now')}</Button>
          <Button size="sm" icon="check" onClick={onAccept} disabled={busy}>{t('rules.always')}</Button>
        </div>
      }
    >
      {t('rules.prompt', { merchant, category: categoryName })}
      {error && <span role="alert" className="ml-2 text-red-700">{error}</span>}
    </Banner>
  )
}
