---
name: git-commit
description: Grouped Conventional Commit and push workflow. Use when the user says /git-commit, "commit my changes", "commit and push", or "save changes" to git.
---

# Git Commit Workflow

1. **Analyze:** Run `git diff --cached` to see staged changes.
2. **Consult Rules:** Always read `commitlint.config.mjs` in the root directory to identify allowed types (e.g., feat, fix, chore) and header lengths.
3. **Group & Categorize:**
    - Group related file changes (e.g., UI changes together, backend logic together).
    - If changes are unrelated, suggest multiple atomic commits.
4. **Draft:** Create a Conventional Commit message.
5. **Confirmation Flow:**
    - Present the drafted message to the user.
    - Ask: "Would you like to commit and push these changes? (y/n)"
    - Only execute `git commit -m "..."` and `git push` upon explicit "y".
