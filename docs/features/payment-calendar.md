# Payment calendar

**User's job:** "When does money leave and arrive this month and this year, and what have we not paid yet?" The
calendar puts bills, subscriptions, debt instalments and expected income on their dates, with paid marks and the
amount still due, instead of a grouped list. Starts from **Calendar** in the sidebar (also `Ctrl+K`), the
**Calendar** button on Subscriptions & bills, and **See them on the calendar** under the Overview's Upcoming bills.

## UX

- **Header:** "Calendar" with the context line (`Next: Rent −€650.00 on 05/11/2026 • 1 overdue`). On the right,
  **Export .ics** (secondary; disabled with the reason when there are no bills).
- **Toolbar:** **Month | List | Year** (remembered per PC; List by default on a narrow window), the period switcher
  (‹ November 2026 › with **This month**, or ‹ 2026 ›), and the status chips **All · To pay · Paid · Income** with
  counts (Month and List).
- **Month:** a grid from the household's first day of the week (Settings), plus a **Week** column with what is
  still to pay that week and what comes in. A day shows its total only when two or more bills are still due, then
  its items; a busy day folds the rest into **+N more**. Today is a filled circle. Arrow keys move between days
  (across months), Home/End go to the week's ends, Enter goes into the day's first item.
- **Items:** name and signed amount; status by icon and look, never colour alone: overdue (alert icon, danger
  tint), paid (check, muted), skipped (minus, struck amount), income (+ amount, income edge), still to pay
  (expense edge). Names never truncate: a long one pushes the amount to the next line. A click opens the date,
  schedule or instalment, status, the paying row, and the bills page's actions: **Mark as paid…**, **Skip this
  one**, **Mark as unpaid** (hand marks only), **Edit** (or **Open debt** for an instalment).
- **List:** **Overdue** on top (from the last month), then **This week**, **Next week** and later weeks up to eight
  ahead, each with "Still to pay" and "Coming in" (never netted); rows are the bills page's `BillRow`.
- **Year:** twelve month tiles with **Out** vs **In** as two thin bars on one scale (`chart-expense` /
  `chart-income`, legend above, every bar with its amount), bills still to pay, pay days, the **Heaviest month**
  badge and overdue counts; this month is outlined. A tile opens that month in the Month view.
- **States:** no bills → empty card with **Add bill** and **Subscriptions & bills**; nothing in a month or under a
  filter → a quiet note; load or action error → banner; export → "Saved 74 due dates…" with **Open**, or "Nothing
  is due in the next 12 months".

## Behaviour

- Reads `billOccurrences` (the bills page's source): every active rule, income and debt instalments included, with
  matched or hand marks. Nothing is stored; it reloads after any write, so Mark as paid here updates the bills page
  and the bell.
- Ranges: Month = the grid's whole weeks; List = today − 31 days to eight weeks from this week's start; Year = 1 Jan
  to 31 Dec. Due dates more than 31 days before a rule was created stay out (as on the bills page).
- Totals: "still to pay" counts unpaid bills, "coming in" unpaid income; skipped dates count nowhere. The Year
  tiles count every bill and income due that month, paid or not.
- **Week starts on** Monday (default) or Sunday: Settings › Language, household-wide (`AppSettings.weekStartsOn`,
  decided 2026-11-01).
- **Export .ics** (decided 2026-11-01): open due dates and expected income of the next 12 months as all-day
  entries, saved where the user picks; nothing is sent anywhere. A bill reminds at 09:00 on its own lead time or
  the household's (Settings › Notifications); income has no reminder. UIDs are `<rule>-<date>`, so importing
  again updates the entries.

## Code

| Path | Role |
| --- | --- |
| `src/shared/calendar-grid.ts` | `WeekStart`, `weekStart`, `monthWeeks`, `weekdayNames` |
| `src/shared/ics.ts` | `toIcs` (RFC 5545: escaping, folding, alarms), `isIcsEntry`; ported from Matchday |
| `src/main/services/calendar-export.ts` | `exportCalendarIcs`: checks the entries, save dialog, writes the file |
| `src/main/services/settings.ts` | `setWeekStart` |
| `src/renderer/src/lib/payment-calendar.ts` | Status filter, totals, ranges, `buildAgenda`, `buildYear`, `toIcsEntries` |
| `src/renderer/src/pages/CalendarScreen.tsx` | Page: header, toolbar, views, export, states |
| `src/renderer/src/components/calendar/` | `MonthGrid`, `PaymentChip`, `AgendaList`, `YearStrip` |
| `src/renderer/src/components/recurring/useBillActions.tsx` | Due-date actions shared with the bills page |
| `src/renderer/src/store/ui.ts` | `weekStartsOn` (from AppSettings), `calendarView` (per PC), month and year (session) |

## IPC

| Channel | Args → result | Errors |
| --- | --- | --- |
| `calendar:exportIcs` | `(entries, calendarName, fileName, dialogTitle)` → `{ success, filePath?, count? }` | `INVALID_INPUT`, `ICS_EXPORT_FAILED` |
| `settings:setWeekStart` | `(0 \| 1)` → `void` | `INVALID_INPUT` |

## Tests

`src/shared/calendar-grid.test.ts` (Monday/Sunday weeks, five- and six-week months, leap February, weekday names),
`src/shared/ics.test.ts` (escaping, folding Greek text, all-day dates, reminders, stable output, input check),
`src/renderer/src/lib/payment-calendar.test.ts` (totals without skipped, status counts, ranges, agenda, year and
heaviest month, header line, .ics entries) and `src/main/__tests__/settings-services.test.ts` (week start).

**Later:** a live calendar feed instead of a file (needs a server, see Multi-PC in the roadmap); pay-period months
(#20).
