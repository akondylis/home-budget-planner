# Model selection: which Claude model runs which job

Every Claude job in this repo runs on the model that gives the best balance of **cost**, **efficiency** (speed, tokens) and **result quality**. This page holds the rule, the current choices and how to change them.

## The rule

1. **Result bar first.** Ask what a wrong answer costs. If a mistake ships to users or leaves project state wrong (a diagram that contradicts the code, a bad release tag), the job needs a model that reliably clears the bar.
2. **Then the cheapest model that clears it.** Among the models that clear the bar, take the cheapest and fastest.
3. **Count cost per finished job, not per request.** A cheap model that needs a retry or a manual fix costs more overall.
4. **Effort before model.** If a job is slow or verbose, lower the effort first. Switch model only if that isn't enough.
5. **Aliases in skills, pinned IDs in code.** Skills use `sonnet` / `opus` / `haiku`, so they follow new releases. API code (none yet) names an exact ID, so its output doesn't change without a code change.

## Models (Anthropic list price, checked 2026-10-06, $ per million tokens)

| Model | ID / alias | Input | Output | Best at |
|---|---|---|---|---|
| Fable 5.1 | `claude-fable-5-1` | 10.00 | 50.00 | Hardest reasoning, long autonomous runs; slow |
| Opus 5.5 | `claude-opus-5-5` / `opus` | 4.00 | 20.00 | Strong coding, cross-file accuracy |
| Sonnet 5.5 | `claude-sonnet-5-5` / `sonnet` | 2.00 | 10.00 | Everyday coding and writing; fast |
| Haiku 5.5 | `claude-haiku-5-5` / `haiku` | 0.10 | 0.50 | Mechanical, high-volume work; very fast |

On a Claude subscription, Claude Code doesn't bill per token. A cheaper model uses less of the plan's usage limit and replies faster.

## Current choices

| Job | Error cost | Model | Why |
|---|---|---|---|
| `/git-commit` | Low (every commit is approved) | `sonnet` | Must read diffs and group them sensibly. Haiku misgroups more often |
| `/release` | Medium (public changelog, tag) | `sonnet` | Writing plus fixed steps, approved before push. Runs only when the user types `/release` |
| `/redraw-diagram` | High | `opus` | Checks every IPC channel and `window.api` method against the code. Pinned so it stays on Opus even when the session runs on Sonnet; runs in a fork to keep its output out of the session |
| Feature work, planning, reviews | High | Session model (`/model`) | Developer's choice. Not pinned |

## How to change a model

- **Skill:** set `model:` in the frontmatter of `.claude/skills/<name>/SKILL.md`. Remove the field to inherit the session model.
- **Subagent:** set `model:` in the frontmatter of `.claude/agents/<name>.md`. There are none yet.
- **Session:** `/model` in Claude Code.

When you add a new job, score it with the rule and add a row to the table above.

## When to review

- A new model family is released. Recheck prices (and any pinned API ID); aliases update on their own.
- A job keeps needing retries or manual fixes. Move it up one tier.
- A job is clearly over-served (simple output, slow replies). Lower its effort, then try one tier down.

Kept in sync by hand with the Matchday project (`../chess-board/docs/model-selection.md`).
