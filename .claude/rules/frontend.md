---
name: Frontend Rules
description: React, Zustand, Tailwind, i18next patterns for the Home Budget renderer
type: feedback
paths:
  - src/renderer/src/**/*.tsx
  - src/renderer/src/**/*.ts
  - src/preload/**/*
---

## Framework & State Management

- **React 19** with **TypeScript** (strict mode)
- **Zustand** for client state (stores in `src/renderer/src/store/`)
  - Each store exports a custom hook: `export const useUiStore = create<UiStore>(...)`
  - Store actions mutate state immutably using updater functions
- **i18next** for all visible strings; never hardcode text
  - `const { t } = useTranslation()` in components
  - Key format: `'feature.action'` (e.g. `t('overview.left_to_spend')`)
  - Fallback language: `'el'` (Greek); English in `en.json`. Every key exists in both files

## UX (binding — full guide in `docs/design-principles.md`)

- Follow current UX best practice and trends and keep the UI clear: progressive disclosure, grouped/searchable long lists, inline help and live feedback; dialogs never scroll sideways
- One primary (solid) button per screen/dialog; labels name the outcome ("Add expense", not "OK")
- Title → context line (`MetaLine`: month · account · member) → content → secondary actions; identity fields before options
- Smart defaults from known data (today, last account, last category for this payee); after a create, show the created item
- Inline validation next to the field (hint turns into the error); disabled controls explain why; designed empty states
- Reuse `components/ui` (`Modal`, `Field`, `Segmented`, `Banner`, `Button`, `IconButton`, `Badge`, `StatusBadge`, `Money`, `StatTile`, `List`, `PageHeader`); extend the kit rather than adding one-off variants
- Check light/dark and ΕΛ/EN at the default window size; never truncate names, amounts or status

## Money in the UI

- Amounts are integer cents end to end. Display with `<Money cents={…} />` (plain) or `<Money tone="auto" />` (pill); parse inputs with `parseMoney()`; never `toFixed`, never float maths
- Amount columns are right-aligned with `tabular-nums` (the `.money` class does this)
- Income/expense is never colour alone: sign (+/−), label or icon go with the colour

## Styling

- **Tailwind CSS** with theme-aware colours: `tailwind.config.ts` maps gray, blue, red, amber, green, yellow, purple and orange onto CSS variables in `assets/theme.css`, which flip under `.dark`
- Colours: palette names (gray-*, amber-*, …) or semantic tokens (`bg-surface`, `bg-bg`, `border-line`, `text-fg`, `text-fg-muted`, `bg-accent`, `bg-success`/`text-success-fg` …); never `bg-white` for panels (use `bg-surface`), never hex values
- Literal colours that must not flip: `white`, `black` and `neutral-*`; wrap must-stay-light areas in `.theme-light`
- Contrast (WCAG AA, 4.5:1 for text): on surface use gray-500 or darker for text (never `text-gray-400`), and the 700 shade for red/amber/green/yellow text; solid buttons with `text-white` use blue/red/purple-600 or green/amber/orange-700 (dark mode switches their text to near-black automatically)
- No inline styling: no `style={{…}}` for static values, no `<style>` blocks, no hex/arbitrary colours. Static styles in Tailwind classes; shared rules in `assets/index.css` (`@layer components`); colour values only in `assets/theme.css` as tokens. Exception: values computed at runtime (zoom, popover position, progress width)
- Dates: `formatDate()` / `formatDateTime()` (`lib/date-format.ts`) in the format chosen in Settings; never `toLocaleDateString()`
- Charts: follow the `dataviz` skill; colours from tokens only

### Button Icons
- Icons come only from the shared `Icon` component (`components/shell/icons.tsx`); add new glyphs there (24×24, stroke, `currentColor`). No icon libraries, no emoji on buttons
- Action buttons with text get a leading icon via `Button icon="…"`
- Standard mapping: Save/Confirm → `check`, Cancel/Close → `close`, Edit → `pencil`, Delete → `trash`, Add → `plus`
- Icon-only buttons use `IconButton` with a translated `label` (tooltip + aria-label)

## Component Patterns

```tsx
export interface AccountRowProps {
  name: string
  balanceCents: number
  archived: boolean
}

export function AccountRow({ name, balanceCents, archived }: AccountRowProps) {
  const { t } = useTranslation()
  return <div>...</div>
}
```

- Use Zustand hooks for shared state; React hooks only for local UI state
- Pages in `src/renderer/src/pages/`; sub-components in `src/renderer/src/components/<feature>/`
- Split components >800 lines; keep state logic in stores/lib, pages presentational
- Details on hover: `HoverCard` + `HoverCardDetails` (`components/ui`); show what the row already has, fetch the rest on open (alive guard + `Spinner`); never put an action only on hover → `docs/features/hover-cards.md`
- New commands go in the `Ctrl+K` palette (`lib/command-palette.ts`) and new shortcuts in `SHORTCUTS` (`hooks/useShortcuts.ts`); new main areas get a tour step (`lib/app-tour.ts`)
- Printable output: build a `ReportDocument` and open it in `ReportPreviewModal` (preview before export) → `docs/features/pdf-export.md`

## IPC Communication

- **Renderer → Main**: `window.api.<method>(args)`; each method is defined in `src/preload/index.ts` (wrapping `ipcRenderer.invoke('domain:action', …)`) and typed in `src/renderer/src/env.d.ts` — add new channels in both
- Error handling: catch in the renderer; map codes via `lib/ipc-errors.ts` to `error.*` keys
- No database access in renderer

## Testing

- Vitest files next to the code: `*.test.ts(x)`
- UI kit tests render with `renderToStaticMarkup` (`components/ui/ui.test.tsx`)
- All new features require test coverage → `docs/testing-strategy.md`
