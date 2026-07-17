# Implementation Plan: Fix `/cockpit:auto` pre-flight doorbell-surface probe

**Feature**: Replace the `--help`-based doorbell-surface probe in `packages/claude-plugin-cockpit/commands/auto.md` with a pure verb-existence check (`generacy cockpit help doorbell >/dev/null 2>&1`), correct stale `generacy#970` attribution to `generacy#974`, and pin the fix with a positive + negative drift-audit assertion in `playbook-verification.test.ts`.
**Branch**: `433-summary-cockpit-auto-s`
**Issue**: [#433](https://github.com/generacy-ai/agency/issues/433)
**Date**: 2026-07-17
**Status**: Complete

## Summary

The pre-flight guard added by #431 probes for the engine doorbell surface with `generacy cockpit doorbell --help >/dev/null 2>&1` (auto.md:41). commander.js short-circuits `--help` **before** validating the subcommand: given an unknown subcommand plus `--help`, commander prints the *parent* (`generacy cockpit`) help and exits 0. The probe therefore false-passes on any cluster whose `generacy` build does not ship `doorbell`, and the loop proceeds to spawn `generacy cockpit doorbell <epic-ref>` under `Monitor`, which fails with `unknown command 'doorbell'` at sensor-spawn time — degrading to the C4 heartbeat-only recovery path instead of aborting cleanly with the intended "upgrade your generacy build" message.

The fix has three parts, all inside this repo:

1. **auto.md ~L41 probe** → replace `generacy cockpit doorbell --help >/dev/null 2>&1` with `generacy cockpit help doorbell >/dev/null 2>&1`. commander.js's auto-wired `help <verb>` router exits 1 for unknown subcommands, 0 for present ones — verified against the real snappoll cluster binary (`generacy 0.0.0-preview-20260717045830-01bbb03`, doorbell absent).
2. **auto.md ~L53 documentation cross-reference** → change `matching \`generacy cockpit doorbell --help\`` to `matching \`generacy cockpit help doorbell\``. Required so the negative drift-audit pin (FR-004) can assert the broken string `cockpit doorbell --help` appears nowhere in auto.md without misfiring on the doc reference.
3. **auto.md `generacy#970` attribution correction** → the pre-flight error message at ~L44 and the "engine-owned per generacy#970" comments at L41 and L53 all point to a wrong issue. generacy#970 already merged (as generacy PR #971) and shipped GraphQL rate-limit efficiency work — NOT the doorbell verb. The missing verb is tracked by **generacy#974** (in progress). All three references become `generacy#974`.
4. **playbook-verification.test.ts pin** → add a positive assertion that auto.md's pre-flight section contains the exact string `generacy cockpit help doorbell`, AND an explicit negative assertion that the literal string `cockpit doorbell --help` appears nowhere in auto.md (positive + negative pin per Q2=B).

This is a self-contained skill fix: prose + test edits under `packages/claude-plugin-cockpit/`, no engine or MCP-server changes. The generacy#974 verb is out of scope (owned by the generacy repo); this PR only corrects the probe so the guard fires as designed when the verb is absent, and does not regress when the verb is present (verified via a local `generacy` shim per Q3=B).

## Technical Context

- **Language / runtime**: The playbook is a Claude Code plugin markdown file (`packages/claude-plugin-cockpit/commands/auto.md`) interpreted by the harness at invocation time. No compiled code; the "implementation" is prose the model executes tool-by-tool. The test that pins the prose is `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — a Vitest suite that greps the markdown for load-bearing strings.
- **Framework**: Claude Code harness (unchanged). Load-bearing tools this fix touches by prose: harness `Bash` (for the probe), harness `Monitor` (for the step-2 sensor spawn — untouched, only the pre-flight guard above it changes).
- **External CLI dependency**: `generacy cockpit help <verb>` — commander.js's auto-wired per-verb help router. Exits 1 on unknown subcommand, 0 on present subcommand. No new subcommand added by this PR; the fix uses a mechanism that commander.js already wires for every registered command.
- **Cross-repo dependency**: `generacy#974` is the missing verb tracked in the `generacy` repo. This fix does NOT depend on #974 landing; it only ensures the pre-flight guard fires as designed when the verb is absent. Merge is decoupled from #974's timeline (Q3=B).
- **Constraint (Q1=A)**: Probe form is the pure verb-existence check `generacy cockpit help doorbell >/dev/null 2>&1` — NOT the parent-help-grep alternative (`generacy cockpit --help 2>&1 | grep -qw doorbell`). Rationale: commander.js auto-wires the `help <verb>` router for every registered command, so option A cannot be selectively unwired; option B is brittle to help-text formatting/wrapping and could false-positive if "doorbell" ever appeared in another command's description.
- **Constraint (Q2=B)**: Test pin is positive + negative (not positive-only). Rationale: positive-only would miss partial reverts or half-merges leaving the broken form lingering in one of the two occurrences (L41 probe OR L53 doc cross-reference).
- **Constraint (Q3=B)**: SC-002 (no-regression on doorbell-present clusters) is verified via a local `generacy` shim on PATH whose `cockpit help doorbell` exits 0. The shim invocation is recorded in the PR description. Merge is not blocked on generacy#974's rollout. A one-time real-build confirmation once #974 lands on a preview cluster is a follow-up rollout check, not a merge gate.

## Project Structure

Files touched by this feature (all under `packages/claude-plugin-cockpit/`):

```
packages/claude-plugin-cockpit/
├── commands/
│   └── auto.md                        ← MODIFY: (a) L41 probe: `doorbell --help` → `help doorbell`; (b) L41 comment: `generacy#970` → `generacy#974`; (c) L44 error message: `(generacy#970)` → `(generacy#974)`; (d) L53 doc cross-reference: `doorbell --help` → `help doorbell` (or `doorbell`); (e) L53 "engine-owned per" comment: `generacy#970` → `generacy#974`
└── tests/
    └── playbook-verification.test.ts  ← ADD: a new `describe("433 — auto.md doorbell probe uses pure verb-existence form, not the commander --help short-circuit", ...)` block with two assertions: (1) positive — `auto.md` contains the exact string `generacy cockpit help doorbell`; (2) negative — the literal string `cockpit doorbell --help` appears nowhere in `auto.md`
```

Files not touched:

- Any other `commands/*.md` playbook — the bug is scoped to `auto.md`'s pre-flight step. Other playbooks do not carry a doorbell-surface probe.
- The MCP engine (`cockpit_await_events`, other `cockpit_*` tools) — lives in the `generacy` repo, not editable from here.
- `generacy cockpit doorbell` itself — engine-owned; tracked by generacy#974.
- The 398 drift-audit snapshot test — verified compatible per FR-005 (no `doorbell --help` snapshot exists; the pre-flight probe uses `help doorbell` which is not a `<verb> --help` invocation, so it isn't captured by 398's fenced-block/inline-span extractor).
- The 406-3 pin that asserts step 2 spawns `generacy cockpit doorbell` — the sensor invocation is legitimate and stays. The negative pin is scoped to the exact string `cockpit doorbell --help`, which does not appear in the sensor spawn (`generacy cockpit doorbell <epic-ref>`).

## Constitution Check

No `.specify/memory/constitution.md` file present in this repo — the project has no formal constitution to check against. The change adheres to the implicit invariants of the cockpit plugin as stated in `auto.md § Invariants`:

- **Every gate prompts** (§6) — unchanged (no new gates, no gate changes).
- **Stream consumption is unfiltered** (§7) — unchanged (the fix touches pre-flight only; step 2's sensor stream and step 4's `cockpit_await_events` typed-batch source are untouched).
- **Ledger-only rows are cheap by contract** (§8) — unchanged.
- **MCP-tool-only invariant** (§9) — unchanged (`generacy cockpit help doorbell` is a pre-flight Bash probe, not a migrated-verb invocation; §9's `MIGRATED_VERBS` whitelist covers `status | context | queue | advance | resume | merge` and does not apply to `help` or `doorbell`).

**No norm-shift**. This is a bug fix to prose introduced by #431. It restores the intended pre-flight behavior, corrects a stale cross-repo attribution, and tightens the test pin. It does not introduce any new invariants, retire any existing ones, or change the sensor / actuator / gate contracts.

## Key Technical Decisions

Full rationale in `research.md`.

1. **Probe form: `generacy cockpit help doorbell >/dev/null 2>&1`** (Q1=A). Pure verb-existence check via commander.js's auto-wired `help <verb>` router. Verified against the real snappoll binary: exit 1 when the verb is absent, exit 0 when present. Explicitly NOT the parent-help-grep alternative (`generacy cockpit --help 2>&1 | grep -qw doorbell`) which is brittle to help-text formatting changes and could false-positive if "doorbell" ever appeared in another command's description or a shared help footer.
2. **Both occurrences of `cockpit doorbell --help` fixed**. The literal string appears twice in auto.md: at L41 (probe) and L53 (documentation cross-reference to the sensor invocation). Fixing only L41 would leave the L53 reference and make the negative pin misfire on a correct fix. L53 becomes `generacy cockpit help doorbell` (the corrected probe form) or `generacy cockpit doorbell` (the sensor form).
3. **`generacy#970` → `generacy#974` attribution correction**. generacy#970 already merged (as generacy PR #971) and shipped GraphQL rate-limit efficiency work, not the doorbell verb. The missing verb is tracked by generacy#974. Leaving #970 references in the error message would send operators to an already-closed PR that never provided the verb. Three references to correct: L41 comment (`the surface owned by generacy#970 hasn't landed`), L44 error message (`(generacy#970)`), L53 comment (`engine-owned per generacy#970`).
4. **Test pin: positive + negative** (Q2=B). Positive: `auto.md` contains the exact string `generacy cockpit help doorbell`. Negative: the literal string `cockpit doorbell --help` appears nowhere in `auto.md`. Rationale: positive-only would miss partial reverts leaving the broken form in either L41 or L53. The negative match is scoped to the exact string `cockpit doorbell --help` (with the `--help` flag) — NOT the bare `generacy cockpit doorbell` sensor invocation, which is legitimate and already pinned by 406-3. The negative pin puts the commander.js short-circuit bug in the test's evidence trail.
5. **SC-002 verified via local shim, not #974 rollout** (Q3=B). A local `generacy` shim on PATH whose `cockpit help doorbell` exits 0 is sufficient to verify the doorbell-present path passes pre-flight without regression. Recording the shim invocation in the PR body preserves reproducibility. The absent-path is already verified against the real binary on snappoll (exit 1). A one-time real-build confirmation once generacy#974 lands is a follow-up rollout check, not a merge gate.

## Constraints and Assumptions

- **commander.js `help <verb>` router**: The `generacy` binary is commander.js-based (confirmed via the observed `--help` short-circuit behavior that is the root cause). commander auto-wires `help <verb>` for every registered command; it cannot be selectively unwired. This is what makes option A a safe, universal check.
- **Two literal occurrences**: `grep -c "cockpit doorbell --help" packages/claude-plugin-cockpit/commands/auto.md` returns 2. The spec calls these out at L41 and L53. Both must be edited so the negative pin passes on the correct fix.
- **generacy#974 is out of scope**: This fix does not depend on the missing verb landing. The pre-flight guard's *purpose* is to produce a clean operator message when the verb is absent; the fix restores that behavior.
- **snappoll cluster evidence**: Both probe forms were verified against `generacy 0.0.0-preview-20260717045830-01bbb03` (doorbell absent). `generacy cockpit doorbell --help` → exit 0 (false positive, the bug). `generacy cockpit help doorbell` → exit 1 (correct). `generacy cockpit doorbell <ref>` → exit 1 (`unknown command 'doorbell'`, the real result).
- **No 398 collision**: The 398 drift-audit sweeps for `generacy cockpit <verb>` invocations that carry an argument and cross-checks positional angle-bracket tokens against a snapshot. The corrected probe (`generacy cockpit help doorbell`) matches the `help` verb, not the `doorbell` verb; `doorbell` appears as a positional to `help`, not as the verb itself. No `doorbell.txt` snapshot exists and none is added. FR-005 requires verifying this compatibility during implementation (single test run after the edit).

## Out of Scope

- Implementing the `generacy cockpit doorbell` verb itself — owned by generacy#974, tracked in the generacy repo.
- Refactoring pre-flight probe patterns for other engine surfaces — the bug is scoped to the doorbell probe added by #431.
- Adding a `doorbell.txt` help snapshot to `tests/fixtures/help-snapshots/` — the 398 audit only sweeps snapshot-covered verbs, and the corrected probe form (`help doorbell`) is not a `doorbell --help` invocation. A snapshot would need to be added only if a future PR wants to lock in `doorbell`'s positional shape once #974 lands.

## Next Step

Run `/speckit:tasks` to generate the ordered task list from this plan.

---

*Generated by speckit*
