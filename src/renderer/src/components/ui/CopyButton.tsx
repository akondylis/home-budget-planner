import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from './IconButton'
import { cx } from './cx'

export interface CopyButtonProps {
  value: string
  className?: string
}

const COPIED_MS = 1500

/** Copies `value` to the clipboard; hidden until its `group` parent is hovered or it gets focus */
export function CopyButton({ value, className }: CopyButtonProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch (err) {
      console.error('Clipboard write failed:', err)
    }
  }

  return (
    <span className={cx('relative inline-flex shrink-0', className)}>
      <IconButton
        icon={copied ? 'check' : 'copy'}
        label={t('app.copy')}
        size="sm"
        onClick={handleCopy}
        className={cx(
          'transition-opacity',
          copied ? 'text-success-fg opacity-100' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
        )}
      />
      {copied && (
        <span role="status" className="absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-toast px-2 py-0.5 text-xs text-toast-fg shadow">
          {t('app.copied')}
        </span>
      )}
    </span>
  )
}
