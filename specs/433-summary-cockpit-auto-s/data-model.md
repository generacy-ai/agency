# Data Model: `/cockpit:auto` pre-flight doorbell probe fix

**Feature**: agency#433
**Branch**: `433-summary-cockpit-auto-s`
**Date**: 2026-07-17
**Status**: Complete

## Overview

This is a prose-and-test fix — no persistent state, no schema, no wire protocol. The "data" this feature manipulates is:

1. The literal string of the pre-flight probe in `auto.md`.
2. The literal string of the sensor documentation cross-reference in `auto.md`.
3. Three cross-repo issue attribution labels in `auto.md`.
4. Two `expect(...)` assertions in `playbook-verification.test.ts`.

Because there is no runtime state, this document catalogs the string-level entities the fix reshapes and the exit-code contract the corrected probe relies on.

## E1 — Pre-flight probe (auto.md ~L41)

**Location**: `packages/claude-plugin-cockpit/commands/auto.md`, inside the pre-flight step immediately after the `Monitor` presence check and before the ledger-directory creation.

| Attribute | Before (broken) | After (fixed) |
|---|---|---|
| Probe command | `generacy cockpit doorbell --help >/dev/null 2>&1` | `generacy cockpit help doorbell >/dev/null 2>&1` |
| Exit 0 semantics | *False positive on absent verb* (commander short-circuits `--help` to parent help) | Verb is registered — proceed with sensor spawn in step 2 |
| Exit non-zero semantics | Verb is absent — print error message and exit non-zero | Verb is absent — print error message and exit non-zero |
| Attribution | `generacy#970` | `generacy#974` |

**Invariants preserved**:

- The probe stays in step 1 pre-flight, before ledger directory creation.
- On probe failure, the skill prints the verbatim error message and exits non-zero. **No fallback** to spawning `generacy cockpit watch` (would mask engine-agency version drift, re-introduce double-poll condition #431 removed).
- The `Monitor` presence check still runs *before* the doorbell probe. The doorbell probe still runs *before* `gh auth status`, cwd-writability check, and ledger-directory creation.

## E2 — Error message (auto.md ~L44)

**Location**: The verbatim error message body inside the pre-flight step, printed when the probe exits non-zero.

| Attribute | Before | After |
|---|---|---|
| Body | `Engine doorbell surface not available. /cockpit:auto needs a generacy build that ships \`generacy cockpit doorbell\` (generacy#970). Upgrade the cluster's generacy build, or drive the epic manually with /cockpit:watch, /cockpit:status, and /cockpit:advance.` | `Engine doorbell surface not available. /cockpit:auto needs a generacy build that ships \`generacy cockpit doorbell\` (generacy#974). Upgrade the cluster's generacy build, or drive the epic manually with /cockpit:watch, /cockpit:status, and /cockpit:advance.` |
| Attribution | `generacy#970` | `generacy#974` |

**Invariants preserved**: message wording unchanged except for the issue reference. Operator-facing guidance to drive the epic manually via `/cockpit:watch`, `/cockpit:status`, `/cockpit:advance` is unchanged.

## E3 — Sensor documentation cross-reference (auto.md ~L53)

**Location**: Inside step 2 (sensor arm-up), documenting the `<epic-ref>` positional name.

| Attribute | Before | After (either acceptable) |
|---|---|---|
| Doc cross-reference | `matching \`generacy cockpit doorbell --help\`` | `matching \`generacy cockpit help doorbell\`` OR `matching \`generacy cockpit doorbell\`` |
| Attribution ("engine-owned per") | `generacy#970` | `generacy#974` |

**Why the change matters**: The negative pin (FR-004) asserts the literal string `cockpit doorbell --help` appears nowhere in auto.md. Leaving L53 as-is would make the negative pin fail even on a correct probe fix.

**Chosen replacement**: `generacy cockpit help doorbell` (mirrors the corrected probe form, keeps the "how to inspect the verb's help" pointer intact for future readers).

## E4 — Playbook-verification test (new pin)

**Location**: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`, appended after the existing 431 `describe(...)` block (or wherever the sibling drift-audit tests conclude).

**Shape** (reference — the actual test edit is part of the tasks phase, not this data model):

```typescript
describe("433 — auto.md doorbell probe uses pure verb-existence form, not the commander --help short-circuit", () => {
  it("433-1 (positive pin): auto.md pre-flight contains the exact verb-existence probe string", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    expect(
      autoMd,
      "auto.md pre-flight must probe with `generacy cockpit help doorbell` (pure verb-existence via commander's help-verb router), not `generacy cockpit doorbell --help` (false-positive: commander short-circuits --help to parent help)",
    ).toContain("generacy cockpit help doorbell");
  });

  it("433-2 (negative pin): the broken commander --help short-circuit form appears nowhere in auto.md", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    expect(
      autoMd,
      "the string `cockpit doorbell --help` must not appear anywhere in auto.md — commander.js short-circuits --help to parent help before validating the subcommand, so this form false-passes on absent verbs. Corrected form: `cockpit help doorbell`. See agency#433.",
    ).not.toContain("cockpit doorbell --help");
  });
});
```

**Pin properties**:

- **Positive**: asserts the corrected probe string is present. Fails on a full revert.
- **Negative**: asserts the broken string is absent. Fails on a partial revert (either L41 or L53 restored to the broken form).
- **Scope**: negative is scoped to `cockpit doorbell --help` (with `--help`), NOT the bare `cockpit doorbell` sensor invocation which is legitimate and already pinned by 406-3.

## E5 — Exit-code contract (external, upstream — commander.js)

The corrected probe relies on the following commander.js behavior. This is the load-bearing external contract:

| Invocation | commander behavior | Exit code |
|---|---|---|
| `generacy cockpit help doorbell` — verb registered | Prints `doorbell`'s help text | **0** |
| `generacy cockpit help doorbell` — verb NOT registered | Prints "unknown command" or usage; exits with error | **1** |
| `generacy cockpit doorbell --help` — verb registered | Prints `doorbell`'s help text | 0 |
| `generacy cockpit doorbell --help` — verb NOT registered | Prints *parent's* help (short-circuit) | **0** ← the bug |
| `generacy cockpit doorbell <arg>` — verb NOT registered | Prints "unknown command 'doorbell'" | 1 |

**Why this contract is stable**: commander.js's `help <verb>` router is auto-wired for every registered subcommand — it cannot be selectively unwired without patching commander. The exit-code semantics are covered by commander's test suite and have been consistent across major versions.

**Verified evidence**: snappoll cluster, `generacy 0.0.0-preview-20260717045830-01bbb03` (doorbell absent) — `help doorbell` exits 1, `doorbell --help` exits 0, `doorbell <ref>` exits 1.

## Relationships

```
auto.md::pre-flight-probe (E1) ──uses──▶ commander.js help-verb router (E5)
auto.md::error-message (E2) ──points-to──▶ generacy#974 (was generacy#970 — misattributed)
auto.md::sensor-doc-ref (E3) ──references──▶ auto.md::pre-flight-probe (E1)
playbook-verification.test.ts::433-1 (E4 positive) ──pins──▶ auto.md::pre-flight-probe (E1)
playbook-verification.test.ts::433-2 (E4 negative) ──pins-absent──▶ old (E1) form, both L41 + L53 occurrences
```

## Validation rules

None at runtime — this fix has no runtime data. Validation happens at test time:

- `playbook-verification.test.ts::433-1` — auto.md contains `generacy cockpit help doorbell`.
- `playbook-verification.test.ts::433-2` — auto.md does NOT contain `cockpit doorbell --help`.
- Existing 398-1 drift audit — auto.md invocations still match their `--help` snapshot (no regression, since the probe touches only the `help` verb, which is out of the snapshot set).
- Existing 406-3 pin — auto.md step 2 spawns `generacy cockpit doorbell` (the bare sensor invocation is preserved; the negative pin is scoped to `cockpit doorbell --help` only).
- Existing 431 tests — the pre-flight-guard-exists assertions (from the ticket that introduced the probe) continue to pass with the corrected probe string.

---

*Generated by speckit*
