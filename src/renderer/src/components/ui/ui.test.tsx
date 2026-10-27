import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n/en.json'
import {
  ActiveFilterPills,
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  CollapsibleCard,
  CopyButton,
  DraftBadge,
  FilterChip,
  FilterPopoverButton,
  IconButton,
  joinMeta,
  ListRow,
  PAYMENT_STATUS_TONES,
  MetaLine,
  Modal,
  Pagination,
  SelectMenu,
  SortHeader,
  StatusBadge,
  cx,
  nextEnabledIndex,
} from '.'
import { createPanelRegistry, placePanel } from './Popover'
import { DateInput, shiftDay } from './DateInput'
import { setDateFormat } from '../../lib/date-format'

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    resources: { en: { translation: en } },
    lng: 'en',
    interpolation: { escapeValue: false },
  })
})

const noop = vi.fn()

describe('Banner', () => {
  it('gives warnings an amber surface with an accent edge', () => {
    const html = renderToStaticMarkup(<Banner tone="warning">Boards missing</Banner>)
    expect(html).toContain('bg-warning')
    expect(html).toContain('border-l-warning-fg')
    expect(html).toContain('Boards missing')
  })

  it('uses soft green for success and a muted surface for info', () => {
    expect(renderToStaticMarkup(<Banner tone="success">Done</Banner>)).toContain('bg-success')
    const info = renderToStaticMarkup(<Banner tone="info">Note</Banner>)
    expect(info).toContain('bg-neutral')
    expect(info).not.toContain('border-l-4')
  })

  it('renders an action and can hide the icon', () => {
    const html = renderToStaticMarkup(
      <Banner tone="info" icon={null} action={<button type="button">Open</button>}>Note</Banner>,
    )
    expect(html).toContain('>Open</button>')
    expect(html).not.toContain('<svg')
  })
})

describe('cx', () => {
  it('joins truthy class names only', () => {
    expect(cx('a', false, null, undefined, 'b', '')).toBe('a b')
  })
})

describe('joinMeta / MetaLine', () => {
  it('joins parts with mid-dots and skips empty ones', () => {
    expect(joinMeta(['18/10/2026', null, 'Rd 4', '', false, undefined, 6])).toBe('18/10/2026 • Rd 4 • 6')
  })

  it('renders a single truncated muted line', () => {
    const html = renderToStaticMarkup(<MetaLine parts={['a', null, 'b']} />)
    expect(html).toContain('a • b')
    expect(html).toContain('truncate')
    expect(html).toContain('text-gray-500')
  })
})

describe('Button', () => {
  it('maps variant and size to the shared classes', () => {
    const html = renderToStaticMarkup(<Button variant="primary" size="sm">Go</Button>)
    expect(html).toContain('btn-primary')
    expect(html).toContain('btn-sm')
    expect(html).toContain('type="button"')
  })

  it('disables itself and shows a spinner while loading', () => {
    const html = renderToStaticMarkup(<Button loading icon="check">Save</Button>)
    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('animate-spin')
  })
})

describe('IconButton', () => {
  it('uses the label for both tooltip and screen readers', () => {
    const html = renderToStaticMarkup(<IconButton icon="trash" label="Delete" variant="danger" />)
    expect(html).toContain('title="Delete"')
    expect(html).toContain('aria-label="Delete"')
    expect(html).toContain('btn-icon-danger')
  })
})

describe('Badge / StatusBadge', () => {
  it('applies the tone class', () => {
    expect(renderToStaticMarkup(<Badge tone="success">Win</Badge>)).toContain('badge-success')
  })

  it('maps payment status to semantic tones', () => {
    expect(PAYMENT_STATUS_TONES).toEqual({
      UPCOMING: 'info',
      DUE: 'warning',
      OVERDUE: 'danger',
      PAID: 'success',
      SKIPPED: 'neutral',
    })
    const html = renderToStaticMarkup(<StatusBadge status="PAID" />)
    expect(html).toContain('badge-success')
    expect(html).toContain(en.status.paid)
  })

  it('gives every draft the warning tone with the pencil icon', () => {
    const draft = renderToStaticMarkup(<DraftBadge>Draft</DraftBadge>)
    expect(draft).toContain('badge-warning')
    expect(draft).toContain('<svg')
  })
})

describe('Modal', () => {
  it('renders a labelled dialog with a close button and footer', () => {
    const html = renderToStaticMarkup(
      <Modal title="Edit account" onClose={noop} footer={<span>FOOTER</span>}>
        BODY
      </Modal>,
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-label="Edit account"')
    expect(html).toContain(`aria-label="${en.common.close}"`)
    expect(html).toContain('z-50')
    expect(html.indexOf('BODY')).toBeLessThan(html.indexOf('FOOTER'))
  })

  it('renders only the panel in bare mode', () => {
    const html = renderToStaticMarkup(<Modal title="Editor" onClose={noop} bare>CONTENT</Modal>)
    expect(html).toContain('CONTENT')
    expect(html).not.toContain(`aria-label="${en.common.close}"`)
  })
})

describe('DateInput', () => {
  it('shows the day in the format chosen in Settings, with its pattern and a calendar button', () => {
    setDateFormat('dd MMM yyyy')
    const html = renderToStaticMarkup(<DateInput id="d" value="2026-03-05" onChange={noop} invalid />)
    // Month-name formats are typed as numbers
    expect(html).toContain('value="05/03/2026"')
    expect(html).toContain('placeholder="DD/MM/YYYY"')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain(`aria-label="${en.ui.date_pick}"`)
    setDateFormat('MM/dd/yyyy')
    expect(renderToStaticMarkup(<DateInput value="2026-03-05" onChange={noop} />)).toContain('value="03/05/2026"')
    setDateFormat('dd/MM/yyyy')
  })

  it('moves a day across month and year ends', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29')
  })
})

describe('ConfirmDialog', () => {
  it('puts Cancel (ghost) before the confirm action in the tone colour', () => {
    const html = renderToStaticMarkup(
      <ConfirmDialog title="Delete?" message="Sure?" confirmLabel="Delete" tone="danger" onConfirm={noop} onCancel={noop} />,
    )
    const cancel = html.indexOf('btn-ghost')
    const confirm = html.indexOf('btn-danger')
    expect(cancel).toBeGreaterThan(-1)
    expect(confirm).toBeGreaterThan(cancel)
    expect(html).toContain(en.common.cancel)
    expect(html).toContain('Sure?')
  })
})

describe('CopyButton', () => {
  it('renders a labelled copy button that stays hidden until hover or focus', () => {
    const html = renderToStaticMarkup(<CopyButton value="info@club.gr" />)
    expect(html).toContain(`aria-label="${en.app.copy}"`)
    expect(html).toContain('opacity-0')
    expect(html).toContain('group-hover:opacity-100')
    expect(html).not.toContain(en.app.copied)
  })
})

describe('Popover nesting registry', () => {
  // Stands in for a portaled panel: contains only the nodes it was given
  const panel = (...nodes: object[]) => ({ current: { contains: (n: unknown) => nodes.includes(n as object) } as unknown as HTMLElement })

  it('counts a click in a registered child panel as inside', () => {
    const registry = createPanelRegistry()
    const inChild = {} as Node
    const elsewhere = {} as Node
    registry.register(panel(inChild))
    expect(registry.contains(inChild)).toBe(true)
    expect(registry.contains(elsewhere)).toBe(false)
  })

  it('forgets a child panel once it unregisters', () => {
    const registry = createPanelRegistry()
    const inChild = {} as Node
    const unregister = registry.register(panel(inChild))
    unregister()
    expect(registry.size()).toBe(0)
    expect(registry.contains(inChild)).toBe(false)
  })
})

describe('Pagination', () => {
  it('stays hidden with a single page and no size picker', () => {
    expect(renderToStaticMarkup(<Pagination page={0} totalPages={1} onChange={noop} />)).toBe('')
  })

  it('shows the row range and the page-size picker', () => {
    const html = renderToStaticMarkup(
      <Pagination page={1} totalPages={6} onChange={noop} pageSize={25} pageSizes={[10, 25, 50]} total={142} onPageSizeChange={noop} />,
    )
    expect(html).toContain('26–50 of 142')
    expect(html).toContain(en.ui.page_size)
    expect(html).toContain('2 / 6')
    expect(html).toContain('<option value="50">50</option>')
  })

  it('keeps the size picker but drops the pager when every row fits on one page', () => {
    const html = renderToStaticMarkup(
      <Pagination page={0} totalPages={1} onChange={noop} pageSize={25} pageSizes={[10, 25, 50]} total={18} onPageSizeChange={noop} />,
    )
    expect(html).toContain('1–18 of 18')
    expect(html).not.toContain(en.ui.page_next)
  })

  it('hides when the rows fit in the smallest page', () => {
    const html = renderToStaticMarkup(
      <Pagination page={0} totalPages={1} onChange={noop} pageSize={10} pageSizes={[10, 25, 50]} total={7} onPageSizeChange={noop} />,
    )
    expect(html).toBe('')
  })
})

describe('SortHeader', () => {
  it('marks the sorted column and its direction', () => {
    const html = renderToStaticMarkup(<SortHeader direction="asc" onSort={noop}>Date</SortHeader>)
    expect(html).toContain('aria-sort="ascending"')
    expect(html).toContain(`aria-label="Date ${en.ui.sort_asc}"`)
    expect(html).toContain('rotate-180')
  })

  it('shows no arrow on an idle column', () => {
    const html = renderToStaticMarkup(<SortHeader direction={null} onSort={noop}>Score</SortHeader>)
    expect(html).toContain('aria-sort="none"')
    expect(html).not.toContain('<svg')
  })
})

describe('Filter popover parts', () => {
  it('shows the active filter count on the button', () => {
    const html = renderToStaticMarkup(<FilterPopoverButton count={3} onClearAll={noop}>x</FilterPopoverButton>)
    expect(html).toContain(en.ui.filters)
    expect(html).toContain('(3)')
    expect(renderToStaticMarkup(<FilterPopoverButton count={0} onClearAll={noop}>x</FilterPopoverButton>)).not.toContain('(0)')
  })

  it('FilterChip exposes its pressed state', () => {
    expect(renderToStaticMarkup(<FilterChip active onClick={noop}>Draft</FilterChip>)).toContain('aria-pressed="true"')
  })

  it('ActiveFilterPills renders one removable pill each, or nothing', () => {
    const html = renderToStaticMarkup(
      <ActiveFilterPills pills={[{ key: 'a', label: 'Wins', onRemove: noop }]} onClearAll={noop} />,
    )
    expect(html).toContain('Remove filter: Wins')
    expect(html).toContain(en.ui.filter_clear_all)
    expect(renderToStaticMarkup(<ActiveFilterPills pills={[]} onClearAll={noop} />)).toBe('')
  })
})

describe('ListRow', () => {
  it('opens on click, and in the background on a middle click', () => {
    const onOpen = vi.fn()
    const row = ListRow({ cols: 'grid', onOpen, children: null })
    const inner = row.props.children[0].props
    inner.onClick()
    expect(onOpen).toHaveBeenLastCalledWith()
    inner.onAuxClick({ button: 1, preventDefault: noop, stopPropagation: noop })
    expect(onOpen).toHaveBeenLastCalledWith({ background: true })
  })

  it('has no click handlers without onOpen', () => {
    const inner = ListRow({ cols: 'grid', children: null }).props.children[0].props
    expect(inner.onClick).toBeUndefined()
    expect(inner.onAuxClick).toBeUndefined()
  })
})

describe('SelectMenu', () => {
  const options = [{ value: '2026a', label: '2026a' }, { value: '2025b', label: '2025b', disabled: true }, { value: '2025a', label: '2025a' }]

  it('shows the chosen option in a kit-styled trigger, closed', () => {
    const html = renderToStaticMarkup(<SelectMenu ariaLabel="From" value="2025a" options={options} onChange={() => {}} />)
    expect(html).toContain('select-field')
    expect(html).toContain('aria-haspopup="listbox"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-label="From"')
    expect(html).toContain('>2025a<')
    expect(html).not.toContain('role="option"')
  })

  it('shows the placeholder while nothing is chosen', () => {
    const html = renderToStaticMarkup(<SelectMenu ariaLabel="Club" value={null} placeholder="Pick a club" options={[]} onChange={() => {}} />)
    expect(html).toContain('Pick a club')
  })

  it('moves the keyboard highlight over enabled options only, wrapping around', () => {
    expect(nextEnabledIndex(options, 0, 1)).toBe(2)
    expect(nextEnabledIndex(options, 2, 1)).toBe(0)
    expect(nextEnabledIndex(options, 0, -1)).toBe(2)
    expect(nextEnabledIndex([{ disabled: true }], 0, 1)).toBe(-1)
  })
})

describe('CollapsibleCard', () => {
  it('follows the open prop in controlled mode', () => {
    const closed = renderToStaticMarkup(<CollapsibleCard id="c" title="2025b" summary="+1" open={false} onToggle={() => {}}>Body</CollapsibleCard>)
    expect(closed).toContain('aria-expanded="false"')
    expect(closed).toContain('+1')
    expect(closed).not.toContain('Body')
    const open = renderToStaticMarkup(<CollapsibleCard id="c" title="2025b" open onToggle={() => {}}>Body</CollapsibleCard>)
    expect(open).toContain('aria-expanded="true"')
    expect(open).toContain('Body')
  })
})

describe('placePanel', () => {
  const viewport = { width: 1000, height: 800 }
  const box = (left: number, top: number, width = 100, height = 32) => ({ left, top, right: left + width, bottom: top + height, width })
  const panel = { width: 400, height: 300 }

  it('lines up with the anchor when the panel fits', () => {
    expect(placePanel(box(500, 100), panel, viewport, 'end')).toMatchObject({ top: 136, left: 200 })
    expect(placePanel(box(500, 100), panel, viewport, 'start')).toMatchObject({ top: 136, left: 500 })
  })

  it('end-aligned near the left edge flips to the start edge, staying under the anchor', () => {
    expect(placePanel(box(240, 100), panel, viewport, 'end').left).toBe(240)
  })

  it('start-aligned near the right edge flips to the end edge', () => {
    expect(placePanel(box(800, 100), panel, viewport, 'start').left).toBe(900 - 400)
  })

  it('is clamped inside the window when neither edge fits', () => {
    expect(placePanel(box(2, 100, 20), panel, viewport, 'end').left).toBe(8)
    expect(placePanel(box(990, 100, 8), panel, viewport, 'start').left).toBe(1000 - 400 - 8)
  })

  it('a panel wider than the window is capped to it', () => {
    expect(placePanel(box(300, 100), { width: 1200, height: 300 }, viewport, 'end')).toMatchObject({ left: 8, maxWidth: 984 })
  })

  it('flips above the anchor when there is no room below', () => {
    expect(placePanel(box(500, 700), panel, viewport, 'start').top).toBe(700 - 4 - 300)
  })

  it('matchWidth keeps the anchor width as the minimum', () => {
    expect(placePanel(box(500, 100, 250), panel, viewport, 'start', true).minWidth).toBe(250)
  })

  it('matchWidth caps a wide panel to the anchor, lined up under it', () => {
    expect(placePanel(box(100, 100, 400), { width: 1200, height: 300 }, viewport, 'start', true)).toMatchObject({ left: 100, maxWidth: 400 })
  })

  it('matchWidth under a narrow anchor still allows 320px', () => {
    expect(placePanel(box(100, 100, 100), { width: 1200, height: 300 }, viewport, 'start', true).maxWidth).toBe(320)
  })
})
