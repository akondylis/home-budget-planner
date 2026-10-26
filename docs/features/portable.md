# Portable USB edition

**User's job:** carry the household budget on a USB stick and use it on any Windows PC without installing anything.
Each build also produces `HomeBudget-Portable-<version>.zip` next to the installer.

## UX

- **Unzip and run.** The zip holds one `HomeBudget/` folder: the app, an empty `portable` marker file and an empty
  `HomeBudget-data/`. Run `HomeBudget/Home Budget.exe`. Nothing is written to AppData.
- **Always visible.** A **Portable** badge (USB icon) sits beside the app title; hovering it shows the data folder.
  Settings › About repeats the badge and adds the folder to the data-folder hint.
- **No silent surprises.** A read-only or write-protected folder shows a bilingual error with the path, and the app
  quits. It never falls back to AppData, so the data never splits between the stick and the PC.

## Behaviour

| Aspect | Installed | Portable |
|---|---|---|
| `userData` | `%APPDATA%/home-budget-planner` | `<exe dir>/HomeBudget-data` |
| localStorage (UI prefs, tour seen) | in `userData` | in `HomeBudget-data` (travels with the stick) |
| SQLite journal | `WAL` + `synchronous = NORMAL` | `DELETE` + `synchronous = FULL` (one file, safer if pulled out) |
| Startup DB copy | — | `HomeBudget-data/backups/startup-YYYYMMDD-HHmmss.db`, newest 5 (by name) |
| Quit | WAL checkpoint | no checkpoint needed |

Detection: a packaged build **and** a file named `portable` next to the exe. An explicit `--user-data-dir` wins.

## Code

| Path | Role |
| --- | --- |
| `src/main/user-data.ts` | `isPortable`, `pinUserDataPath`, `isDataDirWritable` |
| `src/main/db/db-path.ts` | Pins `userData` before anything reads it |
| `src/main/db/pragmas.ts` | `applyJournalPragmas` per edition |
| `src/main/db/startup-backup.ts` | `writeStartupCopy`, `pruneStartupCopies` |
| `src/main/index.ts` | Read-only check, startup copy, quit |
| `scripts/build-portable-zip.mjs` | `npm run build:portable` (chained into `npm run build`); zips with Windows `tar.exe` |

## IPC

`settings:appInfo` → `{ portable, dataDir }` (title bar badge, Settings).

## Tests

`src/main/__tests__/user-data.test.ts`, `portable-db.test.ts`.
