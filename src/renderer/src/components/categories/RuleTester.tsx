import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '../ui'
import { Icon } from '../shell/icons'
import { findCatchingRule } from '../../lib/categories'
import type { RuleSummary } from '../../../../shared/statement-import'

export interface RuleTesterProps {
  rules: RuleSummary[]
  /** Open the rule's section and point at it */
  onShow: (rule: RuleSummary) => void
  onEdit: (rule: RuleSummary) => void
  /** No rule catches the text: start a new rule with it */
  onAddFor: (text: string) => void
}

/** "Why does this merchant go there?": paste the bank text, see the rule an import would use */
export function RuleTester({ rules, onShow, onEdit, onAddFor }: RuleTesterProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const typed = text.trim() !== ''
  const caught = typed ? findCatchingRule(rules, text) : null

  return (
    <section aria-labelledby="rule-tester-title" className="card space-y-3 p-4">
      <div>
        <h2 id="rule-tester-title" className="text-sm font-semibold text-fg">{t('rules.tester_title')}</h2>
        <p className="text-xs text-fg-muted">{t('rules.tester_hint')}</p>
      </div>
      <div className="relative">
        <Icon name="search" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
        <Input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={t('rules.tester_placeholder')}
          aria-label={t('rules.tester_title')}
          className="w-full pl-8"
        />
      </div>
      {typed && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-surface-2 px-3 py-2 text-sm">
          {caught ? (
            <>
              <Icon name="check-circle" size={16} className="shrink-0 text-success-fg" />
              <span className="min-w-0 flex-1 text-fg">
                {t('rules.tester_caught', { match: t(`rules.match_kind.${caught.match}`) })}{' '}
                <span className="break-all font-mono">«{caught.pattern}»</span>{' '}
                <Icon name="arrow-right" size={14} className="inline-block text-gray-500" />{' '}
                <span className="font-semibold">{caught.categoryName}</span>
                {caught.accountName && <span className="text-fg-muted"> · {caught.accountName}</span>}
              </span>
              <Button size="sm" variant="ghost" icon="arrow-right" onClick={() => onShow(caught)}>{t('rules.tester_show')}</Button>
              <Button size="sm" icon="pencil" onClick={() => onEdit(caught)}>{t('rules.tester_edit')}</Button>
            </>
          ) : (
            <>
              <Icon name="x-circle" size={16} className="shrink-0 text-gray-500" />
              <span className="min-w-0 flex-1 text-fg">{t('rules.tester_none')}</span>
              <Button size="sm" icon="plus" onClick={() => onAddFor(text.trim())}>{t('rules.tester_add')}</Button>
            </>
          )}
        </div>
      )}
    </section>
  )
}
