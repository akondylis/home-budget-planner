# Command palette & shortcuts

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

## Behaviour

- Shortcuts are one table, `SHORTCUTS` in `hooks/useShortcuts.ts` (palette, sidebar, zoom). The palette shows the
  same keys, so a shortcut is never documented in two places.
- While a dialog is open only view shortcuts (sidebar, zoom) work; the rest belong to the page behind it.
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
| `src/renderer/src/App.tsx` | `commands`, `runPaletteTarget` |

## Tests

`lib/command-palette.test.ts` (ranking, actions, sections), `shared/search-normalise.test.ts`.
