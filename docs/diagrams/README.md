# Diagrams

| Diagram | Source (edit this) | Output (generated) |
| --- | --- | --- |
| Architecture + IPC: how a user action travels renderer → preload → main → data | `architecture.json` | `architecture.svg`, `architecture.png` |

Run `/redraw-diagram` after changing IPC handlers or the preload. It checks the JSON against `src/main/ipc/` and
`src/preload/index.ts`, then draws the SVG and PNG. Never edit the SVG or PNG by hand.
Every diagram follows [design-principles.md §0](../design-principles.md#0-best-practice-first-the-users-job-always).
