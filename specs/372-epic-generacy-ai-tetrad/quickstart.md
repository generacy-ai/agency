# Quickstart: claude-plugin-cockpit (post-rewrite)

**Feature**: 372-epic-generacy-ai-tetrad
**Audience**: A cockpit operator who has installed the plugin in a fresh Claude Code session and wants to drive an epic through its phases.

This quickstart validates FR-004 / SC-003: every command runs in a fresh Claude Code session with only the plugin + `gh auth` + `generacy` CLI installed.

---

## Prerequisites

1. **`gh` CLI installed and authenticated**:
   ```bash
   gh --version
   gh auth status                      # should print "Logged in to github.com"
   ```
   If not authenticated:
   ```bash
   gh auth login
   ```

2. **`generacy` CLI installed and on `$PATH`**:
   ```bash
   generacy --version                  # any non-error output
   ```
   If not installed:
   ```bash
   npm install -g @generacy-ai/cli     # or the prevailing install command
   ```

3. **Claude Code with the `generacy-ai/agency` marketplace listed** in `extraKnownMarketplaces` and the `cockpit` plugin installed. See the plugin README for the marketplace snippet.

---

## Install the plugin

Add the marketplace to your Claude Code settings:

```json
{
  "extraKnownMarketplaces": ["generacy-ai/agency"]
}
```

Then install the `cockpit` plugin through Claude Code's UI or configuration. The six commands become available under the `/cockpit:` prefix.

---

## The six commands

| Command | What it does | Typical entry point |
|---------|---|---|
| `/cockpit:watch <epic-ref>` | Streams `generacy cockpit watch` transitions; per line suggests the next `/cockpit:*` verb via a static mapping table. | Start-of-shift: `/cockpit:watch generacy-ai/tetrad-development#85`. |
| `/cockpit:status [<epic-ref>]` | Renders `generacy cockpit status`. With no arg, prints the usage line. | Ad hoc check-in. |
| `/cockpit:queue <phase>` | Confirm/Cancel gate → `generacy cockpit queue <phase>`. | The mutating "go" trigger. |
| `/cockpit:clarify <ref>` | Assist loop: `generacy cockpit context` → draft answers → per-question approval → post marked comment → `generacy cockpit advance`. | When `watch` suggests it. |
| `/cockpit:review --gate <g>` | For `impl`, runs `/code-review`; for other gates, summarizes the artifact; on approval calls `generacy cockpit advance --gate <g>` directly. | When `watch` suggests it. |
| `/cockpit:merge [<pr-ref>] [--max-fix-attempts <N>]` | Never merges on red; bounded fixer subagent for repo-owned CI failures (tests / lint / typecheck / build). | End of the loop. |

---

## Golden path (walkthrough)

1. **Start the watcher.**
   ```
   /cockpit:watch generacy-ai/tetrad-development#85
   ```
   Output streams one line per state transition. Each line ends with `· suggested: /cockpit:<verb> <ref>` when the static table matches.

2. **Answer clarifications when suggested.** When the watcher prints a `waiting-for:clarification` line, run:
   ```
   /cockpit:clarify generacy-ai/agency#372
   ```
   Claude walks you through each question, drafts an answer using repo context from `generacy cockpit context`, asks for per-question approval, posts a marked comment on approval, and advances the phase when done.

3. **Review gates as they open.** When the watcher prints `waiting-for:impl-review`, run:
   ```
   /cockpit:review --gate impl
   ```
   For the `impl` gate this delegates to Claude Code's built-in `/code-review`. On approval, `generacy cockpit advance --gate impl` fires directly.
   For other gates (e.g., `plan`, `spec`, `tasks`), a terse artifact summary appears; approve to advance.

4. **Queue the next phase** (only when the playbook says to). Explicit confirmation gate:
   ```
   /cockpit:queue impl
   ```
   The Confirm/Cancel prompt is intentional — this is the playbook's mutating "go" trigger.

5. **Merge when green.** When the watcher prints `completed:validate` or all checks pass:
   ```
   /cockpit:merge
   ```
   If CI is red on repo-owned classes (tests / lint / typecheck / build) and `--max-fix-attempts` > 0, a bounded fixer subagent takes one shot at the fix, pushes, and re-checks. Infrastructure failures abort without burning an attempt. Merge never fires on red.

---

## Ad-hoc use

- **Just get status**: `/cockpit:status generacy-ai/tetrad-development#85`
- **Re-run watcher after exit**: watcher exit prints a re-run hint; run the same command again.

---

## Error handling (shared convention)

Every command classifies failures identically. See the plugin README's `## Error Handling` section for the canonical copy. The three classes are:

- **MISSING_BINARY** — `generacy` not on `$PATH`. Fix: `npm install -g @generacy-ai/cli`.
- **AUTH_FAILURE** — CLI complained about auth (`gh auth`, `unauthorized`, `401`). Fix: `gh auth login`.
- **OTHER** — anything else. The command prints `CLI failed with exit code <N>.` followed by stderr inside a fenced block.

If you see a class that is not one of the three, the command file is out of spec — file it against this issue's follow-up.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/cockpit:<verb>` not listed in Claude Code. | Plugin not installed, or marketplace not in `extraKnownMarketplaces`. | Re-check the Install step. |
| `The generacy CLI is required but is not on $PATH.` | `generacy` CLI missing. | `npm install -g @generacy-ai/cli`. |
| `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.` | `gh` not authenticated. | `gh auth login`. |
| `/cockpit:status` prints usage line with no argument. | Expected — `.generacy/epics/` resolution chain was deliberately removed. | Pass `<epic-ref>` explicitly. |
| `/cockpit:watch` exits after a transient blip. | Not expected — retry/backoff is owned by `generacy cockpit watch`. If it exits, re-run `/cockpit:watch <epic-ref>`. | Re-run the command. |
| `/cockpit:merge` aborts on green infrastructure but red repo-owned checks and won't fixer-loop. | `--max-fix-attempts` was 0 (from prior loop) or an infra failure was mixed in. | Re-run with `--max-fix-attempts 1`; fix any infra failures manually first. |
| `/cockpit:review --gate impl` doesn't invoke `/code-review`. | Claude Code's built-in `/code-review` missing (very unusual — it ships with the host). | Update Claude Code. |
| `/cockpit:*` command references a non-existent verb (e.g. `/cockpit:advance`, `/cockpit:plan`, `/cockpit:bug`). | Command file is out of spec — this rewrite deleted those verbs. | File against this issue. |

---

## What this plugin does NOT do (out of scope)

- Modify the `generacy` CLI to emit `next: /cockpit:<verb>` inline on transitions (deferred; would live in the `generacy` repo).
- Re-introduce `/cockpit:advance`, `/cockpit:plan`, `/cockpit:breakdown`, `/cockpit:file`, `/cockpit:bug`.
- Cross-slash-command invocation beyond the single `/code-review` exception in `review.md --gate impl`.
- Detect operator presence (no AFK detection, no `PushNotification` in `watch.md`).

See [spec.md § Out of Scope](spec.md).
