# Clarifications for Feature 372: claude-plugin-cockpit six-command rewrite

## Batch 1 — 2026-07-06

### Q1: Behavior of clarify/status/queue in the rewrite
**Context**: The spec describes `watch`, `review`, and `merge` in detail but is silent on the behavior of the other three commands (`clarify.md`, `status.md`, `queue.md`) that are part of the six-command set. The existing command files (pre-rewrite) contain non-trivial logic — `queue.md` has an `AskUserQuestion` Confirm/Cancel gate, `status.md` has a multi-step no-arg epic resolution chain, and `clarify.md` shells out to `generacy cockpit clarify-context` and parses structured question blocks. The scope of what "self-contained thin wrapper" means for these three commands determines how much of their current logic survives.
**Question**: What behavior should `clarify.md`, `status.md`, and `queue.md` have after the rewrite?
**Options**:
- A: Strip all three down to minimal thin wrappers: pass `$ARGUMENTS` through to `generacy cockpit <verb>`, render stdout under a header, apply the shared error convention. Drop confirmation gates, no-arg epic resolution chains, and any structured parsing.
- B: Preserve the current terse-output discipline of `status.md` and `queue.md` (including the `queue.md` Confirm/Cancel gate) but strip references to `specs/**` contracts. Simplify `clarify.md` to remove the `specs/353/**` contract references but keep its clarify-context → post-approval → advance flow.
- C: Something else — describe.

**Answer**: B, amended. `queue` keeps its `AskUserQuestion` Confirm/Cancel gate (it's the playbook's mutating "go" trigger — confirm-gated per the rev 3 catalog). `clarify` keeps its full flow — context → draft grounded answers → per-question approval → post marked comment → `generacy cockpit advance` — that flow IS the assist loop, not incidental logic; update it to call `generacy cockpit context` (`clarify-context` no longer exists). `status` stays a thin render, but DROP the no-arg resolution chain: its `.generacy/epics/` leg reads a directory that no longer exists — with no argument, print the usage line. All three lose every `specs/**` contract reference.

### Q2: How does watch derive the "suggested next /cockpit:* command"?
**Context**: FR-006 says "for each transition line, print one notification with the suggested next `/cockpit:*` command." FR-007 explicitly forbids policy lookup. That leaves two ways to produce the suggestion: either `generacy cockpit watch` already emits a `next: /cockpit:<verb>` field in its transition lines, or `watch.md` embeds a static kind/from→to → verb table. The choice determines whether `watch.md` truly fits in ~20 lines (SC-004) or needs an inline mapping table.
**Question**: Where does the "suggested next command" come from?
**Options**:
- A: `generacy cockpit watch` emits the suggestion inline (e.g., a `next: /cockpit:review` field on each transition line); `watch.md` prints it verbatim. No mapping in the command body.
- B: `watch.md` embeds a small static mapping table (e.g., `impl:opened→queued → /cockpit:queue`, `clarify:waiting→answered → /cockpit:clarify`) and looks up the verb per transition.
- C: Neither — describe the intended flow.

**Answer**: B — a small static mapping table in `watch.md` (`waiting-for:clarification` → `/cockpit:clarify` · `waiting-for:<gate>-review` → `/cockpit:review --gate <gate>` · `completed:validate` / green checks → `/cockpit:merge` · error states → no suggestion). Option A is the better long-term home (engine decides, plugin narrates) but requires a `generacy` CLI change that is out of scope for this agency-only issue — per the one-repo-per-issue rule. The table is ~5 rows; SC-004's ~20 lines holds.

### Q3: Is /code-review the only permitted cross-slash-command invocation?
**Context**: FR-005 says "No command invokes another `/cockpit:*` slash command; commands compose only via the `generacy` CLI." US3 says `review.md` invokes `/code-review` for the `impl` gate. `/code-review` is not a `/cockpit:*` command, so it technically satisfies FR-005 — but it IS a slash command. Confirming this is deliberate (rather than an oversight) matters because it establishes whether other commands may reference *any* non-cockpit slash command.
**Question**: Is invoking `/code-review` from `review.md --gate impl` the only permitted cross-slash-command invocation across the six commands?
**Options**:
- A: Yes — `/code-review` in `review.md` is the single documented exception. All other cross-slash-command invocation is forbidden.
- B: No — commands may freely invoke any non-`/cockpit:*` slash command as needed (e.g., `/security-review`, `/verify`); only `/cockpit:*` invocation is forbidden.
- C: Neither — `review.md` should inline the review prompt rather than delegate to `/code-review`.

**Answer**: A — `/code-review` is the single documented exception, permitted because it ships with Claude Code itself (always present in any session), unlike marketplace plugins. Everything else composes via the `generacy` CLI. Not C: inlining a review prompt re-creates the English-state-machine problem the rewrite exists to delete.

### Q4: Scope of the merge fixer subagent
**Context**: FR-011 says "supports `--max-fix-attempts` with default 1 and never merges on red CI. Bounded fixer subagent." The spec doesn't say which classes of red-CI failure the fixer attempts to repair. In the current codebase the possible failure classes include unit test failures, lint errors, typecheck errors, build failures, and workflow-level infrastructure failures. This determines how much prompt-engineering `merge.md` needs and what "attempt" is counted against `--max-fix-attempts`.
**Question**: Which CI failure classes does the fixer subagent attempt to repair?
**Options**:
- A: Test failures only. Lint/typecheck/build failures are reported and merge aborts without invoking the fixer.
- B: Any red check owned by this repo's CI (tests + lint + typecheck + build). Infrastructure/workflow failures (e.g., runner errors) are reported and merge aborts without invoking the fixer.
- C: Any red check, regardless of class — the fixer subagent inspects the failure log and decides itself whether to attempt.

**Answer**: B — the fixer attempts any red check owned by the repo's CI (tests, lint, typecheck, build); infrastructure/runner failures are reported and merge aborts without burning an attempt. One "attempt" = one fixer invocation that pushes and triggers a re-check. Not C: spending the single default attempt on a runner flake is waste; the human sees the abort message either way.

### Q5: Location of the shared error convention
**Context**: FR-012 requires "one short error convention (missing binary, `gh` auth, other)." US5 AC says "documented once (README or shared snippet) and referenced consistently." The existing `queue.md` and `status.md` inline three-class classifiers (MISSING_BINARY / AUTH_FAILURE / OTHER) verbatim. The rewrite could either continue that inline pattern with a canonical README section that the command files copy from, or extract a single shared markdown snippet each command includes/links to. The choice affects package layout and how future edits stay in sync.
**Question**: Where does the shared error convention physically live?
**Options**:
- A: A dedicated section in the `@generacy-ai/cockpit` README that each command's error-handling step references by heading (e.g., "See README § Error Handling"). Command bodies do not duplicate the text.
- B: A single markdown snippet file (e.g., `packages/claude-plugin-cockpit/commands/_errors.md`) that each command references. Not rendered as a slash command itself.
- C: Inlined verbatim into each command file, with a comment noting the canonical README section as source of truth (matching the current pattern in `queue.md` / `status.md`).

**Answer**: C — inline the convention verbatim in each command (it is ~6 lines: missing binary / `gh` auth / other, with the install+auth one-liners), with a comment naming the plugin README section as canonical. Slash commands must be self-contained at execution time: option A's canonical README lives in the `generacy` repo/npm package and is not readable from a user's session, and option B's `commands/_errors.md` risks being auto-discovered as `/cockpit:_errors` and adds an indirection hop to save six lines. Keep the canonical copy in the PLUGIN's README (this repo).
