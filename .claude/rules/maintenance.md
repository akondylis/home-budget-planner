---
description: Automation triggers for docs, release and file maintenance
---

# 🛠️ Maintenance & Documentation Triggers

- **Roadmap Sync**: When a feature ships, move it to **Done** in `docs/roadmap.md` (date + one line + link to its doc). When a decision in **Needs a decision** is made, record the answer and the date there before planning work on it.
- **Feature Docs**: A shipped feature gets `docs/features/<feature>.md` (template in `docs/features/README.md`); the roadmap **Done** row links to it, and a **Future** row names its plan file (`.claude/plans/…`) in *Depends on / plan*.
- **Diagrams**: When IPC channels or preload methods change, run `/redraw-diagram` so `docs/diagrams/architecture.*` matches the code.
- **Domain Model Sync**: When `prisma/schema.prisma` gains or changes a domain model, update `docs/domain-model.md` so the doc matches the schema.
- **i18n Parity**: Every key added to `en.json` is added to `el.json` in the same change (and vice versa).
- **Environment Sync**: If `package.json` dependencies or build configuration change, check whether `README.md` setup steps need an update.
- **Changelog Hygiene**: When the version in `package.json` is bumped, `CHANGELOG.md` gets a matching entry. Release steps live in the `/release` skill.

# 🔐 Privacy

- Household financial data never leaves the machine unless a feature explicitly says so (and the user turned it on).
- No absolute local paths (e.g. `C:/Users/...`) in settings, constants or docs examples.
- Never commit a database file (`*.db`), exports or bank statements; `.gitignore` covers `prisma/dev.db*`.

# 🧹 File Management

- **Line Count Enforcement**: If any `.md` file in `docs/` exceeds 150 lines, suggest moving implementation details to `docs/archived/<name>-detail.md` (starting with `Summary lives in [../features/<name>.md]`) and replacing them with a high-level summary that links back.
