import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Banner, Button, ConfirmDialog, ListCard, Spinner } from '../ui'
import { CategoryGroupCard, type CategoryActions } from './CategoryGroupCard'
import { GroupForm } from './GroupForm'
import { MoveCategoryDialog } from './MoveCategoryDialog'
import { MergeCategoryDialog } from './MergeCategoryDialog'
import { useLedgerStore } from '../../store/ledger'
import { moveInList, sameTypeGroups, splitManaged } from '../../lib/categories'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import type { ManagedCategoryNode } from '../../../../shared/ledger'

export interface CategoriesTabProps {
  onShowTransactions: (categoryId: string) => void
}

type Confirm = { kind: 'archive' | 'delete'; node: ManagedCategoryNode }

/** Groups and categories: rename, reorder, move, merge, archive / restore, delete */
export function CategoriesTab({ onShowTransactions }: CategoriesTabProps) {
  const { t } = useTranslation()
  const revision = useLedgerStore(s => s.revision)
  const categories = useLedgerStore(s => s.categories)
  const [tree, setTree] = useState<ManagedCategoryNode[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  // undefined = closed, null = a new group
  const [groupForm, setGroupForm] = useState<ManagedCategoryNode | null | undefined>(undefined)
  const [moving, setMoving] = useState<ManagedCategoryNode | null>(null)
  const [merging, setMerging] = useState<ManagedCategoryNode | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    let alive = true
    window.api.manageCategories()
      .then(next => { if (alive) { setTree(next); setLoadError(null) } })
      .catch(err => { if (alive) setLoadError(ipcErrorMessage(err, t)) })
    return () => { alive = false }
  }, [revision, t])

  /** Runs a write, refreshes every list and picker, and shows a failure under the list */
  async function run(write: () => Promise<unknown>, after?: () => void): Promise<boolean> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await write()
      await useLedgerStore.getState().changed()
      after?.()
      return true
    } catch (err) {
      setError(ipcErrorMessage(err, t))
      return false
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <Banner tone="warning">{loadError}</Banner>
  if (!tree) return <div className="flex justify-center py-12"><Spinner /></div>

  const { groups, archived } = splitManaged(tree)

  function reorder(node: ManagedCategoryNode, delta: -1 | 1) {
    const siblings = node.parentId === null ? sameTypeGroups(groups, node) : groups.find(g => g.id === node.parentId)?.children ?? []
    const ids = siblings.map(s => s.id)
    const next = moveInList(ids, ids.indexOf(node.id), delta)
    if (next) void run(() => window.api.reorderCategories(node.parentId, next), () => setHighlightId(node.id))
  }

  const actions: CategoryActions = {
    rename: async (node, name) => {
      // InlineName shows the error next to the field, so this one throws instead of using run()
      await window.api.updateCategory(node.id, { name, type: node.type })
      await useLedgerStore.getState().changed()
      setHighlightId(node.id)
    },
    reorder,
    addCategory: async (group, name) => {
      const id = await window.api.createCategory({ name, parentId: group.id })
      await useLedgerStore.getState().changed()
      setHighlightId(id)
    },
    editGroup: group => setGroupForm(group),
    move: node => setMoving(node),
    merge: node => setMerging(node),
    showTransactions: node => onShowTransactions(node.id),
    archive: node => setConfirm({ kind: 'archive', node }),
    remove: node => setConfirm({ kind: 'delete', node }),
  }

  async function confirmAction(c: Confirm) {
    const ok = await run(() => (c.kind === 'archive' ? window.api.archiveCategory(c.node.id, true) : window.api.deleteCategory(c.node.id)))
    setConfirm(null)
    if (ok) setNotice(t(c.kind === 'archive' ? 'categories.archived_notice' : 'categories.deleted_notice', { name: c.node.name }))
  }

  const isGroup = (node: ManagedCategoryNode) => node.parentId === null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">{t('categories.intro')}</p>
        <Button variant="primary" icon="plus" onClick={() => setGroupForm(null)}>{t('categories.new_group')}</Button>
      </div>

      {notice && <Banner tone="success">{notice}</Banner>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

      {groups.length === 0 && (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-fg-muted">{t('categories.empty')}</p>
      )}
      {groups.map(group => {
        const sameType = sameTypeGroups(groups, group)
        const at = sameType.indexOf(group)
        return (
          <CategoryGroupCard
            key={group.id}
            group={group}
            canMoveUp={at > 0}
            canMoveDown={at < sameType.length - 1}
            highlightId={highlightId}
            busy={busy}
            actions={actions}
          />
        )
      })}

      {archived.length > 0 && (
        <ListCard className="p-4">
          <Button variant="ghost" size="sm" icon="chevron-down" onClick={() => setShowArchived(s => !s)} aria-expanded={showArchived}>
            {t('categories.archived_toggle', { count: archived.length })}
          </Button>
          {showArchived && (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
              {archived.map(({ node, groupName }) => (
                <li key={node.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1 text-sm text-fg-muted">
                    <span className="break-words">{node.name}</span>
                    <span className="text-xs text-gray-500"> · {groupName ?? t('categories.a_group')}</span>
                  </div>
                  {node.transactionCount > 0 && <Badge tone="neutral">{t('categories.row_count', { count: node.transactionCount })}</Badge>}
                  <Button size="sm" icon="undo" disabled={busy} onClick={() => void run(() => window.api.archiveCategory(node.id, false), () => setHighlightId(node.id))}>
                    {t('categories.restore')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ListCard>
      )}

      {groupForm !== undefined && (
        <GroupForm
          group={groupForm}
          onClose={() => setGroupForm(undefined)}
          onSave={async (name, type) => {
            const id = groupForm
              ? (await window.api.updateCategory(groupForm.id, { name, type }), groupForm.id)
              : await window.api.createCategory({ name, type, parentId: null })
            await useLedgerStore.getState().changed()
            return id
          }}
          onSaved={id => { setGroupForm(undefined); setHighlightId(id) }}
        />
      )}
      {moving && (
        <MoveCategoryDialog
          category={moving}
          groups={groups}
          onClose={() => setMoving(null)}
          onMoved={id => {
            setMoving(null)
            setHighlightId(id)
            void useLedgerStore.getState().changed()
          }}
          onMergeInstead={c => { setMoving(null); setMerging(c) }}
        />
      )}
      {merging && (
        <MergeCategoryDialog
          category={merging}
          categories={categories}
          onClose={() => setMerging(null)}
          onMerged={(targetId, result) => {
            const name = merging.name
            setMerging(null)
            setHighlightId(targetId)
            void useLedgerStore.getState().changed()
            setNotice(t('categories.merged_notice', {
              name,
              rows: t('categories.row_count', { count: result.transactions }),
              rules: t('categories.rule_count', { count: result.rules }),
            }))
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={t(confirm.kind === 'archive' ? 'categories.archive_title' : 'categories.delete_title', { name: confirm.node.name })}
          message={
            confirm.kind === 'archive'
              ? t(isGroup(confirm.node) ? 'categories.archive_group_message' : 'categories.archive_message')
              : t('categories.delete_message', { rules: t('categories.rule_count', { count: confirm.node.ruleCount }) })
          }
          confirmLabel={t(confirm.kind === 'archive' ? 'categories.archive_confirm' : 'categories.delete_confirm')}
          confirmIcon={confirm.kind === 'archive' ? 'lock' : 'trash'}
          tone={confirm.kind === 'archive' ? 'primary' : 'danger'}
          loading={busy}
          onConfirm={() => void confirmAction(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
