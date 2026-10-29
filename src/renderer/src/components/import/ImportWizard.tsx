import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banner, Button, Field, Modal, SelectMenu, joinMeta } from '../ui'
import { Icon } from '../shell/icons'
import { ImportReview } from './ImportReview'
import { ColumnMappingStep } from './ColumnMappingStep'
import { activeAccounts, useLedgerStore } from '../../store/ledger'
import { useImportStore } from '../../store/import'
import { useUiStore } from '../../store/ui'
import { formatDate, formatDateTime } from '../../lib/date-format'
import { ipcErrorCode, ipcErrorMessage } from '../../lib/ipc-errors'
import { isImportable } from '../../lib/ledger'
import {
  cashAccounts,
  guessHeaderRow,
  initialChoices,
  missingFields,
  reviewCounts,
  toColumnMapping,
  toDecisions,
  type Choices,
  type MappingField,
  type MappingForm,
} from '../../lib/import-review'
import type { AccountSummary } from '../../../../shared/ledger'
import type { PickedFile, PreviewResult } from '../../../../shared/statement-import'

type Preview = Extract<PreviewResult, { ok: true }>

const EMPTY_MAPPING = (account: AccountSummary | undefined): MappingForm => ({
  date: '',
  description: '',
  amountMode: 'SIGNED',
  amount: '',
  debit: '',
  credit: '',
  balance: '',
  dateOrder: 'DMY',
  decimalSeparator: ',',
  invertSign: account?.kind === 'CREDIT_CARD',
})

/** Accounts with a bank statement (cash and meal-voucher cards have none) */
const importable = (accounts: AccountSummary[]) => activeAccounts(accounts).filter(a => isImportable(a.kind))

export interface ImportWizardProps {
  /** Pre-selected from the entry point (an account card) */
  accountId: string | null
  onClose: () => void
  /** After a commit: show the new rows */
  onImported: (batchId: string) => void
}

/** Account + file → (column mapping, only for an unknown file) → review → import */
export function ImportWizard({ accountId: initialAccountId, onClose, onImported }: ImportWizardProps) {
  const { t } = useTranslation()
  const accounts = useLedgerStore(s => s.accounts)
  const choices = importable(accounts)
  const lastAccountId = useLedgerStore(s => s.lastAccountId)
  const [accountId, setAccountId] = useState<string | null>(
    initialAccountId ?? choices.find(a => a.id === lastAccountId)?.id ?? choices[0]?.id ?? null,
  )
  const [file, setFile] = useState<PickedFile | null>(null)
  const [step, setStep] = useState<'choose' | 'mapping' | 'review'>('choose')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; code?: string } | null>(null)
  const [sample, setSample] = useState<string[][]>([])
  const [headerRow, setHeaderRow] = useState(0)
  const [mapping, setMapping] = useState<MappingForm>(() => EMPTY_MAPPING(undefined))
  const [missing, setMissing] = useState<MappingField[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [rowChoices, setRowChoices] = useState<Choices>({})

  const account = accounts.find(a => a.id === accountId)

  async function read(picked: PickedFile, withMapping?: MappingForm) {
    if (!accountId) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.previewImport(accountId, picked.fileId, withMapping && toColumnMapping(withMapping))
      if (result.ok) {
        setPreview(result)
        setRowChoices(initialChoices(result.rows, cashAccounts(accounts, accountId)[0]?.id ?? null))
        setStep('review')
      } else if (result.reason === 'UNKNOWN_FORMAT') {
        if (withMapping) setError({ message: t('import.map_no_match') })
        else {
          setSample(result.sample)
          setHeaderRow(guessHeaderRow(result.sample))
          setMapping(EMPTY_MAPPING(account))
          setMissing([])
        }
        setStep('mapping')
      } else {
        setError({ message: t('import.no_rows') })
        setStep('choose')
      }
    } catch (err) {
      setError({ message: ipcErrorMessage(err, t), code: ipcErrorCode(err) })
    } finally {
      setBusy(false)
    }
  }

  async function choose() {
    setError(null)
    try {
      const picked = await window.api.pickStatement({ title: t('import.pick_title'), filterName: t('import.pick_filter') })
      if (!picked) return
      setFile(picked)
      await read(picked)
    } catch (err) {
      setError({ message: ipcErrorMessage(err, t) })
    }
  }

  function readMapped() {
    const gaps = missingFields(mapping)
    setMissing(gaps)
    if (gaps.length === 0 && file) void read(file, mapping)
  }

  async function commit() {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const result = await window.api.commitImport({
        previewId: preview.previewId,
        decisions: toDecisions(preview.rows, rowChoices),
        createdByMemberId: useUiStore.getState().currentMemberId,
      })
      await useLedgerStore.getState().changed()
      useImportStore.getState().imported({ ...result, accountId: preview.accountId })
      onImported(result.batchId)
    } catch (err) {
      setError({ message: ipcErrorMessage(err, t), code: ipcErrorCode(err) })
      setBusy(false)
    }
  }

  function startOver() {
    setStep('choose')
    setPreview(null)
    setFile(null)
    setError(null)
  }

  const counts = preview ? reviewCounts(preview.rows, rowChoices) : { included: 0, toCategorise: 0 }
  const errorBanner = error && (
    <Banner
      tone="warning"
      className="mb-4"
      action={error.code === 'IMPORT_PREVIEW_EXPIRED' && file
        ? <Button size="sm" icon="refresh" onClick={() => void read(file)}>{t('import.read_again')}</Button>
        : undefined}
    >
      <span role="alert">{error.message}</span>
    </Banner>
  )
  const cancel = <Button variant="ghost" icon="close" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
  const back = (
    <Button variant="ghost" icon="arrow-left" className="mr-auto" onClick={startOver} disabled={busy}>{t('import.other_file')}</Button>
  )

  if (step === 'review' && preview) {
    const period = preview.summary.dateFrom && preview.summary.dateTo
      ? `${formatDate(preview.summary.dateFrom)}–${formatDate(preview.summary.dateTo)}`
      : null
    return (
      <Modal
        title={t('import.review_title')}
        subtitle={joinMeta([
          account?.name,
          preview.fileName,
          period,
          preview.profile === 'saved' ? t('import.profile_saved') : t('import.detected', { profile: t(`import.profile.${preview.profile}`) }),
        ])}
        onClose={onClose}
        closeDisabled={busy}
        size="page"
        bodyClassName="flex flex-col p-6"
        footer={
          <>
            {back}
            {cancel}
            <Button variant="primary" icon="download" onClick={() => void commit()} disabled={busy || counts.included === 0}>
              {counts.included === 0 ? t('import.nothing_new') : t('import.commit', { count: counts.included })}
            </Button>
          </>
        }
      >
        {errorBanner}
        {preview.sameFile && (
          <Banner tone="info" className="mb-3">
            {t('import.same_file', { date: formatDateTime(preview.sameFile.importedAt), count: preview.sameFile.importedCount })}
          </Banner>
        )}
        <ImportReview
          accountId={preview.accountId}
          rows={preview.rows}
          summary={preview.summary}
          choices={rowChoices}
          onChoices={setRowChoices}
        />
      </Modal>
    )
  }

  if (step === 'mapping') {
    return (
      <Modal
        title={t('import.map_title')}
        subtitle={joinMeta([account?.name, file?.fileName])}
        onClose={onClose}
        closeDisabled={busy}
        size="xl"
        footer={
          <>
            {back}
            {cancel}
            <Button variant="primary" icon="arrow-right" onClick={readMapped} disabled={busy}>{t('import.map_read')}</Button>
          </>
        }
      >
        {errorBanner}
        <ColumnMappingStep
          sample={sample}
          headerRow={headerRow}
          onHeaderRow={row => {
            setHeaderRow(row)
            // Names from another row would not exist in this one
            setMapping(m => ({ ...EMPTY_MAPPING(account), dateOrder: m.dateOrder, decimalSeparator: m.decimalSeparator, invertSign: m.invertSign }))
          }}
          form={mapping}
          onChange={patch => {
            setMapping(m => ({ ...m, ...patch }))
            setMissing([])
          }}
          missing={missing}
        />
      </Modal>
    )
  }

  return (
    <Modal
      title={t('import.title')}
      onClose={onClose}
      closeDisabled={busy}
      size="md"
      footer={
        <>
          {cancel}
          <Button variant="primary" icon="folder" onClick={() => void choose()} disabled={busy || !accountId}>
            {busy ? t('import.reading') : t('import.choose_file')}
          </Button>
        </>
      }
    >
      {errorBanner}
      {choices.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('import.no_accounts')}</p>
      ) : (
        <div className="space-y-4">
          <Field label={t('import.account')} hint={account?.importedUntil ? t('accounts.imported_until', { date: formatDate(account.importedUntil) }) : undefined}>
            <SelectMenu<string>
              value={accountId}
              ariaLabel={t('import.account')}
              onChange={setAccountId}
              options={choices.map(a => ({ value: a.id, label: a.name, searchText: a.name }))}
              triggerClassName="w-full"
            />
          </Field>
          <div className="flex items-start gap-2 text-xs text-fg-muted">
            <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
            <p>{t('import.choose_hint')}</p>
          </div>
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        icon="undo"
        className="-ml-2 mt-3"
        onClick={() => useImportStore.getState().openHistory(accountId)}
        disabled={busy}
      >
        {t('import.history_title')}
      </Button>
    </Modal>
  )
}
