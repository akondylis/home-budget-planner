import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from './IconButton'
import { cx } from './cx'

export type ModalSize = 'sm' | 'md' | 'lg' | 'wide' | 'xl' | 'page'

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  wide: 'max-w-3xl',
  xl: 'max-w-4xl',
  /** Landscape page previews (statements, printable reports) */
  page: 'max-w-[1200px]',
}

// Open modals, innermost last, so Escape and Tab only act on the top one
const openStack: number[] = []
let nextId = 0

/** True while any dialog is open; app shortcuts for the page behind it stand down */
export function isModalOpen(): boolean {
  return openStack.length > 0
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export interface ModalProps {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  /** Right-aligned action bar: Cancel (ghost) first, then the confirm action */
  footer?: ReactNode
  size?: ModalSize
  /** Disables the close button and Escape (e.g. while saving) */
  closeDisabled?: boolean
  /** Body padding/layout; defaults to `p-6` */
  bodyClassName?: string
  /** Panel only (no header, body wrapper or footer) for content that brings its own chrome */
  bare?: boolean
  /** Extra panel classes, e.g. a fixed height for a bare editor */
  panelClassName?: string
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'lg',
  closeDisabled = false,
  bodyClassName = 'p-6',
  bare = false,
  panelClassName,
}: ModalProps) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef({ onClose, closeDisabled })
  closeRef.current = { onClose, closeDisabled }

  useEffect(() => {
    const id = nextId++
    openStack.push(id)
    const previousFocus = document.activeElement as HTMLElement | null
    // Start in the form rather than on the close button, unless a field autofocused
    if (!panelRef.current?.contains(document.activeElement)) {
      const firstField = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      ;(firstField ?? panelRef.current)?.focus()
    }

    const handleKey = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== id || !panelRef.current) return
      if (e.key === 'Escape') {
        if (closeRef.current.closeDisabled) return
        e.stopPropagation()
        closeRef.current.onClose()
        return
      }
      if (e.key !== 'Tab') return
      // Keep focus inside the dialog
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const inside = panelRef.current.contains(document.activeElement)
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      openStack.splice(openStack.indexOf(id), 1)
      previousFocus?.focus?.()
    }
  }, [])

  return (
    <div className="app-no-drag fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 pb-4 pt-[3.25rem]">
      {/* Keeps the window draggable by the titlebar while a dialog is open */}
      <div aria-hidden="true" className="app-drag absolute inset-x-0 top-0 h-9" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx('card-lg flex max-h-full w-full flex-col outline-none', SIZE_CLASSES[size], bare && 'overflow-hidden', panelClassName)}
      >
        {bare ? <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col">{children}</div> : <>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="page-title truncate">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
          </div>
          <IconButton icon="close" label={t('common.close')} onClick={onClose} disabled={closeDisabled} className="-mr-2" />
        </div>

        <div ref={bodyRef} className={cx('min-h-0 flex-1 overflow-y-auto', bodyClassName)}>{children}</div>

        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>
        )}
        </>}
      </div>
    </div>
  )
}
