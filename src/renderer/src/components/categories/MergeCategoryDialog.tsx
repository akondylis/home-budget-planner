import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Modal } from '../ui'
import { CategoryPicker } from '../transactions/CategoryPicker'
import { findCategory } from '../../lib/ledger'
import { withoutCategory } from '../../lib/categories'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import type { CategoryNode, ManagedCategoryNode, MergeResult } from '../../../../shared/ledger'

export interface MergeCategoryDialogProps {
  category: ManagedCategoryNode
  /** Active categories (the pickers' tree) */
  categories: CategoryNode[]
  onClose: () => void
  onMerged: (targetId: string, result: MergeResult) => void
}

/** Moves every row and rule of one category into another; the emptied one is archived */
export function MergeCategoryDialog({ category, categories, onClose, onMerged }: MergeCategoryDialogProps) {
  const { t } = useTranslation()
  const [targetId, setTargetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const target = findCategory(categories, targetId)

  async function merge() {
    if (!targetId) return
    setBusy(true)
    setError(null)
    try {
      onMerged(targetId, await window.api.mergeCategory(category.id, targetId))
    } catch (err) {
      setError(ipcErrorMessage(err, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('categories.merge_title', { name: category.name })}
      size="sm"
      onClose={onClose}
      closeDisabled={busy}
      bodyClassName="space-y-4 px-6 py-5"
      footer={
        <>
          <Button variant="ghost" icon="close" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="primary" icon="swap" onClick={() => void merge()} loading={busy} disabled={!targetId}>
            {t('categories.merge_button')}
          </Button>
        </>
      }
    >
      <Field label={t('categories.merge_into')}>
        <CategoryPicker
          categories={withoutCategory(categories, category.id)}
          value={targetId}
          onChange={id => { setTargetId(id); setError(null) }}
          kind="ANY"
          ariaLabel={t('categories.merge_into')}
        />
      </Field>
      <p className="text-sm text-gray-700">
        {target
          ? t('categories.merge_summary', {
              rows: t('categories.row_count', { count: category.transactionCount }),
              rules: t('categories.rule_count', { count: category.ruleCount }),
              target: target.name,
              name: category.name,
            })
          : t('categories.merge_explain', { name: category.name })}
      </p>
      {target && target.type !== category.type && category.transactionCount > 0 && (
        <p className="text-sm text-gray-700">
          {t('categories.merge_type_change', { type: t(`categories.type.${target.type}`) })}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </Modal>
  )
}
