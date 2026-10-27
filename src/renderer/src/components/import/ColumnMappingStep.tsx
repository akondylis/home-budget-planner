import { useTranslation } from 'react-i18next'
import { Field, Segmented, SelectMenu, cx } from '../ui'
import { headerOptions, type MappingField, type MappingForm } from '../../lib/import-review'

export interface ColumnMappingStepProps {
  /** The file's first rows */
  sample: string[][]
  headerRow: number
  onHeaderRow: (row: number) => void
  form: MappingForm
  onChange: (patch: Partial<MappingForm>) => void
  /** Required fields still empty, after the user tried to continue */
  missing: MappingField[]
}

/** For a file no preset knows: say once which column is which; the account keeps it */
export function ColumnMappingStep({ sample, headerRow, onHeaderRow, form, onChange, missing }: ColumnMappingStepProps) {
  const { t } = useTranslation()
  const names = headerOptions(sample[headerRow] ?? [])
  const width = Math.max(...sample.map(r => r.length))
  const column = (field: keyof MappingForm, required: boolean) => {
    const error = missing.includes(field as MappingField) ? t('import.map_required') : undefined
    return (
      <Field label={t(`import.map_${field}`)} required={required} error={error}>
        <SelectMenu<string>
          value={form[field] as string}
          ariaLabel={t(`import.map_${field}`)}
          onChange={v => onChange({ [field]: v })}
          options={[
            { value: '', label: <span className="text-fg-muted">{required ? t('import.map_choose') : t('import.map_none')}</span> },
            ...names.map(n => ({ value: n, label: n })),
          ]}
          triggerClassName={cx('w-full', error && 'border-red-600')}
        />
      </Field>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-fg-muted">{t('import.map_intro')}</p>

      <div className="max-h-56 overflow-auto rounded-md border border-line">
        <table className="w-full text-xs">
          <tbody>
            {sample.slice(0, 8).map((row, r) => (
              <tr
                key={r}
                onClick={() => onHeaderRow(r)}
                className={cx('cursor-pointer border-b border-line last:border-b-0', r === headerRow ? 'bg-accent/10 font-semibold text-fg' : 'text-fg-muted hover:bg-surface-hover')}
              >
                <th scope="row" className="w-8 px-2 py-1 text-right font-normal tabular-nums text-gray-500">{r + 1}</th>
                {Array.from({ length: width }, (_, c) => (
                  <td key={c} className="max-w-48 truncate px-2 py-1" title={row[c]}>{row[c] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Field label={t('import.map_header_row')} hint={t('import.map_header_row_hint')}>
        <SelectMenu<number>
          value={headerRow}
          ariaLabel={t('import.map_header_row')}
          onChange={onHeaderRow}
          options={sample.slice(0, 8).map((_, r) => ({ value: r, label: t('import.map_row', { n: r + 1 }) }))}
          triggerClassName="w-40"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        {column('date', true)}
        {column('description', true)}
      </div>

      <div className="space-y-3">
        <Segmented<MappingForm['amountMode']>
          label={t('import.map_amount_mode')}
          value={form.amountMode}
          onChange={amountMode => onChange({ amountMode })}
          options={[
            { value: 'SIGNED', label: t('import.map_mode_signed') },
            { value: 'DEBIT_CREDIT_COLUMNS', label: t('import.map_mode_columns') },
          ]}
        />
        <div className="grid grid-cols-2 gap-4">
          {form.amountMode === 'SIGNED' ? column('amount', true) : <>{column('debit', true)}{column('credit', true)}</>}
          {column('balance', false)}
        </div>
      </div>

      <div className="flex flex-wrap gap-6">
        <div>
          <div className="section-label mb-1">{t('import.map_date_order')}</div>
          <Segmented<MappingForm['dateOrder']>
            label={t('import.map_date_order')}
            value={form.dateOrder}
            onChange={dateOrder => onChange({ dateOrder })}
            options={[
              { value: 'DMY', label: t('import.map_dmy') },
              { value: 'MDY', label: t('import.map_mdy') },
              { value: 'YMD', label: t('import.map_ymd') },
            ]}
          />
        </div>
        <div>
          <div className="section-label mb-1">{t('import.map_decimal')}</div>
          <Segmented<MappingForm['decimalSeparator']>
            label={t('import.map_decimal')}
            value={form.decimalSeparator}
            onChange={decimalSeparator => onChange({ decimalSeparator })}
            options={[
              { value: ',', label: '1.234,56' },
              { value: '.', label: '1,234.56' },
            ]}
          />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm text-fg">
        <input type="checkbox" className="mt-0.5" checked={form.invertSign} onChange={e => onChange({ invertSign: e.target.checked })} />
        <span>
          {t('import.map_invert')}
          <span className="block text-xs text-fg-muted">{t('import.map_invert_hint')}</span>
        </span>
      </label>
    </div>
  )
}
