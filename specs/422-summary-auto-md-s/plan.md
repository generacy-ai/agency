# Implementation Plan: Inline-thread request-changes contract

**Feature**: Fix the D.2/D.3 request-changes path in `auto.md` (and step 5 in `review.md`) so that request-changes verdicts post per-finding **inline review threads** with a **pre-validate → POST → verify** guardrail, plus an anchor-less-findings fallback, so the server-side PR feedback loop (generacy#861/#869/#878/#883 lineage) actually engages.
**Branch**: `422-summary-auto-md-s`
**Status**: Complete

## Summary

`auto.md` D.3 and `review.md` step 5 both claim to post request-changes as a `COMMENT`-event PR review with per-finding inline comments. On the snappoll PR #14 dogfood run, both request-changes reviews posted as a single body with zero inline threads (`reviewThreads(first:30)` returned empty). Because `PrFeedbackMonitorService` keys on **thread** signals, the fix loop silently disconnected and no agent ever executed the round-2 fix instructions.

This feature adds a guardrail that makes the contract's postcondition load-bearing:

1. **Pre-validate anchors** — every `file:line` from the analyzer is checked against the PR's diff hunks (fetched via `gh pr diff`). Anchors outside diff hunks are treated as anchor-less (Q1=A).
2. **Post inline** — the `gh api ... /reviews` POST body carries one `comments[]` entry per anchored finding; unanchored findings render under a stable `<!-- generacy-cockpit:unanchored-findings -->` marker + H2 in the review body (Q5=C).
3. **Verify two ways** — the POST response's accepted-comments count must match the anchored-finding count, AND a follow-up `pullRequest.reviewThreads(first:N)` GraphQL query must return ≥ that many new unresolved threads (Q2=C).
4. **Bounded retry** — one 2s-backoff retry on postcondition failure; still failing, re-present the verdict gate with the failure context (Q3=A).
5. **Re-review owns resolution** — only the re-review step calls `resolveReviewThread`; the fix-loop agent may reply in-thread but must not self-certify (Q4=B).

The change is contract-shape only: it edits two playbook markdown files in `packages/claude-plugin-cockpit/commands/`. There is no new package, dependency, or runtime code. The postcondition is enforced by the parent loop in-session via `gh api` (POST) and `gh api graphql` (verify).

## Technical Context

| Field | Value |
|-------|-------|
| Language | Markdown (playbook contracts) |
| Runtime | Claude Code session (parent loop) + `gh` CLI |
| APIs | GitHub REST `POST /repos/{o}/{r}/pulls/{n}/reviews`, GitHub GraphQL `pullRequest.reviewThreads` |
| Files touched | `packages/claude-plugin-cockpit/commands/auto.md` (D.2, D.3, G.2), `packages/claude-plugin-cockpit/commands/review.md` (step 5, Terminal Outcome Check) |
| Dependencies | None new. `gh` CLI already required by preflight. |
| Analyzer schema | Existing SB.2 return: `[{file, line, summary, failure_scenario}, ...]` — unchanged |

The parent loop already has `gh` in preflight (`gh auth status` per auto.md step 1). No new tool binding is required; the guardrail is composed of existing shell verbs.

## Project Structure

```
packages/claude-plugin-cockpit/commands/
├── auto.md          # EDIT: D.2 (§ request-changes branch) + D.3 (identical) + G.2 (post-gate)
└── review.md        # EDIT: step 5 (request-changes post) + Terminal Outcome Check

specs/422-summary-auto-md-s/
├── spec.md
├── clarifications.md
├── plan.md          # this file
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── request-changes-post.md       # gh api POST body shape (with comments[])
    └── postcondition-check.md        # reviewThreads GraphQL query + POST-response verify
```

No files outside `packages/claude-plugin-cockpit/commands/` change. The generacy-side gate-race companion issue called out in the spec is explicitly **out of scope** for this branch (it is filed on the `generacy` repo and requires an engine change).

## Constitution Check

No `.specify/memory/constitution.md` exists in this repo (`ls /workspaces/agency/.specify/memory/` returns only `checklists`). Nothing to check against beyond the invariants embedded in `auto.md` itself:

- **§ Invariants #4** (no dispatch invokes a `/cockpit:*` slash command) — respected: guardrail runs as Bash + `gh api` + one gate re-presentation, all already-allowed verbs.
- **§ Invariants #1** (never merge on red) — untouched; this path never calls `cockpit_merge`.
- **Gate contract G.2** — the `abort` and `approve` branches are unchanged; only `request-changes` gains the postcondition guardrail and the retry-then-re-present recovery.
- **Loop-trust-boundary principle** — the postcondition intentionally distrusts the POST response alone and verifies via GraphQL (what `PrFeedbackMonitorService` reads). This matches the "assertions are advisory, evidence is authoritative" pattern used elsewhere (step 4a re-check, D.7 continuation-miss policy).

## Key Decisions (see research.md)

| Decision | Choice | Anchor |
|---|---|---|
| Anchor-outside-diff handling | Pre-validate via `gh pr diff`; treat as anchor-less | Q1=A |
| Postcondition source | Both POST response count AND fresh `reviewThreads` GraphQL | Q2=C |
| Failure recovery | 1 retry (~2s backoff) → re-present verdict gate | Q3=A |
| Thread resolution ownership | Only re-review step resolves | Q4=B |
| Unanchored section header | HTML marker + H2 (`generacy-cockpit:unanchored-findings`) | Q5=C |

## Next Step

`/speckit:tasks` — generate the task list for the two-file edit plus the contract-doc artifacts.
