# Clarifications for Feature 372: claude-plugin-cockpit six-command rewrite

## Batch 1 — 2026-07-06

### Q1: Behavior of clarify/status/queue in the rewrite
**Context**: The spec describes `watch`, `review`, and `merge` in detail but is silent on the behavior of the other three commands (`clarify.md`, `status.md`, `queue.md`) that are part of the six-command set. The existing command files (pre-rewrite) contain non-trivial logic — `queue.md` has an `AskUserQuestion` Confirm/Cancel gate, `status.md` has a multi-step no-arg epic resolution chain, and `clarify.md` shells out to `generacy cockpit clarify-context` and parses structured question blocks. The scope of what "self-contained thin wrapper" means for these three commands determines how much of their current logic survives.
**Question**: What behavior should `clarify.md`, `status.md`, and `queue.md` have after the rewrite?
**Options**:
- A: Strip all three down to minimal thin wrappers: pass `$ARGUMENTS` through to `generacy cockpit <verb>`, render stdout under a header, apply the shared error convention. Drop confirmation gates, no-arg epic resolution chains, and any structured parsing.
- B: Preserve the current terse-output discipline of `status.md` and `queue.md` (including the `queue.md` Confirm/Cancel gate) but strip references to `specs/**` contracts. Simplify `clarify.md` to remove the `specs/353/**` contract references but keep its clarify-context → post-approval → advance flow.
- C: Something else — describe.

**Answer**: *Pending*

### Q2: How does watch derive the "suggested next /cockpit:* command"?
**Context**: FR-006 says "for each transition line, print one notification with the suggested next `/cockpit:*` command." FR-007 explicitly forbids policy lookup. That leaves two ways to produce the suggestion: either `generacy cockpit watch` already emits a `next: /cockpit:<verb>` field in its transition lines, or `watch.md` embeds a static kind/from→to → verb table. The choice determines whether `watch.md` truly fits in ~20 lines (SC-004) or needs an inline mapping table.
**Question**: Where does the "suggested next command" come from?
**Options**:
- A: `generacy cockpit watch` emits the suggestion inline (e.g., a `next: /cockpit:review` field on each transition line); `watch.md` prints it verbatim. No mapping in the command body.
- B: `watch.md` embeds a small static mapping table (e.g., `impl:opened→queued → /cockpit:queue`, `clarify:waiting→answered → /cockpit:clarify`) and looks up the verb per transition.
- C: Neither — describe the intended flow.

**Answer**: *Pending*

### Q3: Is /code-review the only permitted cross-slash-command invocation?
**Context**: FR-005 says "No command invokes another `/cockpit:*` slash command; commands compose only via the `generacy` CLI." US3 says `review.md` invokes `/code-review` for the `impl` gate. `/code-review` is not a `/cockpit:*` command, so it technically satisfies FR-005 — but it IS a slash command. Confirming this is deliberate (rather than an oversight) matters because it establishes whether other commands may reference *any* non-cockpit slash command.
**Question**: Is invoking `/code-review` from `review.md --gate impl` the only permitted cross-slash-command invocation across the six commands?
**Options**:
- A: Yes — `/code-review` in `review.md` is the single documented exception. All other cross-slash-command invocation is forbidden.
- B: No — commands may freely invoke any non-`/cockpit:*` slash command as needed (e.g., `/security-review`, `/verify`); only `/cockpit:*` invocation is forbidden.
- C: Neither — `review.md` should inline the review prompt rather than delegate to `/code-review`.

**Answer**: *Pending*

### Q4: Scope of the merge fixer subagent
**Context**: FR-011 says "supports `--max-fix-attempts` with default 1 and never merges on red CI. Bounded fixer subagent." The spec doesn't say which classes of red-CI failure the fixer attempts to repair. In the current codebase the possible failure classes include unit test failures, lint errors, typecheck errors, build failures, and workflow-level infrastructure failures. This determines how much prompt-engineering `merge.md` needs and what "attempt" is counted against `--max-fix-attempts`.
**Question**: Which CI failure classes does the fixer subagent attempt to repair?
**Options**:
- A: Test failures only. Lint/typecheck/build failures are reported and merge aborts without invoking the fixer.
- B: Any red check owned by this repo's CI (tests + lint + typecheck + build). Infrastructure/workflow failures (e.g., runner errors) are reported and merge aborts without invoking the fixer.
- C: Any red check, regardless of class — the fixer subagent inspects the failure log and decides itself whether to attempt.

**Answer**: *Pending*

### Q5: Location of the shared error convention
**Context**: FR-012 requires "one short error convention (missing binary, `gh` auth, other)." US5 AC says "documented once (README or shared snippet) and referenced consistently." The existing `queue.md` and `status.md` inline three-class classifiers (MISSING_BINARY / AUTH_FAILURE / OTHER) verbatim. The rewrite could either continue that inline pattern with a canonical README section that the command files copy from, or extract a single shared markdown snippet each command includes/links to. The choice affects package layout and how future edits stay in sync.
**Question**: Where does the shared error convention physically live?
**Options**:
- A: A dedicated section in the `@generacy-ai/cockpit` README that each command's error-handling step references by heading (e.g., "See README § Error Handling"). Command bodies do not duplicate the text.
- B: A single markdown snippet file (e.g., `packages/claude-plugin-cockpit/commands/_errors.md`) that each command references. Not rendered as a slash command itself.
- C: Inlined verbatim into each command file, with a comment noting the canonical README section as source of truth (matching the current pattern in `queue.md` / `status.md`).

**Answer**: *Pending*
