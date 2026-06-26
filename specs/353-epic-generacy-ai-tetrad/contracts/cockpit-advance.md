# Contract: `generacy cockpit advance --gate clarification`

**Consumer**: `/cockpit:clarify` Step 6 (conditional)
**Producer**: G1.2 / #788 (already implemented per epic plan)
**Status**: Reconcile flag name (`--gate clarification` vs. alternatives) against G1.2's shipped surface before Phase 2 validation.

## Invocation

```bash
generacy cockpit advance --gate clarification --issue <n>
```

| Flag | Required | Notes |
|------|----------|-------|
| `--gate clarification` | yes | Names the gate to advance. Reconcile against G1.2 — if the canonical form is `--gate=clarify` or `--clarification`, update both this contract and the verb. |
| `--issue <n>` | yes | Same positive integer used in Step 2. |

## Preconditions Asserted by the Verb

The verb invokes `advance` ONLY when all of the following are true (see `data-model.md` § GateAdvanceSignal):

1. `gh issue comment` in Step 5 exited 0 (the marker comment is live on the issue).
2. Every `OpenQuestion` from this run has an `ApprovalDecision` with verdict ∈ {`approved`, `edited`}.

If either precondition fails, the verb skips this step entirely.

## Expected Behavior

| Condition | Exit code | Verb behavior |
|-----------|-----------|---------------|
| Gate advanced successfully | 0 | Verb reports `clarification gate advanced for issue #<n>` and exits 0. |
| Gate already advanced (idempotent re-run) | 0 (or G1.2's documented no-op exit) | Verb treats as success; same report. |
| Gate cannot advance (upstream condition not met, e.g., label missing) | non-zero | Surface stderr verbatim; exit non-zero. The marker comment remains on the issue — it is not retracted. |
| `generacy` binary missing | non-zero (shell ENOENT) | Surface error; exit non-zero. |

## Idempotency

The verb assumes G1.2's `advance --gate clarification` is idempotent (re-invoking on an already-advanced gate is a no-op success). If G1.2 errors on re-advance, this contract MUST be updated and the verb's Step 6 wrapped in a "check current gate state" preamble.

## Non-Goals

- The verb does NOT add the `completed:clarification` label. That label is added by the developer (per the existing speckit clarify documentation) or by orchestrator tooling — never by this verb.
- The verb does NOT manage `waiting-for:clarification`. Labels are out of scope.
