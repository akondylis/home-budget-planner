import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { IconButton } from './IconButton'
import type { IconName } from '../shell/icons'
import { cx } from './cx'
import { effectiveZoom, toZoomedBox } from '../../lib/zoom'

export interface CopyButtonProps {
  value: string
  className?: string
  /** Glyph shown before the copy (default `copy`), e.g. `mail` for an email */
  icon?: IconName
  /** Tooltip / screen-reader text (default "Copy") */
  label?: string
  /** Always visible instead of revealed on hover/focus */
  visible?: boolean
}

const COPIED_MS = 1500

/** Copies `value` to the clipboard; hidden until its `group` parent is hovered or it gets focus, unless `visible` */
export function CopyButton({ value, className, icon = 'copy', label, visible = false }: CopyButtonProps) {
  const { t } = useTranslation()
  // Where the "copied" bubble goes: above the button, measured at the moment of the copy
  const [copied, setCopied] = useState<{ top: number; left: number; zoom: number } | null>(null)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(null), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    try {
      await navigator.clipboard.writeText(value)
      setCopied({ top: rect.top - 4, left: rect.left + rect.width / 2, zoom: effectiveZoom(e.currentTarget) })
    } catch (err) {
      console.error('Clipboard write failed:', err)
    }
  }

  return (
    <span className={cx('inline-flex shrink-0', className)}>
      <IconButton
        icon={copied ? 'check' : icon}
        label={label ?? t('app.copy')}
        size="sm"
        onClick={handleCopy}
        className={cx(
          'transition-opacity',
          copied ? 'text-success-fg opacity-100' : !visible && 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
        )}
      />
      {/* Portaled and fixed, so a table's sideways scroller can't clip it */}
      {copied && createPortal(
        <span
          role="status"
          style={{ zoom: copied.zoom, ...toZoomedBox({ top: copied.top, left: copied.left }, copied.zoom) }}
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-toast px-2 py-0.5 text-xs text-toast-fg shadow"
        >
          {t('app.copied')}
        </span>,
        document.body,
      )}
    </span>
  )
}
