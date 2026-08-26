# Implementation Plan: D.5 merge-past-G.8 guard + remediation-limit findings-fetch contract

**Feature**: D.5 merge-past-G.8 guard + remediation-limit findings-fetch contract (severity: major / P1)
**Branch**: `504-severity-major-p1-playbook`
**Status**: Complete

## Summary

Three playbook/contract corrections to `packages/claude-plugin-cockpit`, aligning the `auto` playbook to the post-#1120 engine's actual behavior at the final-approval boundary:

1. **D.5 merge-past-G.8 guard (P0 safety fix).** At the engine's on-ci-green pause an issue holds `completed:validate` + `waiting-for:implementation-review` + `agent:paused` simultaneously. The `completed:validate` label event reaches the doorbell first, so D.5 fires and calls `cockpit_merge` — which does not block (validate label present, CI green by construction) — merging the PR before the operator ever answers G.8. Add a `waiting-for:implementation-review`-absent guard to D.5: when the label co-occurs, D.5 writes a passive no-op ledger row (`deferred: implementation-review pending`) and drops the event; the co-present `waiting-for:implementation-review` transition is D.3's own trigger and presents G.8. When the enriched line is not decisive about the label, D.5 fails safe with an authoritative `cockpit_status(json=true)` re-query (mirroring the existing `checks` fallback idiom).

2. **Remediation-limit findings-fetch contract (D.13 / G.9).** Replace the undefined "parse findings from the gate body" prose with a concrete retrieval: client-side `gh issue view <issue-ref> --json comments`, selecting the single most-recent comment (by `createdAt`) whose body `startsWith` the exact, case-sensitive string `## Remediation limit reached`; parse `- <file>:<line> — <title>` bullets; render an explicit `(none)` fallback when no comment matches. Identical in local and UI gate modes (the source is the engine's issue comment, not the gate record).

3. **Stale-reference cleanup (US3).** G.8 prose stops claiming a per-implementation-review gate-body findings artifact (the on-ci-green branch writes no comment; G.8 renders `(none)` unconditionally). `gate-status-check.ts` docstring drops the removed D.6/G.4a escalation row. The `cockpit.auto.agents` selector drops the unused `fixer` role key. The stale `playbook-verification.test.ts:2839` "10-row table" comment is corrected.

Per CLAUDE.md's drift-audit rule, every `playbook-verification.test.ts` pin touched by these edits is **re-pinned to the new contract in the same change** — no assertion is weakened or deleted.

This is a documentation / contract / test-repin change only. **No engine (generacy) code is touched, and no runtime plugin code changes** except the `gate-status-check.ts` docstring comment.

## Technical Context

- **Language / runtime**: TypeScript (tests), Markdown (playbook + contracts). pnpm workspaces monorepo.
- **Package**: `packages/claude-plugin-cockpit`.
- **Primary artifacts edited**:
  - `packages/claude-plugin-cockpit/commands/auto.md` — D.5 (`:813-831`), D.13 (`:1035-1054`), G.8 (`:1476-1500`), G.9 (`:1502-1518`), `cockpit.auto.agents` config (`:262`), UI-mode G.8 mapping row.
  - `packages/claude-plugin-cockpit/lib/gate-status-check.ts` — docstring `:164-165` (comment only; no code).
  - `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — re-pin 437-5, 500-5, 500-6 (+ any adjacent D.5/D.13/G.8/G.9 pins), fix stale comment `:2839`.
- **Test command**: `pnpm --filter @generacy/claude-plugin-cockpit test` (or `pnpm test` at repo root), targeting `playbook-verification.test.ts`.
- **No new dependencies.** No build-output shape change. No public API change.
- **Engine assumptions (frozen at generacy `develop` `155b3464`)**: co-present `completed:validate` + `waiting-for:implementation-review` + `agent:paused` at on-ci-green (`phase-loop.ts:1513-1531`); remediation-limit comment written as `## Remediation limit reached` + `- <file>:<line> — <title>` bullets (`phase-loop.ts:1411-1421`); on-ci-green implementation-review branch posts no findings comment (`phase-loop.ts:1435-1453`).

## Constitution Check

No `.specify/memory/constitution.md` exists in this repo. The governing contract for this work is CLAUDE.md § "Cockpit playbook pins": every `commands/*.md` playbook is pinned by exact heading strings and contract rules; when an edit breaks a pin, the correct response is to **re-pin to the new contract in the same PR**, never to weaken or delete the assertion. FR-009 encodes this obligation directly, and the task ordering below places the re-pin in the same change as each playbook edit.

## Project Structure

```
packages/claude-plugin-cockpit/
├── commands/
│   └── auto.md                        # D.5 guard, D.13/G.9 fetch contract, G.8 prose, agents config
├── lib/
│   └── gate-status-check.ts           # docstring :164-165 (D.6/G.4a removal)
└── tests/
    └── playbook-verification.test.ts  # re-pin 437-5 / 500-5 / 500-6; fix :2839 comment

specs/504-severity-major-p1-playbook/
├── spec.md              # (read-only)
├── clarifications.md     # (read-only)
├── plan.md               # this file
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── d5-implementation-review-guard.md
    └── remediation-limit-findings-fetch.md
```

## Implementation Phases (high level)

1. **D.5 guard (FR-001, FR-002)** — add the `waiting-for:implementation-review`-absent guard + fail-safe re-query to D.5 Dispatch; add the `deferred: implementation-review pending` outcome token to the D.5 ledger enum; state the passive-no-op / D.3-trigger relationship.
2. **Findings-fetch contract (FR-003, FR-004)** — rewrite D.13 step 1 and G.9 Presentation with the `gh issue view --json comments` retrieval, the `startsWith`/`createdAt` selection predicate, the `- <file>:<line> — <title>` bullet contract, and the `(none)` fallback.
3. **Stale cleanup (FR-005–FR-008)** — G.8 prose → unconditional `(none)`; `gate-status-check.ts` docstring; `cockpit.auto.agents` `fixer` removal; test comment `:2839`.
4. **Re-pin tests (FR-009)** — update every broken pin to the new contract; add positive/negative pins for the new D.5 guard, deferral token, and findings-fetch predicate; run the suite green.

Detailed, dependency-ordered tasks are produced by `/speckit:tasks`.

## Risks & Watch-outs

- **437-5 negative pin interaction.** 437-5 asserts D.5/D.6 narrations do NOT match `/defer\s+(this\s+wake|on\s+pending)/i`. The new deferral token `deferred: implementation-review pending` does not match that regex (no whitespace after `defer`), but the guard prose must avoid the literal "defer this wake" / "defer on pending" phrasings. It must also keep the existing positive pins that D.5 names both `absent` and `pending` as `checks` fallback triggers — the new label guard adds a *second* use of "absent"/"pending", so preserve the `checks`-verdict wording.
- **`—` (em-dash) exactness.** The bullet contract `- <file>:<line> — <title>` and the `## Remediation limit reached` heading are exact, case-sensitive engine artifacts. Pins must assert the literal strings (em-dash `—`, not hyphen).
- **`(none)` byte-mirror.** G.8/G.9 keep the exact `| (none) | | | |` table row; do not reformat.
- **No engine edits.** Everything here describes existing engine behavior — resist "fixing" the engine.

## Next Step

Run `/speckit:tasks` to generate the dependency-ordered task list.
