# Hover cards

**User's job:** see the details of something without opening it or leaving the list.

## UX

- Hover (or focus) a trigger: after 300 ms a card shows next to it. Moving the pointer into the card keeps it open,
  so its text can be selected and copied. Esc, scrolling the page or resizing closes it.
- Placement: `below` the trigger (list rows) or `beside` it (sidebar), flipping when there is no room and always
  inside the window.
- Today: the collapsed sidebar names each page (with *Coming soon* and what it will do for areas not built yet), and
  the title bar's **Portable** badge shows the data folder.

## Rules for new cards

- Use `HoverCard` + `HoverCardDetails` (`components/ui`): label/value pairs, empty values skipped, values wrap
  instead of truncating.
- Show what the row already holds. Anything else is fetched when the card opens, with an `alive` guard and a
  `Spinner`.
- The card adds detail; it is never the only way to do something (no actions that exist only on hover).
- Use `focusable={false}` when the trigger is already a button or link.

## Code

| Path | Role |
| --- | --- |
| `src/renderer/src/components/ui/HoverCard.tsx` | `HoverCard`, `HoverCardDetails`, `placeHoverCard` |
| `src/renderer/src/components/shell/Sidebar.tsx` | `NavCard` (collapsed sidebar) |
| `src/renderer/src/components/shell/TitleBar.tsx` | Portable badge card |

## Tests

`components/ui/HoverCard.test.ts` (placement below and beside, flipping, window edges).
