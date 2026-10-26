---
name: redraw-diagram
description: Redraw the architecture + IPC diagram (docs/diagrams/architecture.svg and .png) from docs/diagrams/architecture.json, with every IPC channel checked against ipcMain.handle in src/main/ipc/ and every window.api method against src/preload/index.ts. Use when the user asks to draw, redraw, update or regenerate the diagram, or after a change to the IPC handlers or the preload leaves it out of date.
argument-hint: "[what changed, optional]"
---

# Redraw the architecture diagram

The diagram is generated, never drawn by hand.

| File | Role |
| --- | --- |
| `docs/diagrams/architecture.json` | **What the diagram says:** the lanes (Renderer, Preload, Main) and one column per IPC domain: `title`, `screen` (where the user starts it), `calls` (`api` ↔ `channel`), `handler`, `service`, `store`. You edit this. |
| `.claude/skills/redraw-diagram/draw-architecture.mjs` | Checks the JSON against the code, lays it out, writes the SVG and then the PNG. |
| `.claude/skills/redraw-diagram/render-png.mjs` | Renders an SVG to a PNG of the same size through headless Edge or Chrome. No dependencies. |
| `docs/diagrams/architecture.svg` / `.png` | The output. Never edit it by hand. |

`$ARGUMENTS`, if given, says what changed. Read the sources anyway: the diagram must match them, not the request.

## Design rules

The diagram follows `docs/design-principles.md` §0 (best practice first, the user's job always):
- One idea: how a user action travels renderer → preload → main → data. Nothing else goes in.
- Reading direction top to bottom, one column per domain, no crossing lines.
- Plain words for the `screen` lines (where the user starts the action); code names only in mono text.
- Fixed light colours: the SVG is an image on a white page in both themes. Lane colours stay distinct for colour-blind readers (blue, purple, orange, green); every lane also carries its name, so colour is never the only cue.

## 1. Read the sources of truth

- `src/main/ipc/*.ts`: every `ipcMain.handle('domain:action', …)`
- `src/preload/index.ts`: every `name: (…) => ipcRenderer.invoke('domain:action', …)`
- `src/main/services/`: which service each handler calls
- `docs/features/*.md`: where the user starts each action (the `screen` lines)

## 2. Update the JSON

- One `domains[]` entry per `src/main/ipc/<file>.ts`, in the order a new user meets them.
- `calls[]`: every `window.api` method of that domain with its channel.
- `local[]`: preload methods that do not use IPC (e.g. `zoom`), shown as a footnote.
- A card line fits about 26 characters at 13px (mono 12px: about 37). The script refuses text that won't fit.

## 3. Check, then draw

```bash
node .claude/skills/redraw-diagram/draw-architecture.mjs --check
node .claude/skills/redraw-diagram/draw-architecture.mjs
```

**`--check` fails if:**
- a drawn channel has no `ipcMain.handle`, or is handled in a different file than the column says
- a `window.api` name is not in the preload, or invokes a different channel
- a handler or a preload `invoke` exists that the diagram does not show
- a channel is drawn twice, or a `local` api is not in the preload
- any text is too wide

Fix the JSON and run the check again. Never loosen the checks to get past them.

**Previews and PNG rendering**
- To preview without touching the real files, add `--out <path-without-extension>` pointing into your scratchpad. Add `--no-png` for the SVG only.
- **Never use `convert`.** On Windows it is the system disk-conversion tool, not ImageMagick. Use the script's browser rendering only.
- If no browser is found, the script writes the SVG, says so and exits with code 2. Report that instead of trying another tool.

## 4. Look at the result

Open the PNG with the Read tool and check:
- Every label sits inside its card and nothing overlaps.
- Columns line up across the lanes; arrows run straight down.
- The channels and api names match the code you read.

If something looks wrong, fix the JSON (or, for a layout bug, the draw script) and draw again.

## 5. Finish

- Keep `docs/diagrams/README.md` accurate.
- `docs/architecture.md` embeds `diagrams/architecture.svg`.
- Tell the user what changed and give the PNG path. Don't commit unless asked; then use `/git-commit`.
