# Contract: `packages/claude-plugin-cockpit/lib/gate-vocabulary.ts`

TypeScript module contract. This file is imported only by tests; no runtime code path reads it. It exists to give the drift audit (assertion 396-3) a declared vocabulary to check against.

## Location

`packages/claude-plugin-cockpit/lib/gate-vocabulary.ts`

Sibling to `packages/claude-plugin-cockpit/lib/reference-consumption.ts` (created by #394). The two modules are independent — neither imports the other.

## Named exports

### `GATE_VOCABULARY` (const array)

Type (inferred via `as const`):

```typescript
export const GATE_VOCABULARY: readonly [
  "waiting-for:clarification",
  "waiting-for:spec-review",
  "waiting-for:clarification-review",
  "waiting-for:plan-review",
  "waiting-for:tasks-review",
  "waiting-for:implementation-review",
  "waiting-for:manual-validation",
  "waiting-for:address-pr-feedback",
  "waiting-for:pr-feedback",
  "waiting-for:children-complete",
  "waiting-for:dependencies",
  "waiting-for:merge-conflicts",
];
```

**Ordering rule**: tokens appear in the same order as they appear in `tetrad-development/.github/labels.yml` (the machine-readable upstream source), with `waiting-for:merge-conflicts` appended last (as the token added by this fix). If `labels.yml`'s ordering changes upstream, the operator re-orders `GATE_VOCABULARY` to match on the next sync.

**Length rule**: exactly 12 entries as of #396. The audit asserts `GATE_VOCABULARY.length === 12` at build time to catch accidental additions/removals during sync.

### `GateVocabularyToken` (union type)

```typescript
export type GateVocabularyToken = (typeof GATE_VOCABULARY)[number];
```

Not consumed by any runtime code path; used for type-safety in test fixtures if desired.

## File-header contract

The file's top-of-file comment block MUST:
1. Name the file's purpose (plugin-local declared vocabulary of `waiting-for:*` labels the auto.md playbook must dispatch).
2. Name the two upstream sources by absolute path:
   - `/workspaces/tetrad-development/.github/labels.yml`
   - `/workspaces/tetrad-development/docs/label-protocol.md`
3. State the sync obligation: this file must be re-synced when upstream changes; a mismatch fails the drift audit at build time but does not affect runtime safety (D.10's tightened trigger catches unknown `waiting-for:*` labels regardless of sync state).
4. Point at the drift audit (`tests/playbook-verification.test.ts`, assertion 396-3).
5. Point at the operator-side companion edit (registered `waiting-for:merge-conflicts` in the two upstream sources same-day as #396).

## Contract invariants

- **GV-C.1**: File exists at `packages/claude-plugin-cockpit/lib/gate-vocabulary.ts`.
- **GV-C.2**: File exports a named const `GATE_VOCABULARY` that is a `readonly` tuple of exactly 12 string literals.
- **GV-C.3**: `GATE_VOCABULARY` contains all 12 tokens listed in the § Named exports section, verbatim, in the listed order.
- **GV-C.4**: File exports a named type `GateVocabularyToken` derived from `GATE_VOCABULARY[number]`.
- **GV-C.5**: File-header comment block contains the two upstream-source absolute paths verbatim.
- **GV-C.6**: File-header comment block contains the sync-obligation prose ("re-synced when upstream changes; a mismatch fails the drift audit at build time; runtime safety preserved by auto.md D.10's tightened trigger").

## Sync-obligation runbook

When the operator adds a `waiting-for:*` token to `tetrad-development/.github/labels.yml`:

1. **Add to `GATE_VOCABULARY`**: append the token to the array in `lib/gate-vocabulary.ts` (or re-order to match `labels.yml` if the operator prefers). The `as const` inference will update the tuple type automatically.
2. **Add to `auto.md`**: introduce a new dispatch row — named ledger-only (D.9-shape) if server-side-owned, named escalation gate (D.11-shape) if operator-authorable, or explicitly reject the token if it should not be dispatched (in which case DO NOT add to `GATE_VOCABULARY`).
3. **Update `auto.md` D.10 trigger enumeration**: extend the `D.1–D.9c or D.11` set-membership prose to include the new row's number.
4. **Run the drift audit locally**: `pnpm --filter claude-plugin-cockpit test` — the audit should pass with the new token mapped to the new row.
5. **PR**: link the tetrad-development commit(s) that registered the label upstream.

When the operator removes a `waiting-for:*` token from `tetrad-development/.github/labels.yml`:

1. **Remove from `GATE_VOCABULARY`**: delete the entry from `lib/gate-vocabulary.ts`.
2. **Consider `auto.md` cleanup**: if the token had a named dispatch row, decide whether to remove the row (if truly deprecated) or keep it with a deprecation note (if in-flight epics might still emit the label). If keeping the row, add a comment above the § Dispatch table row noting the deprecation.
3. **Run the drift audit locally**.
4. **PR**.

## What is deliberately NOT in this module

- **No runtime consumer**. This module is not imported by any code path executed during `/cockpit:auto`. The runtime is the playbook prose; this module exists only to give the audit a declared vocabulary.
- **No dispatch-row mapping**. The module lists tokens; it does not tell the auto session what to do with them. The mapping lives in `auto.md`'s § Dispatch table.
- **No enum, no class**. A plain `readonly` string tuple with `as const` inference. No indirection.
- **No default export**. Named exports only; a default export would be lookup-ambiguous when the audit and future callers (if any) reference the module.

## Verification

Static grep (in [../quickstart.md § Static checks](../quickstart.md) § Static checks):
- File exists.
- Exports `GATE_VOCABULARY` as a `readonly` tuple with 12 entries in the listed order.
- Header comment includes the two upstream-source absolute paths.

Behavioral (assertion 396-3 in `tests/playbook-verification.test.ts`):
- Import `GATE_VOCABULARY` from `../lib/gate-vocabulary.js`.
- Read `packages/claude-plugin-cockpit/commands/auto.md` as a raw string.
- Assert `GATE_VOCABULARY.length === 12`.
- Assert every token in `GATE_VOCABULARY` appears as a Trigger in a § Dispatch row — parsed as: either a `### D.<n>[a-z]? — \`<token>\`` heading exists, or the token appears verbatim in the `| # | Event | Action shape |` table cell for a numbered row.
- Assert no token appears in `auto.md`'s D.10 trigger-case-list enumeration `D.1–D.9c or D.11` UNLESS that token is claimed by a numbered row. (i.e., the D.10 enumeration is inclusive of every possible dispatchable row, and every vocabulary token maps to one of those rows.)
