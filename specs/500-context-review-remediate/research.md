# Research: Slim `cockpit:auto` to gates / queue / clarify / merge

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Clarifications**: [clarifications.md](./clarifications.md)

This document records the technical decisions behind the plan, the alternatives considered, and the
one genuine design interaction (D.5 / D.3 post-validate ordering). Every decision traces to a
clarification (Q1–Q5) or is marked *derived* where it follows from the pin contract rather than a
clarification.

## Decision index

| # | Decision | Choice | Source |
|---|----------|--------|--------|
| D1 | Final-approval gate shape | `approve`→merge / `hold`,`reject`→no-op; findings from gate body; no reviewer subagent | Q1 |
| D2 | Remediation-limit resume verb | `resume remediation`/`stop`; resume → `cockpit_advance(issue, gate="remediation-limit")` | Q2 |
| D3 | Version-skew detection | `generacy --version` pre-flight probe; hard-fail below `MIN_GENERACY_VERSION` | Q3 |
| D4 | D.6 red-checks fixer | Remove entirely; `completed:validate` red → ledger-only, re-fires as engine gate | Q4 |
| D5 | D.9 / D.9a rows | Keep ledger-only, unchanged | Q5 |
| D6 | Keep D.3 gateType `implementation-review` + Step 0 | Reused by G.8; preserve identity/drift/adoption machinery | derived |
| D7 | New gates as own contracts (G.8 / G.9) | Do not fold into G.2/G.3; keep artifact guardrail untouched | derived |
| D8 | D.5 / D.3 post-validate ordering | Keep D.5 merge path unchanged; route final-approval `approve` into it | derived (see § below) |

## D1 — Final-approval gate shape (Q1 = Option A)

**Decision**: The repurposed D.3 (`waiting-for:implementation-review`, now post-validate) presents
`approve` / `hold` / `reject`. `approve` → the existing cockpit merge path (merge on green, never on
red). `hold` / `reject` → no-op: the `waiting-for:implementation-review` label stays and the gate
re-fires later (byte-mirrors D.4's `not yet`). The gate renders remaining findings parsed from the
gate body if present; it does **not** spawn `cockpit-reviewer`.

**Rationale**: US3/FR-004 scope the gate strictly to "approval routes into the cockpit merge path".
FR-001/SC-002 forbid reviewer/fixer dispatch against implementation PRs. Because the engine already
ran review/remediate/validate before this gate fires, there is no fresh verdict to compute — the
findings already exist in the gate body, so the client renders them rather than regenerating them.

**Alternatives considered**:
- *Option B* (`approve`→merge / `request-changes`→resume engine remediation). Rejected: it overloads
  this terminal post-validate gate with the remediation-resume responsibility that Q2 assigns to the
  separate `remediation-limit` gate. Two gates with a resume path is more surface than the spec asks
  for, and it blurs the "final approval" semantics.
- *Option C* (single `approve` action; rejection handled by the human editing labels/PR directly; no
  findings rendered). Rejected: dropping the findings render loses the operator's decision context,
  and an implicit "edit labels yourself" rejection path is less legible than the `hold`/`reject`
  no-op that mirrors an existing playbook idiom (D.4 `not yet`).

## D2 — Remediation-limit resume verb (Q2 = Option A)

**Decision**: `waiting-for:remediation-limit` presents `resume remediation` / `stop`. `resume
remediation` calls `cockpit_advance(issue=<ref>, gate="remediation-limit")`, which resets the
engine's remediation counter server-side (same engine-gate-advance pattern D.4 uses with
`cockpit_advance(issue, gate="manual-validation")`). `stop` exits auto cleanly with **no label
writes**.

**Rationale**: Every engine gate in the playbook resolves via `cockpit_advance(issue, gate=<name>)`.
`remediation-limit` is a `waiting-for:*` engine gate of the same class, so it uses the same verb.

**Alternatives considered**:
- Using `cockpit_resume(...)`. Rejected: `cockpit_resume` is the process/paused-issue resume verb,
  not a labeled-gate answer. Using it here would target the wrong server-side state machine and
  would not reset the remediation counter.
- A three-option set (`resume` / `skip (session mute)` / `stop (exit auto)`) mirroring the old D.6
  escalation-gate verdicts (Option B). Rejected: the `skip (session mute)` verdict belonged to the
  cluster-driven escalation loop that Q4 removes; there is no session-mute concept for an
  engine-owned remediation cap.

## D3 — Version-skew detection (Q3 = Option A)

**Decision**: At § step 1 pre-flight, alongside the existing `command -v generacy` presence check,
probe `generacy --version`, parse it, and compare against `MIN_GENERACY_VERSION` (a literal stated
verbatim in the playbook prose). Below the minimum → abort the run at pre-flight with a visible
operator error naming the required version; do **not** create the ledger dir, do **not** start the
loop. On unparseable/missing version output, fail closed (treat as below-minimum) with a distinct
diagnostic.

**Rationale**: US5 demands *non-silent* degradation. The actively dangerous skew is old-engine +
new-auto: an old engine still expects the client to drive review rounds, but a slimmed `auto` no
longer does — a silent strand. A visible pre-flight abort turns that strand into an operator-legible
failure that names the fix (upgrade generacy). `generacy` already exposes `.version(VERSION)`, so
the probe reuses the CLI `auto` already invokes — no new MCP field is needed. This mirrors the
existing Monitor-absence and doorbell-absence hard-fails, so the failure shape is already familiar to
operators and already pinned as a contract idiom.

**Both skew directions**:
- *old-engine + new-auto* — actively blocked by this guard (the old engine's version is below
  `MIN_GENERACY_VERSION`).
- *new-engine + old-auto* — inert by construction: an old `auto` lacks the D.13 / G.8 / G.9 rows, so
  the engine's new gates fall through to the D.10 unknown-state escalation on the old client — a
  visible escalation, not a silent strand. No new guard is needed for this direction.

**Alternatives considered**:
- *Option B* (warn-and-continue, treating unknown new gates as ledger-only no-ops). Rejected: below
  `MIN_GENERACY_VERSION` the engine does *not* emit the new gates and *does* expect client-driven
  rounds, so "continue as ledger-only" is exactly the silent strand US5 forbids.
- *Option C* (prose-only minimum, no runtime probe; rely on label emission/omission to make
  combinations inert). Rejected: it does not cover old-engine + new-auto, where the old engine emits
  the *old* labels and the new client silently under-drives them.

**Sourcing `MIN_GENERACY_VERSION`**: the concrete value is the first generacy release that ships epic
#1120's post-validate `implementation-review` gate move plus the `remediation-limit` gate. This is a
**tasks-phase input** — the literal is pinned in the prose and the pin, and its value is read from
the generacy release notes / epic #1120 at implement time. The plan and pins treat it as a
load-bearing literal; only its digits are deferred.

## D4 — D.6 red-checks fixer (Q4 = Option A)

**Decision**: Remove D.6's bounded-`cockpit-fixer` dispatch and the G.4a escalation gate entirely.
`completed:validate` red (E4 `checks: "red"`, a red fallback, or a merge returning `result: "red"`)
becomes a ledger-only no-op that re-fires as an engine gate (remediation / remediation-limit). D.6
stays a *recognised* dispatch row so a red validate is never an unrecognised state (D.10).

**Rationale**: FR-001 explicitly lists D.6 for removal alongside D.3/G.2. SC-002 requires *zero*
reviewer/fixer dispatch, so retaining even a single autonomous fixer attempt (Option C) violates it.
The epic's Out-of-Scope assigns CI/validate orchestration to the engine (P1–P4), so red validate is
now engine-owned; `auto` reacts to the resulting engine gate instead of driving the fix.

**Alternatives considered**:
- *Option B* (retain D.6 unchanged as a merge-time CI-fix concern distinct from review rounds).
  Rejected: it keeps a `cockpit-fixer` dispatch, violating SC-002, and duplicates remediation the
  engine now owns.
- *Option C* (keep one autonomous fixer attempt, strip only the escalation gate). Rejected for the
  same SC-002 reason — "zero" is zero.

**Why D.6 is not deleted outright**: E3/E4 still route `checks: "red"` to D.6. If the row were
removed, a red validate would fall through to D.10 (unknown state) and raise a spurious escalation.
Keeping D.6 as a recognised-but-ledger-only row preserves the routing while removing the dispatch.

## D5 — D.9 / D.9a rows (Q5 = Option A)

**Decision**: Keep D.9 (`waiting-for:address-pr-feedback`) and D.9a (`waiting-for:pr-feedback`) as
ledger-only rows, unchanged.

**Rationale**: FR-006's ledger-only branch is already satisfied — both rows are ledger-line-only and
server-side-owned today. Deleting them would (a) strip pins FR-007/US4 forbid weakening, (b) orphan
the E3 enriched-line-contract references to D.9/D.9a, and (c) risk pre-migration epics emitting the
legacy `waiting-for:pr-feedback` alias falling through to the D.10 unknown-state escalation gate.
Keeping them is consistent with sibling ledger-only rows D.9b/D.9c/D.9d.

## D6 — Keep D.3 gateType `implementation-review` + Step 0 (derived)

**Decision**: D.3 keeps its `implementation-review` gateType (generation = PR head SHA) and its Step 0
pre-draft gate-status check. Only the *analysis and verdict-application* content of D.3 changes
(reviewer dispatch → final-approval render+merge).

**Rationale**: #457/#469/#471 key gate identity on `(gateType, generation, runId)`. The Step 0
pre-draft gate-status check, the startup-sweep adoption (#471), and the generation-drift branch guard
(#457) all depend on the `implementation-review` gateType being present. Dropping the gateType would
strand adoption/dedup for the post-validate gate and break the drift guard's 1:1 mapping. The gate
*moved* server-side (pre-validate → post-validate) but its *identity* is unchanged, so reusing the
gateType is both correct and the minimal edit.

## D7 — New gates as their own contracts, not folded into G.2/G.3 (derived)

**Decision**: The final-approval gate is a new contract **G.8**; the remediation-limit gate is a new
contract **G.9**. Neither is folded into G.2 (artifact review-verdict) or G.3 (manual-validation).

**Rationale**: FR-002 requires the artifact request-changes guardrail (G.2) to stay untouched.
Folding the final-approval gate into G.2 would entangle the artifact three-option set
(`approve`/`request-changes`/`abort`) and its four-step request-changes guardrail with the new
`approve`/`hold`/`reject` merge flow — exactly the coupling this change removes. Separate contracts
keep the pin surface clean and let each gate render its findings from the engine gate body rather
than a subagent.

## D8 — D.5 / D.3 post-validate ordering (derived; the one genuine interaction)

**The interaction**: Today D.5 (`completed:validate` green → `cockpit_merge`) auto-merges on the
premise that "operator judgment was recorded at `waiting-for:implementation-review` (D.3)" —
i.e. D.3 fires *before* validate, and D.5 is the mechanical merge once validate goes green. Post-epic
#1120 the engine moves `implementation-review` to *after* validate as a final human approval. That
raises the question: once validate is green, does the engine auto-merge (old D.5 premise), or does it
raise the post-validate `implementation-review` gate and wait for `approve`?

**Resolution (conservative)**: The spec does not list D.5 for change and scopes the merge path as
"reused unchanged" (Assumptions, Out of Scope). So the plan:
1. Keeps D.5's mechanical merge path intact (merge on green, never on red).
2. Routes the final-approval gate's `approve` verdict **into that same merge path** — `approve` is the
   operator judgment that D.5's premise assumed, now supplied explicitly post-validate instead of
   pre-validate.
3. Does **not** have D.5 auto-merge without that approval when the engine has raised the post-validate
   gate — the gate is the approval, and merge happens on `approve`, not on bare green.

**The exact engine emission order is a tasks-phase confirmation.** Specifically: when validate goes
green, does the engine (a) emit `completed:validate` green *and* raise `waiting-for:implementation-review`
(so D.3/G.8 is the merge trigger and D.5 becomes a no-op/absent for engine-native epics), or (b) emit
only `completed:validate` green and expect the client's D.5 to merge (making the post-validate gate
a pre-merge checkpoint that must be cleared first)? Interpretation (a) is the design-doc reading
(the gate *is* the final approval, so it gates merge) and is what the plan encodes. This must be
confirmed against `docs/engine-review-remediate-plan.md` (generacy-ai/tetrad-development) and epic
#1120 before the D.5 prose is finalized in tasks. If (b) turns out correct, D.5 keeps auto-merging on
green and G.8 becomes a pre-validate-style checkpoint — but that contradicts "post-validate final
approval", so (a) is the working assumption.

**Why this is safe either way**: both interpretations preserve the §1 invariant (never merge on red)
and route merge through `cockpit_merge`. The only behavioral difference is *what triggers the merge*
(bare green vs. explicit `approve`), and the spec's "approval routes into the cockpit merge path"
(US3/FR-004) makes `approve`-triggered merge the required behavior regardless.

## Implementation patterns reused (no invention)

- **Gate-advance via `cockpit_advance(issue, gate=<name>)`** — the universal engine-gate-answer verb;
  D.4 (`manual-validation`), and now D.13 (`remediation-limit`), use it identically.
- **`hold`/`reject`/`stop` = no label write** — mirrors D.4's `not yet` (add-only advance invariant §3).
- **Pre-flight hard-fail (exit non-zero, no ledger dir, no loop)** — mirrors the Monitor-absence
  (`auto.md:208–214`) and doorbell-absence (`:218–224`) checks; the version guard is a third instance.
- **Step 0 pre-draft gate-status check + 1:1 drift branch** — D.4's shape; D.13 reuses it (its
  `remediation-limit` gateType is 1:1 so the drift branch is enabled, unlike the shared-enum
  `escalation` gateType).
- **Re-pin positive + negative** — the #433 pin pattern; every removed-contract assertion re-pinned to
  its replacement plus a negative asserting the old phrasing is absent.

## Key references

- `specs/500-context-review-remediate/spec.md` — FR-001..FR-008, US1..US5, SC-001..SC-004.
- `specs/500-context-review-remediate/clarifications.md` — Batch 1 Q1–Q5 (all Option A).
- `packages/claude-plugin-cockpit/commands/auto.md` — the playbook under edit (dispatch D.1–D.12,
  gates G.1–G.7, escalation subtypes G.4a–e, enriched-line contract E1–E7, invariants §1–§9).
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — the pin suite (per-issue
  `describe` blocks; re-pin targets listed in plan.md § "Test edits").
- CLAUDE.md § "Cockpit playbook pins" — re-pin-never-weaken discipline.
- `docs/engine-review-remediate-plan.md` (generacy-ai/tetrad-development) + epic generacy#1120 —
  the engine design; the authority for the D.5/D.3 emission-order confirmation (D8).
