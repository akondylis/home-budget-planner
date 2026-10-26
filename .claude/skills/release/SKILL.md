---
name: release
description: Cut a versioned release - collect commits since the last tag, write human-readable CHANGELOG notes, bump package.json, then commit, tag and push. Use when the user says /release or "create a release".
---

# Release Workflow

1. **Get last tag:** Run `git describe --tags --abbrev=0 2>/dev/null`. If it fails (no tags), use the first commit hash from `git rev-list --max-parents=0 HEAD`.

2. **Collect commits since last tag:**
   ```bash
   git log <last-tag>..HEAD --pretty=format:"%s" --no-merges
   ```
   Extract only the conventional commit type and scope/subject (e.g., from `feat(transactions): add member filter` extract `feat`, `transactions`, `add member filter`).

3. **Filter and group by type:**
   - **Include in release notes:**
     - `feat` → group as "### New Features"
     - `fix` → group as "### Bug Fixes"
     - `perf` → group as "### Performance Improvements"
     - `revert` → group as "### Reverted"
   - **Skip (internal changes):** `chore`, `ci`, `build`, `test`, `docs`, `style`, `refactor`
   - **De-duplicate:** If multiple commits describe the same change semantically, merge them into a single bullet point.

4. **Rewrite for humans:** Transform each commit message into a user-friendly bullet point:
   - Remove implementation details
   - Use past tense
   - Focus on *what changed*, not *how it was changed*
   - Example: `feat(budget): copy last month plan` → `A month's budget can now start as a copy of the previous month`

5. **Ask for version number:**
   - If any `feat` commits exist → suggest minor bump (e.g., 1.0.0 → 1.1.0)
   - Otherwise → suggest patch bump (e.g., 1.0.0 → 1.0.1)
   - Ask: "What version number? (suggest: X.Y.Z)"
   - Accept any valid semver

6. **Present draft CHANGELOG block:**
   ```
   ## [X.Y.Z] — YYYY-MM-DD
   ### New Features
   - Bullet 1
   - Bullet 2

   ### Bug Fixes
   - Bullet 3

   Approve these release notes? (y/edit/n)
   ```
   - If user says "edit": show the raw CHANGELOG block text; let them paste back the edited version
   - If user says "n": abort
   - If user says "y": proceed to step 7

7. **Update files:**
   - **CHANGELOG.md:** Prepend the new `## [X.Y.Z] — YYYY-MM-DD` block right after the `## [Unreleased]` line. Keep the `## [Unreleased]` header but remove its content (leave blank until next release).
   - **package.json:** Update the `"version"` field to `"X.Y.Z"`

8. **Commit, tag, and push:**
   ```bash
   git add CHANGELOG.md package.json
   git commit -m "chore(release): v{version}"
   git tag v{version}
   git push
   git push --tags
   ```

9. **Confirmation:** Tell the user:
   ```
   ✅ Release v{version} created and pushed.
   ```
