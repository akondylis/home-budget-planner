import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Field, Spinner, Textarea } from '../ui'
import { Icon } from '../shell/icons'
import { ipcErrorMessage } from '../../lib/ipc-errors'
import type { PreviewResult } from '../../../../shared/statement-import'

type Preview = Extract<PreviewResult, { ok: true }>

/** Main reads the paste once typing stops */
const READ_DELAY_MS = 300

export interface PasteStepProps {
  accountId: string
  /** Edenred loads older months as the page scrolls: say so */
  edenred: boolean
  text: string
  onText: (text: string) => void
  /** The list read from the current text; null = nothing found yet (or still reading) */
  onRead: (preview: Preview | null) => void
  /** Ctrl+Enter */
  onSubmit: () => void
}

/**
 * A meal card has no statement file: the user copies the list from the issuer's page and pastes it.
 * The line under the box says what was found, so the user knows the copy worked before moving on.
 */
export function PasteStep({ accountId, edenred, text, onText, onRead, onSubmit }: PasteStepProps) {
  const { t } = useTranslation()
  const [reading, setReading] = useState(false)
  const [found, setFound] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)

  useEffect(() => {
    const call = ++latest.current
    setFound(null)
    setError(null)
    onRead(null)
    if (text.trim() === '') {
      setReading(false)
      return
    }
    setReading(true)
    const timer = setTimeout(() => {
      window.api.previewImportText(accountId, text).then(
        result => {
          if (call !== latest.current) return
          const preview = result.ok ? result : null
          setFound(preview)
          onRead(preview)
          setReading(false)
        },
        err => {
          if (call !== latest.current) return
          setError(ipcErrorMessage(err, t))
          setReading(false)
        },
      )
    }, READ_DELAY_MS)
    return () => clearTimeout(timer)
    // onRead is the wizard's setter; the text and account decide what is read
  }, [accountId, text])

  const payments = found?.rows.filter(r => (r.amountCents ?? 0) < 0).length ?? 0
  const topUps = found?.rows.filter(r => (r.amountCents ?? 0) > 0).length ?? 0

  let status: ReactNode = null
  if (reading) {
    status = <span className="flex items-center gap-2 text-fg-muted"><Spinner size={14} />{t('import.paste.reading')}</span>
  } else if (error) {
    status = <span role="alert" className="flex items-center gap-1.5 text-amber-700"><Icon name="alert-triangle" size={14} />{error}</span>
  } else if (found) {
    status = (
      <span className="flex items-center gap-1.5 text-green-700">
        <Icon name="check" size={14} />
        {[
          t('import.paste.found', { payments: t('import.paste.payments', { count: payments }), topUps: t('import.paste.top_ups', { count: topUps }) }),
          found.summary.declined > 0 ? t('import.declined_left_out', { count: found.summary.declined }) : null,
        ].filter(Boolean).join(' · ')}
      </span>
    )
  } else if (text.trim() !== '') {
    status = <span role="alert" className="flex items-center gap-1.5 text-amber-700"><Icon name="alert-triangle" size={14} />{t('import.paste.none_found')}</span>
  }

  return (
    <div className="space-y-2">
      <Field label={t('import.paste.label')} hint={edenred ? t('import.paste.edenred_hint') : undefined}>
        <Textarea
          autoFocus
          rows={8}
          value={text}
          placeholder={t('import.paste.placeholder')}
          aria-describedby="paste-status"
          onChange={e => onText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              onSubmit()
            }
          }}
          className="w-full resize-y"
        />
      </Field>
      <p id="paste-status" aria-live="polite" className="min-h-5 text-sm">{status}</p>
    </div>
  )
}
