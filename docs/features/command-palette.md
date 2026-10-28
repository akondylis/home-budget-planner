# Command palette, shortcuts & back/forward

**User's job:** get to any page or run any command without hunting through menus. `Ctrl+K` (or **Search** in the
title bar) opens one search box over pages, commands and preferences.

## UX

- **Entry point:** `Ctrl+K` anywhere (it matches the physical key, so it works on the Greek layout too), or the
  **Search · Ctrl K** button in the title bar.
- **Empty query:** shows **Go to** with every page, so the palette doubles as a keyboard menu.
- **Typing:** every command is searched: pages, *Print a monthly budget worksheet*, *Take the app tour*,
  *Open data folder*, sidebar and zoom commands with their keys, the other two themes and the other language.
  Search ignores accents, case and script: `ρυθ`, `ruthm` and `sett` all find Settings.
- **Keys:** ↑ ↓ move, Enter runs, Esc or `Ctrl+K` again closes. The best hit is preselected.
- **No results:** "No results for “…”" with a hint of what can be searched.
- **Back / forward:** like a browser, through the pages visited (and the Categories tab shown): the mouse side
  buttons, `Alt+←` / `Alt+→`, or the arrows at the left of the title bar, which grey out when there is nowhere to go.
- **Cheat-sheet:** `?` or `F1` (or *Keyboard shortcuts* in `Ctrl+K`) lists every shortcut; `?` typed in a field stays text.
- **Print:** `Ctrl+P` opens the print preview of the page on screen (Budget: its monthly sheet); elsewhere the monthly
  worksheet. Same as Matchday; its tab shortcuts are left out (no tabs here).

## Behaviour

- Shortcuts are one table, `SHORTCUTS` in `hooks/useShortcuts.ts` (palette, sidebar, zoom). The palette shows the
  same keys, so a shortcut is never documented in two places. A page claims `Ctrl+P` with `usePrintShortcut()`.
- History records by watching the current view (`useNavHistory`), so no navigation call has to push; repeats are
  ignored, going somewhere new after **Back** drops the forward part, at most 50 entries, per session.
- While a dialog is open only view shortcuts (sidebar, zoom) work, and the mouse back/forward buttons do nothing; the rest belong to the page behind it.
- Ranking: the title starts with the query → a title word starts with it → found in the subtitle or keywords.

## Extending it

A new domain adds, in `lib/command-palette.ts`: a `PaletteTarget` kind, a `PaletteGroup` with its limit in
`GROUP_LIMITS`, and an `<entity>Items()` builder. `CommandPalette` loads that data when it opens, and `App`'s
`runPaletteTarget` decides what running it does. Keep groups short (5–8 hits) and the subtitle to one line of context.

## Code

| Path | Role |
| --- | --- |
| `src/renderer/src/hooks/useShortcuts.ts` | `SHORTCUTS`, `matchShortcut` (on `e.code`), one window keydown listener |
| `src/renderer/src/lib/command-palette.ts` | Items, ranking, sections (pure) |
| `src/renderer/src/components/CommandPalette.tsx` | Modal (`bare`), ARIA combobox/listbox |
| `src/shared/search-normalise.ts` | `normalise()`: Greek → Latin, accents stripped |
| `src/renderer/src/hooks/useNavHistory.ts`, `lib/nav-history.ts` | Back/forward history (pure steps in `lib`) |
| `src/renderer/src/hooks/useMouseNav.ts` | Mouse side buttons (claims them so Chromium does not navigate) |
| `src/renderer/src/components/ShortcutsModal.tsx` | Cheat-sheet (`?` / `F1`) |
| `src/renderer/src/App.tsx` | `commands`, `runPaletteTarget`, nav entry of the current view |

## Tests

`lib/command-palette.test.ts` (ranking, actions, sections), `hooks/useShortcuts.test.ts` (key matching), `lib/nav-history.test.ts`, `shared/search-normalise.test.ts`.
