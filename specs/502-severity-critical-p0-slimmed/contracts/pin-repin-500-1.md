# Contract: Re-pin `500-1` to the corrected mechanism

**Requirement**: FR-005 · **Clarification**: Q4=A (freeze both mechanism AND exact fail-closed wording) · **Location**: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts:5887–5912`

`500-1` currently freezes the **wrong** contract — the inverted version literal. Per CLAUDE.md § "Cockpit playbook pins", re-pin it to the NEW contract in the same PR; never weaken or delete the assertion.

## What `500-1` asserts today (all now WRONG — must be removed)

- `` `generacy --version` `` probe present.
- `` `MIN_GENERACY_VERSION` = `0.2.0` `` literal present.
- Verbatim below-minimum error `generacy is older than the minimum this /cockpit:auto requires (need >= 0.2.0).`
- Unparseable branch `Could not parse `generacy --version` output`.
- Hard-fail guarantee prose (`Do **NOT** create the ledger directory.` / `Do **NOT** start the loop.`).
- Positioning `It runs AFTER the doorbell-surface probe and BEFORE `command -v generacy``.

## What the re-pinned `500-1` MUST assert

### Negative pins (the removed literal is gone)

- `autoMd` does **NOT** contain `MIN_GENERACY_VERSION`.
- `autoMd` does **NOT** contain the `0.2.0` version literal in the pre-flight skew context.
- `autoMd` does **NOT** contain the below-minimum error string `generacy is older than the minimum this /cockpit:auto requires (need >= 0.2.0).`

### Positive pins — detection mechanism (contracts/capability-detection.md)

- The runtime gate-placement signal is declared: `implementation-review` co-occurrence with `completed:validate` determines the model.
- Post-validate branch: `approve` → `cockpit_merge`.
- Legacy branch: `approve` → `cockpit_advance(issue=<ref>, gate="implementation-review")` (contracts/legacy-advance-path.md).

### Positive pins — fail-closed diagnostic (contracts/fail-closed-diagnostic.md, Q4=A)

- The **exact** fail-closed diagnostic bytes are present (byte-mirroring the sibling Monitor/doorbell pre-flight pins).
- Both flag names appear verbatim in the diagnostic: `reviewPhaseEnabled` **and** `ciMergeGateEnabled`.
- The idiom is present: exit non-zero, halt the loop, no admit-and-strand.

## Re-pin discipline

- Split the removed contract into **negative** pins (old phrasing gone) and the new contract into **positive** pins — the #433 / #500 pattern already used throughout the suite.
- Do **not** loosen the fail-closed assertion to "message present" (FR-005) — freeze exact bytes so the flag-name contract cannot silently rot.
- Update the `describe("500 …")` block header comment (`:5869–5884`) so it documents the corrected mechanism, not the inverted version guard.
- The `readdirSync(COMMANDS_DIR)` invocation-vs-`--help` sweep must stay green — these edits touch dispatch/gate/pre-flight prose, not the invocation contract.

## Verification

`pnpm --filter @generacy-ai/claude-plugin-cockpit test` (or the repo's test runner) with `500-1` green against the edited `auto.md`. SC-004: `500-1` passes and asserts the corrected mechanism.
