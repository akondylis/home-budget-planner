# Notifications

**User's job:** "What needs my attention money-wise, without hunting for it?"
A bell in the sidebar gathers what needs a hand: bills due or late, income that has not come in, categories over
their plan, rows to categorise and accounts with no recent statement. While the app is open, Windows toasts call out
what is due today or late. Ported from Matchday's bell (`../chess-board`). Plan:
`.claude/plans/plan-roadmap-notifications-polished-donut.md`.

## UX

- **Bell** (sidebar footer, above the member chip): **Notifications** with a red unread count (`9+` above 9). In the
  collapsed sidebar the count sits on the icon and the tooltip reads "Notifications · 3 unread". `Ctrl+K`
  "Notifications" opens it too, and the app tour points at it.
- **Panel** (384 px popover): title and "N unread", then **Mark all read** and **Clear all**. **Clear all** asks
  first and explains that items come back only when something new happens. Groups: **Overdue** → **Due soon** →
  **Budget & data**, most urgent first.
- **Row:** an unread dot, then an icon and title ("ΔΕΗ is due tomorrow", "Rent is not paid yet"). The icon and its
  colour carry the severity: red for late or due today, amber for soon, grey for info. Next comes a detail line
  (amount, date, "4 days late"), then one main button with any other actions in **…**, and **Hide (×)**. Clicking a
  row marks it read. Acting on it marks it read and closes the panel.

| Kind | Shows when | Main action (others) |
| --- | --- | --- |
| Bill due | Unpaid and inside the reminder window (urgent on the day) | **Mark as paid** (Skip this one, Open bills) |
| Bill overdue | Due date passed, unpaid and not skipped | **Mark as paid** (Skip this one, Open bills) |
| Income late | An income rule's date passed with nothing booked | **Mark as received** (Skip, Open bills) |
| Over budget | A *planned* outgoing category spent past what was available this month | **Open budget** (that month) |
| To categorise | Any rows without a category (transfers aside) | **Categorise** (the log, every month, uncategorised) |
| No import lately | An account's last imported statement ended 30+ days ago | **Import statement** (wizard on that account) |

- **Mark as paid** opens the same dialog as the Subscriptions & bills page, so nothing new has to be learned.
- **Empty state:** "All caught up" with a line naming what would show. It has no disabled buttons.
- **Settings › Notifications:** **Remind me before a bill** (on the day, 1, 2, 3, 5, 7 or 14 days; default 3, the
  same as a bill's *Due* status) and **Windows notifications** On/Off (on by default).
- **Bill form › More options:** **Remind me**, with "As in Settings (3 days before)" first and choices up to 30 days.
  It is hidden for income, because income only shows once it is late.
- **Toasts:** one per new item that is due today, overdue or late income, shown once. More than 3 at once become one
  summary ("4 things need a hand"). Clicking a toast restores and focuses the window and opens the bell.

## Behaviour

- **Computed, never stored** (Matchday pattern). Providers in main build the list each time it is read. Only marks
  are stored in `NotificationState` (key → readAt, dismissedAt, toastedAt). Marks whose item is gone are pruned, but
  only when every provider answered, so one failing provider never wipes the others' marks.
- **Stable keys** decide what "the same item" is. Bills use `bill:<ruleId>:<dueDate>` and income uses
  `income:<ruleId>:<dueDate>`. Budget items use `budget:<month>:<categoryId>`. To-categorise uses
  `categorise:<newest row id>`, so a new uncategorised row brings a hidden nudge back. Imports use
  `import:<accountId>:<last batch id>`.
- Paying a bill, whether it was typed, imported or marked, removes its item by itself. That is the same matching as
  #7 (`listUnpaid`).
- **Lead time** (decided 2026-10-30) is the rule's `remindDays` when set, else `AppSettings.notifyLeadDays`. Overdue
  dates go back as far as the Overview's card does.
- Unplanned spending is the budget's own banner, so it is not raised here.
- The renderer refreshes the list on launch, on page change, on window focus, after any ledger change (store
  revision) and when a toast is clicked. Toasts are checked 5 s after the window shows and then hourly, which also
  catches the day changing. Toasts only run while the app is open (decided 2026-10-30), with no tray or login item.
- Toast texts come from the same `notifications.*` keys, read from `en.json`/`el.json` in main. The wording is built
  once in `src/shared/notification-text.ts`. The Windows app id is set from `electron-builder.yml` (`appId`).

## Code

| Path | Role |
| --- | --- |
| `src/shared/notifications.ts` | Types, keys, merge/sort, groups, lead-time constants, `pickToasts` |
| `src/shared/notification-text.ts` | Title and detail line of an item, for the bell and the toasts |
| `src/main/services/notifications.ts` | Provider registry, `collectNotifications`, marks |
| `src/main/services/notification-providers.ts` | Pure `compute*` per kind plus the four providers |
| `src/main/services/notification-toasts.ts` | Windows toasts, the main-side translator, the hourly check |
| `src/main/ipc/notifications.ts` | `notification:*` handlers |
| `src/renderer/src/store/notifications.ts` | List, panel state, marks |
| `src/renderer/src/components/notifications/` | `NotificationCenter` (bell + panel), `NotificationRow` |
| `src/renderer/src/lib/notifications.ts` | Action labels and icons, groups, lead-day labels |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `notification:list` | — → `AppNotification[]` | — |
| `notification:markRead` | `keys[]` → — | — |
| `notification:markAllRead` / `notification:dismissAll` | — → — | — |
| `notification:dismiss` | `key` → — | — |
| `settings:setNotifications` | `{ leadDays, toasts }` → — | `INVALID_INPUT` |
| `notification:open` *(main → renderer event)* | `key \| null` | — |

## Tests

- `src/shared/notifications.test.ts` covers merging marks, sorting, groups, signed days, the "when" wording and
  toast picking with its summary above 3.
- `src/main/__tests__/notifications.test.ts` covers the household versus the rule lead time, urgent on the day,
  overdue, late income, paid dates dropped, over budget for planned categories only, the to-categorise key changing
  with a new row, stale imports at 30 days, pruning kept when a provider fails, and the toast translator.

## Later

- Instalment due (#9 adds its own provider). Payment calendar (#17). A tray icon that toasts with the window closed
  would need a decision.
