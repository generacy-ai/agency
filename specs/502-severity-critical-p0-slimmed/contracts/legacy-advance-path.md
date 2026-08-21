# Contract: Restored legacy advance-on-approve path

**Requirement**: FR-002 · **Clarification**: Q2=C (both — legacy path + fail-closed net) · **Location**: `auto.md § D.3` (`:772`) and `auto.md § Gate contract G.8` (`:1495–1500`)

Restore the `cockpit_advance(gate="implementation-review")` branch that agency#500 removed entirely, so pre-relocation / flag-off engines complete end-to-end under `auto` instead of stranding.

## The strand this fixes

On a flag-off engine (`reviewPhaseEnabled = false`, `ciMergeGateEnabled = false` — the default, `generacy worker/config.ts:143,151`):

1. `waiting-for:implementation-review` fires **pre-validate** (no `completed:validate`).
2. Post-#500, `auto`'s `approve` routes **only** to `cockpit_merge`.
3. `cockpit merge` refuses without `completed:validate` (`merge.ts:36,227-241`).
4. **No path ever applies `completed:implementation-review`** → the issue strands.

## The restored branch

When detection (contracts/capability-detection.md) resolves the **legacy** model, `approve` routes to:

```text
cockpit_advance(issue=<issue-ref>, gate="implementation-review")
```

- Applies `completed:implementation-review` server-side and hands control back to the engine's own validate→merge gate cadence.
- Uses the **same verb and pattern** as the two existing engine-gate advances in the playbook:
  - D.4 `manually validated` → `cockpit_advance(issue, gate="manual-validation")` (`auto.md:808`)
  - D.13 `resume remediation` → `cockpit_advance(issue, gate="remediation-limit")` (`auto.md:1053,1517`)
- `cockpit_resume` is the **WRONG** verb (process/paused-issue resume, not a labeled-gate answer) — matches the explicit warning at `auto.md:1053,1517`.

## Behavior table

| Verdict | post-validate model | legacy model |
|---------|---------------------|--------------|
| `approve` | `cockpit_merge(issue=<ref>)` | `cockpit_advance(issue=<ref>, gate="implementation-review")` |
| `hold` | no-op (label stays; gate re-fires) | no-op |
| `reject` | no-op (label stays; gate re-fires) | no-op |

## Ledger

The legacy `approve` outcome is `advanced (implementation-review)`, added to the D.3 outcome enum (`auto.md:775`) alongside the existing `merged (PR #<n>)` / `held` / `rejected` / `blocked` / `error`.

## Invariants preserved

- **§1 never merge on red**: the legacy path does not merge — it advances a labeled gate; the engine still owns the green/red validate and the merge.
- **§3 add-only advance**: `cockpit_advance(gate="implementation-review")` is add-only; `hold`/`reject` write no labels.
- **§6 every gate prompts**: G.8 still prompts `approve`/`hold`/`reject`; only `approve`'s action is model-dependent.

## Pin (see contracts/pin-repin-500-1.md)

Positive: the legacy branch's verb `cockpit_advance(issue=<ref>, gate="implementation-review")` is present in D.3 / G.8, and the D.3 outcome vocab includes `advanced (implementation-review)`.
