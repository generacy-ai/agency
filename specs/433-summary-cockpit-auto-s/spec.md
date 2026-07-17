# Feature Specification: Fix `/cockpit:auto` doorbell probe false-positive (commander `--help` short-circuit)

**Branch**: `433-summary-cockpit-auto-s` | **Date**: 2026-07-17 | **Status**: Draft
**Source**: [agency#433](https://github.com/generacy-ai/agency/issues/433)

## Summary

`/cockpit:auto`'s pre-flight guard for the engine doorbell surface can't detect the verb's absence. The current probe (`generacy cockpit doorbell --help >/dev/null 2>&1`) is short-circuited by commander.js, which prints the **parent** command's help and exits `0` when an unknown subcommand is combined with `--help`. The probe therefore false-passes on clusters whose `generacy` build has not shipped the `doorbell` subcommand (generacy#970). The run proceeds past pre-flight and fails at step 2 sensor-spawn time with `unknown command 'doorbell'`, degrading to heartbeat-only recovery instead of the intended clean abort with the "Engine doorbell surface not available … upgrade the cluster's generacy build" operator message.

## Where

- `packages/claude-plugin-cockpit/commands/auto.md` — pre-flight step containing the probe (currently around L41–L47).
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — playbook drift audit; must pin the corrected probe string.

## Root cause

commander.js processes `--help` before validating that the requested subcommand exists. Given an unknown subcommand plus `--help`, it prints the parent (`generacy cockpit`) help and **exits 0**. The `--help` probe therefore cannot distinguish "verb present" from "verb absent"; it always reports "present" whenever the parent command exists.

## Evidence

Reproduced on the snappoll cluster with generacy `0.0.0-preview-20260717045830-01bbb03` (doorbell verb absent):

```
$ generacy cockpit doorbell --help >/dev/null 2>&1;                     echo $?   # 0  ← false positive
$ generacy cockpit doorbell christrudelpw/snappoll#1 >/dev/null 2>&1;   echo $?   # 1  ← real result
$ generacy cockpit help doorbell >/dev/null 2>&1;                       echo $?   # 1  ← correct
$ generacy cockpit --help 2>&1 | grep -qw doorbell;                     echo $?   # 1  ← correct
```

Observed operator symptoms: pre-flight logs "passed (doorbell probe)", then step 2 emits "Doorbell sensor failed to spawn (`unknown command 'doorbell'`)", and the loop degrades to heartbeat-only via the C4/Q3=A path.

## User Stories

### US1: Operator gets a clear engine-drift message instead of a confusing sensor-spawn failure

**As a** cockpit operator running `/cockpit:auto` on a cluster whose `generacy` build predates the `cockpit doorbell` verb,
**I want** pre-flight to detect the missing verb and abort with the intended "Engine doorbell surface not available … upgrade the cluster's generacy build" message,
**So that** I know exactly why the loop refused to start and what to do about it (upgrade generacy, or drive manually with `/cockpit:watch` / `/cockpit:status` / `/cockpit:advance`), instead of interpreting the fallback heartbeat-only degradation as an unrelated bug.

**Acceptance Criteria**:
- [ ] When `generacy cockpit doorbell` is absent, `/cockpit:auto` pre-flight aborts before creating the ledger directory and prints the verbatim "Engine doorbell surface not available …" message defined in auto.md.
- [ ] When `generacy cockpit doorbell` is present, `/cockpit:auto` pre-flight passes the probe and continues to `gh auth status` / ledger creation / step 2 sensor arm-up.
- [ ] The failure mode "pre-flight passes, then step 2 sensor spawn fails with `unknown command 'doorbell'`" is no longer reachable via the doorbell-absence path.

### US2: Playbook drift audit pins the corrected probe

**As a** future maintainer editing `auto.md`,
**I want** `playbook-verification.test.ts` to pin the corrected probe string (not the broken `--help` form),
**So that** an accidental revert to `--help` — or any other invocation that shares commander.js's short-circuit behavior — fails the drift audit rather than silently reintroducing the false positive.

**Acceptance Criteria**:
- [ ] `playbook-verification.test.ts` contains an assertion pinning the corrected probe invocation used in `auto.md` pre-flight.
- [ ] The pinned probe string is one of the verified-correct forms (`generacy cockpit help doorbell …` or `generacy cockpit --help 2>&1 | grep -qw doorbell`) — NOT `generacy cockpit doorbell --help`.
- [ ] Reverting `auto.md` to the `--help` probe form causes the pinned assertion to fail.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Replace the `auto.md` pre-flight probe `generacy cockpit doorbell --help >/dev/null 2>&1` with an invocation that returns exit code `1` when the `doorbell` subcommand is absent and `0` when present. | P1 | Two candidates verified on the snappoll cluster: `generacy cockpit help doorbell >/dev/null 2>&1` and `generacy cockpit --help 2>&1 | grep -qw doorbell`. Pick one and pin it. |
| FR-002 | Preserve the existing pre-flight failure behavior: on non-zero probe exit, print the verbatim "Engine doorbell surface not available …" message and exit non-zero WITHOUT creating the ledger directory or touching any state-changing tool. | P1 | Defined in auto.md around L43–L47; nothing about the operator-facing message changes. |
| FR-003 | Preserve the ordering of pre-flight checks: `Monitor` presence check → doorbell probe → `gh auth status` → cwd is writable git repo → `mkdir -p .generacy/cockpit/auto-runs`. | P1 | Doorbell probe stays in its current pre-flight slot; only the probe invocation changes. |
| FR-004 | Update `playbook-verification.test.ts` to pin the corrected probe string as part of the same PR. If no probe pin currently exists, add one; if a pin exists for the broken form, retarget it to the corrected form (do not weaken or delete the assertion — per CLAUDE.md's playbook-pin rule). | P1 | Pin should be strict enough that reverting to `--help` fails the test. |
| FR-005 | No change to step 2 (`generacy cockpit doorbell <epic-ref>` sensor arm-up), step 3 (startup sweep), step 4 (drain / dispatch), or the Q3=A heartbeat-only recovery path. | P1 | Scope is strictly the pre-flight probe invocation + its test pin. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Probe correctly detects doorbell verb absence. | 100% of runs on clusters where `generacy cockpit doorbell` is absent abort at pre-flight with the intended operator message. | Manual repro on a cluster with a pre-doorbell `generacy` build (e.g. `0.0.0-preview-20260717045830-01bbb03`): invoke `/cockpit:auto` and confirm pre-flight exits with the "Engine doorbell surface not available …" message before ledger creation. |
| SC-002 | Probe does not regress on clusters where doorbell verb is present. | 100% of runs on clusters with a doorbell-shipping `generacy` build pass the probe and proceed to step 2. | Manual repro on a doorbell-present cluster: invoke `/cockpit:auto` and confirm pre-flight continues past the probe and reaches sensor arm-up. |
| SC-003 | Drift audit rejects the broken probe. | `pnpm test` in `packages/claude-plugin-cockpit` fails if `auto.md` is reverted to the `--help` probe form. | Locally revert `auto.md`'s probe to `--help` on a scratch branch and confirm `playbook-verification.test.ts` reports a failure pinned to the probe string. |
| SC-004 | No new false negatives on the "sensor spawn failure" path. | The Q3=A / C4 heartbeat-only degradation still triggers on genuine transient sensor spawn failures (post-pre-flight), unchanged from #431 behavior. | Static review of auto.md diff: only the probe line and its test pin change; step 2's spawn-failure branch is untouched. |

## Assumptions

- The two candidate probes (`generacy cockpit help doorbell`, `generacy cockpit --help 2>&1 | grep -qw doorbell`) continue to behave as verified on both doorbell-present and doorbell-absent generacy builds. If commander.js semantics change in a future generacy release, this spec's probe choice may need revisiting.
- The engine-side companion (generacy#970 — implement the actual `generacy cockpit doorbell` verb) is out of scope here; this fix improves the operator experience while the verb is still absent AND remains correct once the verb ships.
- The Q3=A "skill stays passive on doorbell-transport death" contract from #431 is unchanged; this fix simply ensures pre-flight fails cleanly instead of letting an unfixable run reach step 2.
- The playbook-pin rule in CLAUDE.md (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — "the correct response is to re-pin the assertion to the NEW contract") applies: the test pin is updated in the same PR as the auto.md edit, and neither the pin nor its neighbors are weakened.

## Out of Scope

- Shipping the `generacy cockpit doorbell` verb itself (owned by the generacy companion issue for generacy#970).
- Any change to the step 2 sensor arm-up, step 3 startup sweep, step 4 drain/dispatch, cursor semantics, or Q3=A heartbeat recovery path.
- Changing the operator-facing "Engine doorbell surface not available …" message content — only the probe that decides whether to print it changes.
- Introducing a fallback path (e.g., spawning `generacy cockpit watch` when doorbell is absent) — auto.md explicitly forbids this as it would mask engine-agency version drift.
- Broader auditing of other `--help`-based probes elsewhere in the plugin (this spec fixes the one probe in auto.md; a systematic audit is a follow-up if warranted).

---

*Generated by speckit*
