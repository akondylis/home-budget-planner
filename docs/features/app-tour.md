# App tour

**User's job:** learn where everything lives once, without reading documentation.

## UX

- Starts by itself on the first launch. Replay it from Settings › Help › **Take the app tour**, or `Ctrl+K` → "tour".
- A centred welcome, then a spotlight on each sidebar area (Overview, Transactions, Budget, Accounts & cards,
  Subscriptions & bills, Debts & loans, Projections + Reports, Settings) and finally the title bar search (`Ctrl+K`).
- Areas not built yet say "Coming soon" and what they will do, so the tour stays honest.
- The card shows "Step N of M", **Skip tour**, **Back** and one primary **Next** / **Done**.
- Keys: Enter or → next, ← back, Esc skip; Tab stays inside the card. Clicks outside the card are blocked.

## Behaviour

- Steps are `TOUR_STEPS` in `lib/app-tour.ts`. Each points at `data-tour="<id>"` anchors: sidebar items carry their
  view id, and the search button carries `search`. A step with several anchors spotlights them together.
- The card goes beside the target (right, then left), else below or above, else centred, and always stays inside
  the window. The layout is measured again 250 ms after a step change, when the sidebar may still be animating.
- `tourSeen` (persisted in `ui-prefs`) is set when the tour is finished or skipped; `tourStep` is per session.

## Adding a step

Add the step to `TOUR_STEPS`, the anchor to the element, and `tour.steps.<id>.{title,body}` in both languages
(the test fails otherwise). Keep the body to two short sentences about what the user does there.

## Code & tests

`lib/app-tour.ts`, `components/tour/AppTour.tsx`, `.tour-spotlight` in `assets/index.css`, state in `store/ui.ts`.
Tests: `lib/app-tour.test.ts`, `components/tour/AppTour.test.tsx`.
