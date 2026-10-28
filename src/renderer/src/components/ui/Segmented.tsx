import type { ReactNode } from 'react'
import { Icon, type IconName } from '../shell/icons'

export interface SegmentedProps<T extends string> {
  label: string
  value: T
  /** A disabled option shows its `title` (the reason) on hover */
  /** `leading` is drawn before the label instead of an icon (e.g. a member's colour dot) */
  options: { value: T; label: string; icon?: IconName; leading?: ReactNode; disabled?: boolean; title?: string }[]
  onChange: (value: T) => void
  /** Lets a longer set (e.g. five colours) wrap onto a second line instead of overflowing */
  wrap?: boolean
}

/** Pill toggle for 2–4 mutually exclusive options */
export function Segmented<T extends string>({ label, value, options, onChange, wrap = false }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={`${wrap ? 'flex max-w-full flex-wrap' : 'inline-flex'} rounded-lg border border-line bg-surface-2 p-0.5`}>
      {options.map(opt => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={opt.disabled}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
              selected ? 'bg-surface font-medium text-fg shadow-sm' : 'text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-fg-muted'
            }`}
          >
            {opt.leading ?? (opt.icon && <Icon name={opt.icon} size={16} />)}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
