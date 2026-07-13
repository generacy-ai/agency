# Implementation Plan: Pin auto.md event-consumption to unfiltered reads, forbid content-based stream filters, and add a liveness cross-check to catch broken consumption paths

**Feature**: Pin `auto.md` step 4 event consumption to unfiltered reads; forbid content-based stream filters; add step 5 liveness cross-check; add a new invariant §7; ship a behavioral regression fixture + assertions
**Branch**: `394-found-during-cockpit-v1`
**Date**: 2026-07-09
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Amend `packages/claude-plugin-cockpit/commands/auto.md` on three surfaces to close the T-S4 silent-outage class:

1. **Step 4 (Main loop) prose** — pin the consumption recipe: new lines from the background watch process output are read **unfiltered**; every non-empty line (whitespace-trimmed) is an event; content-based / JSON-field filters are **prohibited**. Name the T-S4 anti-pattern (`tail -n 0 -f <watch-output> | grep --line-buffered '"type"'`) explicitly. State the schema-heterogeneity rationale inline (legacy per-issue envelope has no `type` field; only S8 aggregates do). State the asymmetry inline: over-delivery is harmless (step 4a re-check absorbs it); under-delivery is silent loop death. If the harness's stream-monitor primitive requires a match pattern to arm, pin the sanctioned pattern as any non-empty line (`.+` or the newline-delimited-read equivalent), never a JSON field. Add a **per-iteration bounded read of 30 seconds** — the sole new detection mechanism admitted.
2. **Step 5 (Watch re-arm) prose** — add a "**Liveness cross-check**" sub-step. Fires on the conjunction of (a) background watch process alive, (b) **N=4** consecutive 30s empty reads (~2 min silence), (c) `cockpit status --json` reports ≥1 issue in a D.1–D.9 actionable transition class. The `cockpit status --json` call runs **only at the threshold**, not on every empty read. Recovery is **exactly**: re-arm the reader + re-run step 3 (startup sweep). Both are shipped, both are idempotent per the L.5 rule — **no new recovery machinery**.
3. **Invariants section** — add invariant **§7 "Stream consumption is unfiltered."** codifying the rule at the invariants-list surface so future edits to step 4 that drift from the rule are visibly inconsistent with a numbered invariant (belongs alongside §1 "Never merge on red").

Also ship an **executable behavioral regression** under `packages/claude-plugin-cockpit/tests/`:
- Fixture stream file at `packages/claude-plugin-cockpit/tests/fixtures/394-mixed-event-shapes.ndjson` containing both event shapes (≥1 legacy per-issue envelope with no `type` field + ≥1 S8 synthetic aggregate with `type`).
- Fixture state file at `packages/claude-plugin-cockpit/tests/fixtures/394-actionable-live-state.json` — a `cockpit status --json` payload with ≥1 issue in a D.1–D.9 class (paired with the empty-stream + alive-process scenario for the liveness cross-check assertion).
- A suite entry file at `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (**new** — see § Project Structure for why; the spec's "existing playbook-verification suite where the #388/#390 checks live" is aspirational: those features shipped static grep checks in `quickstart.md` only, not an executable Vitest suite). The suite starts with the two 394 assertions; the door is left open for retroactively porting #388/#390 static checks into it.

The change is **playbook prose + one new invariant + a new executable test suite scaffold** — no runtime code in the plugin, no schema change to `cockpit watch`, no CLI verb. The runtime is the model executing the playbook + Vitest for the behavioral checks. Sibling playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md`) are **byte-identical** on this branch (FR-008); a one-line PR-body assessment records the sibling grep result (SC-008). The § Ledger surface is **byte-identical** except for consistency edits (SC-009).

This is the mechanism-gap analogue of the #384 → #388 → #390 gate-adherence family:
- **#384/#388/#390** closed the *instruction-drift* class at the review gate (positional guarantee → structural fusion → subagent isolation).
- **#394** closes the *mechanism-gap* class at the main loop (under-specified consumption recipe → pinned recipe + invariant + liveness cross-check + regression fixture).

No third prompt-strengthening round is added (SC-007). One rule (step 4), one invariant (§7), one cross-check (step 5), one behavioral regression. That is the entire fix surface.

## Technical Context

**Language/Version**: Markdown (playbook prose interpreted by Claude at runtime); TypeScript (Vitest) for the behavioral regression suite.
**Primary Dependencies**: None new on the runtime side. Existing runtime: Claude Code slash-command executor, `AskUserQuestion` tool, Agent tool, Bash tool with `run_in_background`, harness Monitor primitive. `generacy cockpit watch` and `generacy cockpit status --json` remain the two authoritative signals. New on the test side: Vitest (already a dev-dep in the monorepo — verify at implementation time; add if missing).
**Storage**: Filesystem — one file edited (`packages/claude-plugin-cockpit/commands/auto.md`); three files created (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`, `packages/claude-plugin-cockpit/tests/fixtures/394-mixed-event-shapes.ndjson`, `packages/claude-plugin-cockpit/tests/fixtures/394-actionable-live-state.json`).
**Testing**:
- **Static** (necessary but proven insufficient — #384/#388/#390 showed static-only fails at behavioral defects): greps for the amended step 4 prose, the anti-pattern name (exactly once, in a prohibition context), the sanctioned `.+` pattern, the 30s bounded-read directive, the step 5 liveness-cross-check sub-step heading, the N=4 threshold, the invariant §7 heading, and the sibling-playbook byte-identity check. See [quickstart.md](./quickstart.md) § Static checks.
- **Behavioral**: Vitest suite at `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` with two initial assertions — (1) feed `394-mixed-event-shapes.ndjson` through the consumption model and assert both event shapes reach the (mocked) dispatch table; (2) feed the empty-stream + `394-actionable-live-state.json` + alive-process scenario through the liveness cross-check and assert it triggers a re-run of step 3. Because the runtime is the model, the tests verify the **model** of consumption stated in the prose (a reference implementation of the rules) — not the model's own inference. This is what "executable verification" means in the playbook-verification suite: a machine-checkable reference of the prose contract.
- **True verifier**: continued live `/cockpit:auto <epic-ref>` usage on the T-S4 corpus. Adherence is probabilistic — the pinned recipe removes the class of failure by construction; the liveness cross-check is defense-in-depth; empirical confirmation across a variety of runs is the true verifier (SC-001).
**Target Platform**: Claude Code slash-command runtime (any platform where `packages/claude-plugin-cockpit` is installed). Vitest runs in Node.js (repository-standard).
**Project Type**: Single-package playbook edit + new test suite scaffold (one plugin package touched; no cross-package changes).
**Performance Goals**: N/A (playbook adherence, not throughput). Adherence targets: 0 silent main-loop outages on the T-S4 corpus (SC-001); 100% of both event shapes reach dispatch on the fixture stream (SC-002); the liveness cross-check triggers on the actionable-live-state fixture (SC-005).
**Constraints**:
- **Detection vs recovery boundary is load-bearing** (Q4=A, FR-004/FR-005): the 30s bounded read + N=4 empty-read counter is the **only new detection mechanism admitted**, and it is a hard requirement of FR-004 (a dead reader cannot event-drive its own diagnosis). The **recovery path** stays exactly re-arm (step 5) + startup sweep (step 3); no new recovery machinery.
- **"Non-empty line" is defined operationally** (Q2=B, FR-001): trim whitespace, then non-empty. Malformed/truncated JSON is consumed as an event (step 4a re-check absorbs it safely). Whitespace-only lines are dropped as line-framing hygiene. Content-shape heuristics (must-start-with-`{`, valid-JSON parse, etc.) are **prohibited** — a truncated flush would be dropped silently, which is under-delivery — the failure class this fix exists to kill.
- **Threshold values pinned in prose only** (Assumptions, spec): 30s bounded read + N=4 empty reads (~2 min silence). No configuration surface (spec § Out of Scope). No CLI flag.
- **Compound cross-check is verbatim** (Q1=B, FR-004, US3 AC5): silence alone is **not** sufficient to trigger recovery; the cross-check fires only on the conjunction of empty-read-count AND `cockpit status --json` actionable states. The status call happens **only at the threshold**, not on every empty read.
- **Anti-pattern name is spelled out exactly once** (FR-002, SC-003): the literal string `tail -n 0 -f <watch-output> | grep --line-buffered '"type"'` appears once, in a prohibition context, so a future session cannot re-derive it from vague "don't filter" prose.
- **Ledger surface unchanged** (SC-009, FR-006): watch re-arms do not themselves produce a ledger line; only the dispatches synthesized via the startup sweep do. The liveness cross-check inherits this invariant.
- **Scope**: `auto.md` (edit) + three new test files. Sibling playbooks byte-identical (FR-008 / SC-008). § Ledger byte-identical except consistency edits (SC-009). Dispatch table, § Gate contract, § Error handling classes unchanged (spec § Out of Scope).
- **No third prompt-strengthening round** (SC-007): the change is one rule (step 4), one invariant (§7), one cross-check (step 5), one behavioral regression. No belt-and-suspenders extra clauses, no new terminal-outcome checklists, no new gate types.
**Scale/Scope**: One file edited (`auto.md`, ~651 lines pre-edit → net-slightly-larger post-edit, on the order of 40–60 net added lines across step 4, step 5, and invariants). Three files created (~40 line test file + two small fixture files). Zero files deleted, zero files renamed.

## Constitution Check

No `.specify/memory/constitution.md` file exists in this repository (`.specify/` contains only `templates/`). No governance gates to check. #388 / #390 recorded the same finding — nothing has changed on that surface.

## Project Structure

### Documentation (this feature)

```text
specs/394-found-during-cockpit-v1/
├── spec.md                              # Feature spec (read-only)
├── clarifications.md                    # Q1–Q4 with resolved answers (read-only)
├── plan.md                              # THIS FILE
├── research.md                          # Design decisions and rationale (Phase 0)
├── data-model.md                        # Playbook structural model, pre/post layout, invariants
├── quickstart.md                        # Verification runbook (static + behavioral)
├── contracts/
│   └── unfiltered-stream-consumption.md # Structural contract: step 4 read shape + step 5 liveness cross-check + fixture format
├── checklists/                          # (empty — reserved for /checklist skill)
└── tasks.md                             # Phase 2 output — generated by /tasks (NOT created by /plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/
│   └── auto.md                          # MODIFIED — step 4, step 5, invariants (§7)
└── tests/                               # NEW directory (see note below)
    ├── playbook-verification.test.ts    # NEW — Vitest suite; starts with the 394 assertions
    └── fixtures/
        ├── 394-mixed-event-shapes.ndjson # NEW — legacy per-issue + S8 aggregate lines
        └── 394-actionable-live-state.json # NEW — cockpit status --json shape with ≥1 D.1–D.9 issue
```

**Note on the test suite location**: the spec (US4 AC3, FR-007, clarification Q3=C) says fixtures live under `packages/claude-plugin-cockpit/tests/fixtures/` and assertions are added to "the existing playbook-verification suite where the #388/#390 checks live". That existing suite is **aspirational**: the #388 and #390 features shipped **static grep checks documented in `quickstart.md`** and **replayed-transcript behavioral evidence**, but no executable Vitest suite in this package. The Q3 fallback ("Only if it is genuinely absent, create a new suite file alongside the plugin's existing test layout") applies. This plan **creates the suite** at `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` and seeds it with the 394 assertions. Future features may migrate the #388/#390 static-grep checks into this suite (out of scope for #394).

Sibling files (untouched — per FR-008 / SC-008):

```text
packages/claude-plugin-cockpit/commands/
├── clarify.md    # No stream consumption; sibling of auto.md
├── review.md     # No stream consumption; sibling of auto.md
├── merge.md      # No stream consumption; sibling of auto.md
├── queue.md      # No stream consumption; sibling of auto.md
├── watch.md      # Produces the stream; does NOT consume it (auto.md is the sole consumer)
└── status.md     # No stream consumption; sibling of auto.md
```

Historical artifacts (deliberately untouched):

```text
specs/372-epic-generacy-ai-tetrad/plan.md   # Status: Complete; byte-identical across this branch
specs/384-found-during-cockpit-v1/          # Status: Complete; byte-identical across this branch
specs/388-found-during-cockpit-v1/          # Status: Complete; byte-identical across this branch
specs/390-found-during-cockpit-v1/          # Status: Complete; byte-identical across this branch
```

**Structure Decision**: Single-package playbook edit + new executable test suite. The "structure" is the internal layout of `auto.md`'s step 4, step 5, and invariants sections — see [data-model.md](./data-model.md) for the pre/post layout — plus the invocation, return-shape, and assertion contracts of the new Vitest suite — see [contracts/unfiltered-stream-consumption.md](./contracts/unfiltered-stream-consumption.md).

## Constitution Check (re-check)

No constitution file present. No gates to re-check.

## Complexity Tracking

No constitution violations to justify. The change is intentionally minimal (one prose file edit + three new small test files) and matches the fix scope named in the spec (one rule, one invariant, one cross-check, one behavioral regression). The design explicitly rejects:

- A wall-clock threshold on the last consumed line (Q1=A rejected — a broken reader has no wake-up, so the clock never fires).
- An opportunistic elapsed-time check on other loop wake-ups (Q1=C rejected — same reason; a broken reader generates no wake-ups, so an opportunistic check that runs "whenever the loop wakes for any reason" never runs at all).
- A strict-JSON-parse content filter or must-start-with-`{` heuristic (Q2=C rejected — a truncated flush would be dropped silently, which is under-delivery — the failure class this fix exists to kill).
- Standalone `.md` regression file (Q3=A rejected — not executable verification).
- Reusing detection signals only (Q4=B rejected — a dead reader cannot event-drive its own diagnosis; some clock is a hard requirement of FR-004).
- Any change to the § Dispatch table, § Gate contract, § Ledger format, or § Error handling classes (spec § Out of Scope).
- Any configuration surface for the N-poll or 30s threshold (pinned in prose only; spec § Out of Scope).

## Phase Layering

- **Phase 0 (research)**: Captured in [research.md](./research.md) — the Q1–Q4 decisions and their rationale (resolved in `clarifications.md`; research.md restates them as design decisions with alternatives-rejected).
- **Phase 1 (design)**: [data-model.md](./data-model.md) (pre/post layout of step 4, step 5, invariants; contract invariants C.1–C.11), [contracts/unfiltered-stream-consumption.md](./contracts/unfiltered-stream-consumption.md) (structural contract: read shape + cross-check trigger + fixture format + parent recovery), [quickstart.md](./quickstart.md) (verification runbook — static greps + Vitest suite).
- **Phase 2 (tasks)**: Generated by `/tasks` from this plan — NOT created here.

## Key Design Decisions (from clarifications)

| # | Decision | Source |
|---|----------|--------|
| D1 | **Liveness threshold: bounded-read count, not wall-clock.** Step 4 read is per-iteration bounded to 30 seconds; the cross-check fires after N=4 consecutive empty returns (~2 minutes of silence). The 30s bound mirrors the watcher's own poll cadence. Cross-check remains **compound** (silence + actionable live state), and the status call happens only at the threshold. | Q1=B |
| D2 | **"Non-empty line" = trim, then non-empty.** Whitespace-only lines dropped as line-framing hygiene; everything else (including malformed/truncated JSON) is consumed as an event. Content-shape heuristics (must-start-with-`{`, JSON parseability) are prohibited — a truncated flush would be dropped silently, which is under-delivery — the failure class this fix exists to kill. | Q2=B |
| D3 | **Regression location: fixtures under `packages/claude-plugin-cockpit/tests/fixtures/`, assertions in a new Vitest suite at `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`.** The spec's "existing playbook-verification suite where the #388/#390 checks live" is aspirational; those features shipped static grep + replayed-transcript verification only. Q3=C's fallback ("Only if it is genuinely absent, create a new suite file alongside the plugin's existing test layout") applies. | Q3=C |
| D4 | **Detection machinery is in scope; recovery machinery is not.** FR-005's "no new recovery machinery" constrains the **recovery path only**, which stays exactly re-arm (step 5) + startup sweep (step 3). The 30s bounded read + N=4 empty-read counter is the **only new detection mechanism admitted**, and it is a hard requirement of FR-004 (a dead reader cannot event-drive its own diagnosis). | Q4=A |

## Rejected Approaches (informative)

- **Wall-clock "seconds since last consumed line" threshold on step 4** (Q1=A). Rejected: the exact failure mode is a reader that never wakes up; a wall-clock elapsed check that only runs when the reader wakes never fires. The bounded-read cadence (Q1=B) is what makes the empty-read counter observable in the first place.
- **Opportunistic elapsed-time check "whenever the loop wakes for any reason"** (Q1=C). Rejected for the same reason: permanent blindness is precisely what we observed.
- **Byte-length > 0 without whitespace trim** (Q2=A). Rejected: whitespace-only lines carry no information; consuming them dilutes the "every line is an event" contract without adding coverage.
- **`{`-prefix / valid-JSON parse heuristic on the read boundary** (Q2=C). Rejected: it is itself a content-shape filter — the exact class this fix exists to prohibit. A truncated flush would be dropped silently — under-delivery — the failure this fix exists to kill.
- **New standalone `.md` regression file colocated with `auto.md`** (Q3=A). Rejected: not executable verification; a future edit that silently regressed the behavior would still parse the `.md` file cleanly.
- **Detection reuses existing signals only** (Q4=B). Rejected: the observed bug **is** exactly this shape (waiting for the loop to wake up when the reader is dead).
- **Retroactive edit of the completed epic plan (`specs/372-epic-generacy-ai-tetrad/plan.md`)**. Rejected: `Status: Complete` historical artifact; not in scope for #394.
- **Amend `docs/epic-cockpit-plan.md` in tetrad-development** (out of repo). Not this repo's surface; a companion issue in that repo (if warranted) is outside this fix's scope.
- **Add a runtime probe or telemetry counter for consumed-events-per-minute** (spec § Out of Scope). The liveness cross-check *is* the probe; a separate metric would duplicate its function without changing the outcome.
- **Retrofit a `type` discriminator inline in the playbook by re-classifying events at read time** (spec § Out of Scope). Classification is authoritative via `cockpit status --json` at step 4a; classifying at line parse time would smuggle a content filter back in through a different door.
- **Add a plugin-level lint that fails CI on `grep '"type"'` in `auto.md`.** Rejected as scope creep — the static greps in quickstart.md and the new Vitest suite together cover the concern. If a future incident shows a linter is needed, that is a new issue.
- **Auto-approve on any gate.** Every gate still prompts (invariant §6). This fix does not touch the gate surface.

## Verification Layering (per SC-002 / SC-005)

Static (necessary but not sufficient — the #384/#388/#390 experience proved static-only fails at behavioral defects):

- Step 4 prose contains the **"unfiltered"** phrasing (greppable anchor).
- Step 4 prose names the T-S4 anti-pattern **`tail -n 0 -f <watch-output> | grep --line-buffered '"type"'`** exactly once, in a prohibition context (SC-003).
- Step 4 prose contains the sanctioned `.+` pattern (or "newline-delimited read" equivalent) for the harness stream-monitor primitive.
- Step 4 prose contains the **30-second bounded-read** directive verbatim.
- Step 5 prose contains the "**Liveness cross-check**" sub-step heading and the three named preconditions.
- Step 5 prose contains the recovery path: re-arm the reader + re-run step 3.
- Step 5 prose contains the **N=4** threshold verbatim.
- Invariants section contains invariant **§7 "Stream consumption is unfiltered."** verbatim.
- `git diff origin/develop` on sibling playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md`) shows zero changes.
- `git diff origin/develop` on the § Ledger section of `auto.md` shows either zero changes or only consistency edits (SC-009).
- Historical spec directories (`specs/372-…`, `specs/384-…`, `specs/388-…`, `specs/390-…`) show zero changes on this branch.

Behavioral (evidence, not proof — Vitest suite):

- **Assertion 1 (SC-002)**: feeding `394-mixed-event-shapes.ndjson` through the consumption reference asserts both event shapes reach the mocked dispatch table (`dispatch_calls.length === input_lines.length`; the specific transitions from the fixture are represented in `dispatch_calls`).
- **Assertion 2 (SC-005)**: with an empty stream + `394-actionable-live-state.json` + an alive process, the liveness cross-check fires (recovery function is called with the startup-sweep argument) after exactly N=4 empty reads.

True verifier:

- Continued live `/cockpit:auto <epic-ref>` usage on the T-S4 corpus that triggered #394 (SC-001). Adherence is probabilistic — the pinned recipe removes the class of failure by construction; the liveness cross-check is defense-in-depth; empirical confirmation across a variety of runs is the true verifier.
