# Clarifications

## Batch 1 — 2026-06-26

### Q1: Gate-to-artifact mapping
**Context**: FR-004 says non-`impl` gates read "the canonical artifact" for the feature, but the mapping is implicit. Two cases are ambiguous and would block implementation:
- `--gate clarify`: should the command summarize `clarifications.md` (the questions/answers themselves) or re-summarize `spec.md` after clarifications have been merged into it?
- `--gate tasks`: should it summarize only `specs/<feature>/tasks.md`, or also the GitHub child issues that `/speckit:tasks-issues` created from it?

**Question**: For each non-`impl` gate, which exact file(s) under `specs/<feature>/` (and/or GitHub artifacts) constitute the "canonical artifact" the command must read and summarize?
**Options**:
- A: `specify` → `spec.md`; `clarify` → `clarifications.md`; `plan` → `plan.md`; `tasks` → `tasks.md` only (no GitHub child-issue lookup)
- B: Same as A, but `tasks` also fetches and summarizes the GitHub child issues created from `tasks.md`
- C: Same as A, but `clarify` summarizes `spec.md` (post-merge) rather than `clarifications.md`
- D: Other (please specify the exact mapping)

**Answer**: **A.** Gate → artifact mapping: `specify → spec.md`, `clarify → clarifications.md`, `plan → plan.md`, `tasks → tasks.md` (no GitHub child-issue fetch in v1).

### Q2: Approval signal mechanism
**Context**: FR-005/FR-006 say the command "prompts the developer for approve / changes-requested / abort" and on approval calls `/cockpit:advance`. But Claude Code slash commands are stateless markdown templates that emit instructions for the agent — they don't have a built-in interactive prompt primitive. The implementation needs a concrete approval-capture mechanism.

**Question**: How should the developer signal approve / request-changes / abort, and how does that signal trigger `/cockpit:advance`?
**Options**:
- A: The command always emits the summary and STOPS; the developer re-invokes with an explicit flag (`/cockpit:review --gate impl --approve` or `--reject`) to advance
- B: The command emits the summary then instructs the agent to use `AskUserQuestion` (or equivalent) and, on approve, immediately invokes `/cockpit:advance` in the same run
- C: The developer signals approval out-of-band by adding a label on the GitHub issue (e.g. `approved:impl`); the command only emits the summary
- D: Other (please specify)

**Answer**: **B (with a mode flag).** The command emits the summary, then uses `AskUserQuestion` (or equivalent) to capture approve / request-changes / abort; on approve it invokes `/cockpit:advance` in the same run. This is the default **assist** mode. A `--mode auto` skips the prompt and advances if no blockers; `--mode manual` emits only the summary and never advances.

### Q3: Open-PR resolution for the `impl` gate
**Context**: US1 / FR-003 require the command to "locate the open PR for the child issue". Multiple lookup strategies are viable, and the failure modes differ (draft PRs, multiple PRs, no linked PR but matching branch name).

**Question**: How should the command resolve the open PR for the current child issue, and how should it handle the edge cases?
**Options**:
- A: Delegate entirely to `/cockpit:review-context` (G1.3) — assume it returns exactly one open PR or fails; this command does no PR resolution itself
- B: Use `gh pr list --search "linked:<issue#> is:open"` and fail-fast if zero or >1 matches; ignore branch-name heuristics
- C: Look up by branch-name pattern `<issue#>-*` and pick the single open PR on that branch; treat draft PRs the same as ready PRs
- D: Other (please specify; include behavior for draft and multi-PR cases)

**Answer**: **A.** Delegate open-PR resolution entirely to `/cockpit:review-context` (G1.3 / #789), which resolves the PR via the shared engine helper. `/cockpit:review` does not reimplement PR lookup; it surfaces whatever error `review-context` returns when resolution fails (zero, multiple, draft cases are owned by G1.3).

### Q4: Gate label convention
**Context**: The spec (Assumptions) says "Gate labels follow the `gate:<name>` convention used elsewhere in the cockpit epic," but the labels actually present on issue #354 use `phase:<name>` (e.g. `phase:clarify`) and `completed:<name>` (e.g. `completed:specify`). The cockpit:review command needs to report "the resulting label transition" (FR-006), so it must know which label namespace `/cockpit:advance` actually mutates.

**Question**: When `/cockpit:advance --gate <name>` runs, which label namespace does it modify, and which label should `/cockpit:review` report on?
**Options**:
- A: `gate:<name>` (a new namespace this epic introduces) — existing `phase:` / `completed:` labels are untouched
- B: Existing `phase:<name>` → next phase (e.g. `phase:clarify` → `phase:plan`) plus adding `completed:<previous>`
- C: Add `completed:<gate>` and remove `phase:<gate>`; the `gate:` prefix in the spec text is a typo/shorthand for `phase:`/`completed:`
- D: Other (please specify the exact label transition)

**Answer**: **D (correction).** The spec's `gate:<name>` assumption is wrong — there is no `gate:` namespace. `/cockpit:advance --gate <name>` (per G1.2 / #788) **adds `completed:<name>`** and **removes `waiting-for:<name>`**; it does NOT touch the orchestrator-owned `phase:*` labels. `/cockpit:review` reports the `waiting-for:<name>` → `completed:<name>` transition.

### Q5: Structured-summary output schema
**Context**: FR-005 says the command must produce a "structured summary (severity-grouped findings, blockers, suggested decision)" with format "identical across gates to keep the UX consistent". The severity vocabulary and the level of structure (free-form markdown vs. machine-parseable fields) aren't specified, which affects both the command's prompt and any future tooling that consumes the output.

**Question**: What severity levels and output schema should the summary use across all gates?
**Options**:
- A: Free-form markdown with H2/H3 headings; severities = `Blocker`, `Major`, `Minor`, `Info`; suggested decision = one of `approve`/`request-changes`/`abort` in a final line
- B: Same severities as A, but rendered as a markdown table (`| Severity | Finding | Location |`) followed by a "Suggested decision:" line
- C: Reuse whatever schema `/code-review` already emits for `impl`; for non-`impl` gates emit only `Blockers` / `Open questions` / `Suggested decision` (no severity grouping since there are no code findings)
- D: Other (please specify the schema and severity vocabulary)

**Answer**: **C.** For `impl`, reuse `/code-review`'s existing output schema verbatim. For non-`impl` gates, emit three sections: `Blockers`, `Open questions`, `Suggested decision` (no code-severity vocabulary, since there are no code findings). Every gate's summary ends with a consistent final line: `Suggested decision: approve | request-changes | abort`.
