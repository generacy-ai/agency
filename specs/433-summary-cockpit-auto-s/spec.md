# Feature Specification: ## Summary

`/cockpit:auto`'s pre-flight guard for the engine doorbell surface can't detect the verb's absence

**Branch**: `433-summary-cockpit-auto-s` | **Date**: 2026-07-17 | **Status**: Draft

## Summary

## Summary

`/cockpit:auto`'s pre-flight guard for the engine doorbell surface can't detect the verb's absence. The probe uses `--help`, which commander.js short-circuits to the **parent** command's help with exit 0 — so the check false-passes even when `generacy cockpit doorbell` does not exist. The run then proceeds and fails at sensor-spawn time with `unknown command 'doorbell'`, instead of aborting cleanly with the intended "upgrade your generacy build" message.

## Where

`packages/claude-plugin-cockpit/commands/auto.md`, pre-flight step (~L41-44):

```
Next, probe for the engine doorbell surface with
`generacy cockpit doorbell --help >/dev/null 2>&1`. If the probe exits non-zero
(the current generacy build doesn't ship the doorbell subcommand …) print verbatim:
  Engine doorbell surface not available. …
```

## Root cause

commander.js processes `--help` before validating the subcommand. Given an unknown subcommand plus `--help`, it prints the parent (`generacy cockpit`) help and **exits 0**. So the probe reports "present" for a verb that doesn't exist.

## Evidence (snappoll cluster, generacy `0.0.0-preview-20260717045830-01bbb03`, doorbell absent)

```
$ generacy cockpit doorbell --help >/dev/null 2>&1;      echo $?   # 0  ← false positive
$ generacy cockpit doorbell christrudelpw/snappoll#1 >/dev/null 2>&1; echo $?   # 1  ← real result
```

The gap between the `--help` probe (0) and the runtime verb (1) is what let the loop proceed and then fail at step 2. Observed as: pre-flight "passed (doorbell probe)", then "Doorbell sensor failed to spawn (`unknown command 'doorbell'`)", degrading to heartbeat-only.

## Fix

Replace the `--help` probe with a pure verb-existence check (chosen per Q1=A):

```
generacy cockpit help doorbell >/dev/null 2>&1        # commander: exit 1 for unknown subcommand
```

Verified against a real `generacy` binary on the snappoll cluster: exit **1** when the verb is absent, exit **0** when present. Commander.js auto-wires the `help <verb>` router for every registered command, so this is a clean signal that isn't sensitive to help-text formatting.

An absent verb aborts pre-flight with the intended "Engine doorbell surface not available … upgrade the cluster's generacy build" message. Also update `playbook-verification.test.ts` (pins the probe string) to match.

**Both occurrences of the broken probe must be fixed** — auto.md contains `generacy cockpit doorbell --help` twice: the probe at ~L41 AND a documentation cross-reference at ~L53 ("The verb's positional is named `<epic-ref>` (matching `generacy cockpit doorbell --help`)"). Both must be updated so the negative pin in the test (Q2=B) can assert `cockpit doorbell --help` appears nowhere in the file.

## Impact / severity

Cosmetic/robustness — the loop already degrades gracefully to a 5-min heartbeat via Q3=A/C4, so nothing is stuck. But the failure is confusing (looks like "version drift") and the guard that exists specifically to produce a clear operator message never fires. Low-risk, self-contained skill fix.

## Related

- **generacy#974** — companion issue that implements the missing `generacy cockpit doorbell` verb (in progress; the actual root cause). Note: generacy#970 already merged (as PR #971) and shipped GraphQL rate-limit efficiency work — NOT the doorbell verb. Any auto.md attribution pointing at #970 (error message ~L44, comments at L41/L53) must be corrected to **#974**.
- agency#431 (auto-skill spec that introduced the doorbell dependency).

---
<sub>Filed via Claude Code during a snappoll `/cockpit:auto` test run.</sub>


## User Stories

### US1: Operator sees a clear message when the engine doorbell verb is missing

**As a** cockpit operator running `/cockpit:auto` on a cluster,
**I want** the pre-flight guard to detect a missing `generacy cockpit doorbell` verb and abort with the intended "Engine doorbell surface not available — upgrade the cluster's generacy build (generacy#974)" message,
**So that** I understand the failure is a build-version issue and know exactly what to upgrade, instead of seeing a confusing runtime `unknown command 'doorbell'` after the loop has already advanced.

**Acceptance Criteria**:
- [ ] Running `/cockpit:auto` against a cluster whose `generacy` binary does NOT ship `doorbell` aborts pre-flight with the "Engine doorbell surface not available" message (pointing at generacy#974) and does not spawn the doorbell sensor.
- [ ] Running `/cockpit:auto` against a cluster whose `generacy` binary DOES ship `doorbell` (verified via local shim per Q3=B) passes pre-flight without regression.
- [ ] `playbook-verification.test.ts` fails if `auto.md` is reverted to the broken `generacy cockpit doorbell --help` form (positive + negative pin per Q2=B).

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Replace the `--help`-based probe in `packages/claude-plugin-cockpit/commands/auto.md` (~L41) with `generacy cockpit help doorbell >/dev/null 2>&1` — the pure verb-existence form (Q1=A). | P1 | Both candidate probes were verified on the snappoll cluster. Option A chosen because commander.js auto-wires `help <verb>` for every registered command, and greping rendered help (option B) is brittle to formatting/wrapping and false-positives if "doorbell" ever appears in another command's description. |
| FR-002 | Update the documentation cross-reference at auto.md ~L53 (`... matching \`generacy cockpit doorbell --help\``) to no longer contain the literal `cockpit doorbell --help` string — e.g. change to `generacy cockpit help doorbell` or `generacy cockpit doorbell`. | P1 | Required so the FR-004 negative pin can assert `cockpit doorbell --help` is absent everywhere in auto.md without misfiring on the doc reference. |
| FR-003 | Correct stale generacy#970 attribution in auto.md: the pre-flight error message (~L44, "needs a generacy build that ships `generacy cockpit doorbell` (generacy#970)") and the "engine-owned per generacy#970" comments at L41 and L53 must all point to **generacy#974**. | P1 | generacy#970 already merged (PR #971) and shipped GraphQL rate-limit work, not the doorbell verb. Leaving #970 references would send operators to an already-closed PR that never provided the verb. |
| FR-004 | Update `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` to pin the probe form with BOTH a positive assertion (auto.md pre-flight section contains the exact string `generacy cockpit help doorbell`) AND an explicit negative assertion (the literal string `cockpit doorbell --help` appears nowhere in auto.md). | P1 | Q2=B. Positive-only wouldn't catch partial reverts or half-merges that leave the broken form lingering. Scope negative match to `cockpit doorbell --help` (not the bare `generacy cockpit doorbell` sensor invocation, which is legitimate and already pinned by test 406-3). |
| FR-005 | Confirm the corrected `help doorbell` probe is compatible with the existing 398 drift-audit snapshot test ("playbook invocations match `generacy cockpit <verb> --help` snapshot") — the pre-flight probe must not be treated as a snapshot-checked verb invocation. | P2 | No `doorbell --help` snapshot exists (and won't — that's the whole bug). Verify the 398 test either skips pre-flight probes or is scoped so `help doorbell` doesn't collide. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Pre-flight guard correctly detects an absent doorbell verb | Aborts with the "Engine doorbell surface not available" message; exits 1; does NOT spawn sensor | Run `/cockpit:auto` on snappoll (real binary, verb absent) after the fix; observe abort message and no sensor spawn. |
| SC-002 | No regression on doorbell-present clusters | Pre-flight passes; sensor spawns; loop proceeds normally | Verified via local `generacy` shim on PATH whose `cockpit help doorbell` exits 0 (Q3=B); shim invocation recorded in the PR description. Do NOT block merge on generacy#974 rollout. |
| SC-003 | Test pin catches a probe-form regression | `pnpm test` fails if auto.md is reverted to `generacy cockpit doorbell --help` in either the probe OR the doc cross-reference | Manually revert one occurrence at a time on a scratch branch; verify the test fails in each case. |

## Assumptions

- The `generacy` binary on the target cluster is commander.js-based (confirmed via observed `--help` short-circuit behavior). The `help <verb>` router is auto-wired for every registered command in commander.js, so option A cannot be selectively unwired.
- generacy#974 is out of scope for this fix — it is tracked in the generacy repo and implements the missing verb. This fix only corrects the probe and its attribution; it does not depend on #974 landing.
- The `generacy` binary at test time on snappoll (`0.0.0-preview-20260717045830-01bbb03`) does not ship `doorbell`; the fix's absent-path behavior is verified against this real binary.

## Out of Scope

- Implementing the `generacy cockpit doorbell` verb itself (owned by generacy#974).
- One-time real-build confirmation of the doorbell-present path against a build that ships the verb — deferred to a follow-up rollout check once generacy#974 lands on a preview cluster (not a merge gate for this fix, per Q3=B).
- Broader refactor of pre-flight probe patterns for other engine surfaces.

---

*Generated by speckit*
