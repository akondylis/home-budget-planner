# Feature docs

One doc per shipped feature, named after the feature (`portable.md`, `pdf-export.md`). Written for the next person
who changes the feature: what the user sees first, then how it works.

## Template

```
# <Feature name>

<One paragraph: the user's job this feature does, and where it starts.>

## UX          entry point, primary action, defaults, states (empty / error / success), hierarchy
## Behaviour   rules and edge cases; a table when installed/portable or similar modes differ
## Code        file map: path → role
## IPC         channels (`domain:action`) with args → result and error codes
## Tests       what is covered and where
```

Leave out sections that would be empty.

## Size and archiving

- Keep each doc in `docs/` at **150 lines or fewer**.
- Move implementation detail to `docs/archived/<feature>-detail.md` and leave a summary behind.
- The archived file starts with `Summary lives in [../features/<feature>.md](../features/<feature>.md)`.
- The feature doc links to the detail with anchors (`../archived/<feature>-detail.md#data-model`).

## Where things go

| What | Where |
| --- | --- |
| Plans (plan mode) | `.claude/plans/`; the roadmap row names the plan file |
| Shipped feature | `docs/features/<feature>.md` + a **Done** row in `docs/roadmap.md` linking to it |
| Open questions | **Needs a decision** in `docs/roadmap.md`; long discussions in `docs/discussions/<topic>.md` |
| Diagrams | `docs/diagrams/` (JSON source → SVG/PNG via `/redraw-diagram`) |
| Overflow detail | `docs/archived/` |
