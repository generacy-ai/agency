# Implementation Plan: Fix Release Workflow Peer-Dep Consistency Check

**Feature**: Fix the `Release` workflow's post-publish `Validate latest peer-dep consistency` step so it stops reddening jobs on unrelated `@latest` drift, advance `@latest` alongside `@stable` on stable publishes, and emit a non-failing advisory when residual `@latest` drift remains.
**Branch**: `415-summary-release-workflow-s`
**Spec**: [spec.md](./spec.md)
**Date**: 2026-07-14
**Status**: Complete

## Summary

`.github/workflows/release.yml` currently validates peer-dep consistency across a **hardcoded list of packages at `@latest`** *after* a successful publish. Because the family's `@latest` tags are stale Feb–Mar 2026 preview builds, the check turns every stable publish red even though the publish itself succeeded. This plan retargets the check at the tag actually being published (`stable`), scopes participants to changesets' `publishedPackages` output (auto-including new packages like `@generacy-ai/claude-plugin-cockpit`), advances `@latest → published version` for each package published on a stable run, and emits a non-failing GitHub Actions warning annotation when residual `@latest` drift is still observed. All edits are confined to a single workflow file; no application code changes.

## Technical Context

**Language/Version**: Bash + inline Node 22 (matches existing `Validate latest peer-dep consistency` step)
**Primary Dependencies**: GitHub Actions runner tooling (`npm`, `node`), `semver` (already resolvable via `pnpm install`), `changesets/action@v1` (existing)
**Storage**: N/A — workflow-only change
**Testing**: GitHub Actions runs; validation is via the next real stable publish and a rehearsal dry-run of the inline Node against a synthesized `publishedPackages` payload
**Target Platform**: `ubuntu-latest` GitHub Actions runner (unchanged)
**Project Type**: single (monorepo workflow file edit)
**Performance Goals**: No regression — the step already runs in seconds; new work is O(n) `npm view` calls where n = packages published in the run
**Constraints**:
- Must not gate a release pre-publish (Q4=C: post-publish verification only).
- Must not touch `@latest` on preview publishes (Q2=A / FR-004).
- Must not bundle a one-time historical retag (Q3=B).
- Must fail only on genuine peer-dep conflicts within the just-published tag family (FR-006).
**Scale/Scope**: 1 workflow file, ~3 additive edits (retargeted check, `@latest` advancement, advisory annotation). No new files.

## Constitution Check

No `.specify/memory/constitution.md` present in this repo; no explicit constitutional gates to evaluate. General principles applied:

- **Minimal blast radius**: change is scoped to one workflow file; no runtime code paths touched.
- **Additive, not destructive**: existing behaviours preserved where correct — the check still fails on genuine conflicts within the published tag family (FR-006).
- **No new abstractions**: retains the inline Node approach already in place; no new scripts, packages, or CI infrastructure.

Passes. No violations to track in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/415-summary-release-workflow-s/
├── spec.md              # Feature specification (read-only)
├── clarifications.md    # Clarification Q&A (Q1–Q5)
├── plan.md              # This file
├── research.md          # Phase 0: technology + approach decisions
├── data-model.md        # Phase 1: shapes of workflow-internal data (publishedPackages, dist-tag map)
├── quickstart.md        # Phase 1: how to review, verify, and roll back the change
├── contracts/           # Phase 1: changesets/action output contract + npm dist-tag CLI contract
└── tasks.md             # Phase 2 (created later by /speckit:tasks)
```

### Source Code (repository root)

```text
.github/
└── workflows/
    └── release.yml     # SOLE file modified by this feature
```

**Structure Decision**: Single-file workflow edit. All logic (participant discovery, tag resolution, peer-dep validation, `@latest` advancement, advisory emission) is inlined in `.github/workflows/release.yml` to keep the change reviewable in one place and avoid introducing a new script boundary for a bugfix. Three step-level edits:

1. **Rewrite** `Validate latest peer-dep consistency` → `Validate published tag family peer-dep consistency`: derive participants from `steps.changesets.outputs.publishedPackages`, resolve each peer against (a) other packages published in this run at their new versions and (b) non-published peers at `@stable`. Fail only on genuine conflicts within the published family (FR-001, FR-002, FR-006, FR-007).
2. **Add** `Advance @latest for stable publishes`: for each entry in `publishedPackages`, run `npm dist-tag add <name>@<version> latest` — gated on the publish channel being `stable` (FR-004, Q2=A).
3. **Add** `Emit @latest drift advisory`: after the retargeted check passes, compare each published package's `@latest` dist-tag to its `@stable` dist-tag; emit `::warning::` annotations for divergences without failing (FR-003, US3).

Order: (1) runs first, gates on the just-published family; (2) runs only when (1) succeeds and the publish channel is stable; (3) runs after (2) so post-advancement `@latest` state is reflected in the advisory.

## Complexity Tracking

No violations. Not applicable.
