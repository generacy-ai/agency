# Clarifications: Fix inverted engine-compatibility gating in `/cockpit:auto`

**Issue**: [generacy-ai/agency#502](https://github.com/generacy-ai/agency/issues/502)

## Batch 1 — 2026-08-21

### Q1: Detection mechanism & timing
**Context**: FR-001 requires replacing the `MIN_GENERACY_VERSION = 0.2.0` literal with "capability detection" but lists three alternative "e.g." mechanisms without committing to one. Critically, pre-flight runs *before* any issue reaches the `implementation-review` phase, so the "probe whether the gate co-occurs with `completed:validate`" option cannot actually be observed at pre-flight time. The chosen mechanism and its timing drive the entire implementation.
**Question**: Which mechanism should determine engine compatibility, and when does it run?
**Options**:
- A: Pre-flight capability probe — query a dedicated engine surface (e.g. a `generacy cockpit` subcommand exposing the review/merge-gate model or `reviewPhaseEnabled`/`ciMergeGateEnabled`) at startup.
- B: Corrected version literal — key on the version that genuinely ships #1120 once released, accepting it cannot distinguish flag-off builds.
- C: Runtime detection — defer the decision to the first time `implementation-review` fires, observing whether it co-occurs with `completed:validate`, rather than gating at pre-flight.
- D: Hybrid — pre-flight capability/version probe plus a runtime gate-placement fallback.

**Answer**: D — Hybrid. Pre-flight capability/version probe (advisory fast-fail) plus a runtime gate-placement fallback. A pure pre-flight capability probe is infeasible (no engine surface exposes the gate model today, per Q3) and a version literal is proven unreliable (the guard rejected a demonstrable #1120 build reporting `0.0.1`, and npm stable stays `0.10.2` so version cannot distinguish compatible engines). Runtime gate-placement — observing whether `implementation-review` co-occurs with `completed:validate` — is the authoritative signal.

### Q2: Flag-off / legacy engine outcome
**Context**: FR-002 offers two alternatives joined by "or": restore a working legacy advance-on-approve path, OR fail closed with an actionable message. These are very different in scope — restoring the legacy path means re-adding the `cockpit_advance(gate="implementation-review")` logic that #500 removed entirely, whereas fail-closed is a small pre-flight guard. The engine defaults (`reviewPhaseEnabled = false`, `ciMergeGateEnabled = false`) mean the flag-off state is the common deployed case, so this choice determines whether stock engines can run `auto` at all.
**Question**: For a pre-relocation / flag-off engine, what should `auto` do?
**Options**:
- A: Fail closed only — exit non-zero with an actionable message naming the required engine flags; no legacy path (smallest scope, but stock engines cannot run `auto`).
- B: Restore the legacy advance-on-approve path so flag-off engines complete end-to-end under `auto`.
- C: Both — route detectable flag-off engines to a legacy path; fail closed only when neither model can be detected.

**Answer**: C — Both. Route detectable flag-off engines to a legacy advance-on-approve path; fail closed only when neither model can be detected. Engine defaults `reviewPhaseEnabled` / `ciMergeGateEnabled` are both false (the common deployed case), so fail-closed-only would leave stock engines unable to run `auto` at all — the P0 this epic exists to remove. C satisfies FR-002's "working legacy path OR fail closed" while retaining the fail-closed safety net.

### Q3: Concrete capability signal source
**Context**: The Assumptions section states the engine "exposes an observable capability signal (gate placement … and/or the `reviewPhaseEnabled` / `ciMergeGateEnabled` flag state) that pre-flight can probe." Implementation needs a concrete, callable surface — the doorbell probe uses `generacy cockpit help doorbell`, but no equivalent is named for the review/merge-gate model. If no such surface exists today, the capability-detection direction is not feasible at spec time.
**Question**: What concrete surface exposes the capability signal that detection should read?
**Options**:
- A: A named `generacy` CLI subcommand or MCP field already exists (please name it) that reports the gate model or flag state.
- B: The engine flags must be added/exposed as part of this work (out of the agency repo — coordinate with generacy).
- C: No reliable pre-flight surface exists — detection must rely on version or runtime observation instead (ties to Q1).

**Answer**: C — No reliable pre-flight surface exists; detection must rely on version or runtime observation (ties to Q1). Verified via `generacy cockpit --help`: it exposes only watch/doorbell/status/advance/context/merge/queue/resume/scope/mcp — none reporting the review/merge-gate model or the `reviewPhaseEnabled` / `ciMergeGateEnabled` flag state. Adding such a surface is cross-repo and out of scope.

### Q4: Scope of the pin-test re-pin (500-1)
**Context**: FR-005 requires re-pinning test `500-1` (`playbook-verification.test.ts:5887`) to the corrected mechanism per the CLAUDE.md re-pin rule. What `500-1` must assert depends entirely on the Q1/Q2 outcome, but the fail-closed message contract also matters.
**Question**: Should `500-1` freeze both the detection mechanism AND the exact fail-closed diagnostic string (flag names, wording), or only the detection mechanism?
**Options**:
- A: Freeze both the detection mechanism and the exact fail-closed diagnostic wording (byte-mirroring the existing Monitor/doorbell/version pre-flight pins).
- B: Freeze only the detection mechanism / decision branches; assert the fail-closed message loosely (presence, not exact bytes).

**Answer**: A — Freeze both the detection mechanism and the exact fail-closed diagnostic wording (byte-mirroring the existing Monitor/doorbell/version pre-flight pins). FR-004 requires the fail-closed branch to byte-mirror the sibling pre-flight fails, and FR-005 + the CLAUDE.md re-pin rule mandate re-pinning without weakening; a loose assert would drop the load-bearing flag-name contract (`reviewPhaseEnabled`, `ciMergeGateEnabled`).
