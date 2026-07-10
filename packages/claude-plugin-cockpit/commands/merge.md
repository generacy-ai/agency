---
description: Merge a PR via generacy cockpit merge; on red checks, spawn a bounded fixer subagent and re-evaluate. Never merges on red.
arguments:
  - name: issue
    description: "Issue reference (owner/repo#N, #N, or bare integer). Optional; falls back to the current branch's open PR's linked issue. Passing a PR reference directly is a distinct failure mode — the CLI resolves the linked PR from the issue internally."
    required: false
  - name: --max-fix-attempts
    description: "Max fixer passes on red (default 1)"
    required: false
---

# Merge Command

Merge a PR via `generacy cockpit merge`. Poll CI, and on red checks (tests / lint / typecheck / build only) spawn a bounded fixer subagent, then re-evaluate. Infrastructure or runner failures abort without burning an attempt. **Never merges on red** — this is an invariant that no flag, subagent path, or CLI response can override.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Parse arguments** — Extract:
   - `<issue>` (positional, optional) — an issue reference (owner/repo#N, #N, or bare integer). If omitted, resolve the current branch's open PR via `gh pr view --json url,number,headRefName -q .` and pass its linked issue to the CLI. Passing a PR reference directly is prohibited — the CLI resolves the linked PR from the issue internally (see agency#398).
   - `--max-fix-attempts=N` (integer, default `1`; must be `>= 0`). Setting `0` short-circuits the fixer entirely; setting `>= 1` allows up to N fixer passes.

   On usage error, print `Usage: /cockpit:merge [<issue>] [--max-fix-attempts=N]` and exit non-zero.

2. **Pre-flight** — `command -v generacy >/dev/null 2>&1`. If the pre-flight returns non-zero, apply the **Error handling** block below with class `MISSING_BINARY` and stop.

3. **PR summary** — Print a single line summarizing the resolved PR: `Resolved <issue> → <repo>#<pr-number> (PR #<pr-number>)`.

4. **Invoke CLI** — Run `generacy cockpit merge <issue>` via the Bash tool. Parse stdout as JSON with fields `{ result, reason, pr, checks, details }` where `result` ∈ `{ merged, red, blocked }`. On JSON parse failure, apply the **Error handling** block below.

5. **Decision tree** — Route strictly on `result` + `reason`:

   | `result` | `reason` | Action |
   |----------|----------|--------|
   | `merged` | — | Print `Merged ✓ — <pr.url>` and exit `0`. |
   | `red` | `checks-failing` | Go to the fixer branch (step 6). |
   | `red` | `merge-conflict` | Go to the fixer branch (step 6). |
   | `blocked` | `missing-label` | Print `Stopped: missing-label — add the epic-cockpit label to PR #<n>` and exit non-zero. |
   | `blocked` | `missing-approval` | Print `Stopped: missing-approval — PR #<n> not approved yet` and exit non-zero. |
   | `blocked` | `draft` | Print `Stopped: draft — mark PR #<n> ready for review first` and exit non-zero. |
   | `blocked` | `pending` | Print `Stopped: pending — defer to /cockpit:watch` and exit non-zero. Do NOT poll. |
   | unknown `result` or `reason` | — | Print `Stopped: unknown CLI result — <result>/<reason>` and exit non-zero. |

6. **Fixer branch** — Reached only when `result == "red"` and `reason ∈ { "checks-failing", "merge-conflict" }`.
   1. **Classify failing checks.** Any check whose name matches `/runner|infrastructure|infra|setup|network|actions/i` (case-insensitive) is an infrastructure/runner failure. If ANY failing check is infrastructure/runner class, print `Stopped: infrastructure failure — <check names>; re-run when the infra is healthy` and exit non-zero. Do NOT burn an attempt. Do NOT spawn the fixer.
   2. **Attempt counter.** Initialize `attempt = 1` on first entry; on re-entry from step 8, increment. If `attempt > max-fix-attempts`, print `Stopped: red after <max-fix-attempts> fix attempt(s) — <reason> (<check names>)` and exit non-zero. Do NOT spawn the fixer.
   3. **Repo-owned CI classes only.** The fixer attempts tests, lint, typecheck, or build failures — anything the local dev loop can reproduce. If none of the failing checks are in that set, print `Stopped: red — <check names> not in fixer scope (tests/lint/typecheck/build)` and exit non-zero.

7. **Spawn fixer subagent** — Print `Spawning fixer (attempt <n>/<max-fix-attempts>)`, then spawn a subagent via the Task tool with `subagent_type: "general-purpose"` and a prompt that:
   - Consumes `{ pr, reason, checks, attempt, max_attempts }`.
   - Checks out `pr.head_ref`.
   - For `reason: "checks-failing"` — reads the failing-check summaries, fixes the underlying code (tests / lint / typecheck / build), runs the relevant local checks, and pushes to `pr.head_ref`.
   - For `reason: "merge-conflict"` — resolves conflicts against the PR's base branch preserving intent, and pushes.
   - Treats `attempt == max_attempts` as the final chance and prioritizes highest-confidence fixes.
   - MUST NOT call `generacy cockpit merge` itself — this command owns the loop.

8. **Re-evaluate** — When the fixer returns, print `Fixer returned; re-evaluating…` and loop back to step 4. Never cache the previous CLI result; observe state fresh on every call.

9. On any non-zero CLI exit, apply the **Error handling** block below.

<!-- BEGIN error-conv -->
**Error handling** — When the CLI exit code is non-zero (or the pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The generacy CLI is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: \`export PATH="/shared-packages/node_modules/.bin:$PATH"\` (persist it in ~/.bashrc). Standalone: install it with \`npm install -g @generacy-ai/generacy\`.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.`
- **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
<!-- END error-conv -->

## Invariants

1. **Never merge on red.** Exit `0` only when `result == "merged"`.
2. **Bounded loop.** At most `--max-fix-attempts` fixer passes per invocation.
3. **Reason-based routing.** Only `reason ∈ { "checks-failing", "merge-conflict" }` may spawn the fixer.
4. **Repo-owned CI only.** Infrastructure / runner failures abort without burning an attempt.
5. **No direct merge.** MUST NOT call `gh pr merge` or any other merge primitive — only the CLI verb merges.
6. **No polling on `pending`.** Defer to `/cockpit:watch`.

## Examples

`/cockpit:merge` — resolves the current branch's open PR, extracts its linked issue, and attempts merge; on red-checks with one attempt remaining, spawns a fixer, re-checks, and merges if green.

`/cockpit:merge generacy-ai/agency#789 --max-fix-attempts=2` — merges the PR linked to issue #789 with up to two fixer passes. (The bare `#789` is an issue reference, per the CLI's contract; the CLI resolves its linked PR internally.)
