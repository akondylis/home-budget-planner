import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cx } from './cx'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>
}

export function Input({ className, ...rest }: InputProps) {
  return <input className={cx('input-field', className)} {...rest} />
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  ref?: Ref<HTMLSelectElement>
}

export function Select({ className, ...rest }: SelectProps) {
  return <select className={cx('select-field', className)} {...rest} />
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>
}

export function Textarea({ className, ...rest }: TextareaProps) {
  return <textarea className={cx('textarea-field', className)} {...rest} />
}

export interface FieldProps {
  label: ReactNode
  htmlFor?: string
  required?: boolean
  hint?: ReactNode
  error?: ReactNode
  className?: string
  children: ReactNode
}

/** Label, control and hint/error, stacked */
export function Field({ label, htmlFor, required, hint, error, className, children }: FieldProps) {
  return (
    // min-w-0: a long option or value never widens a grid column past its share
    <div className={cx('min-w-0', className)}>
      <label htmlFor={htmlFor} className="section-label mb-1 block">
        {label}
        {required && <span className="ml-0.5 text-red-700">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-700">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  )
}
