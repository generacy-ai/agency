# Quickstart: Fixed engine-compatibility gating in `/cockpit:auto`

This feature is a **playbook-prose + pin-test edit** — there is no package to install and no new command. It changes how `/cockpit:auto` decides which merge/advance path to take when `waiting-for:implementation-review` fires.

## What changed for operators

Before this fix, `/cockpit:auto` gated on `generacy --version >= 0.2.0`. That literal was inverted: it **admitted** legacy npm engines (`0.2.0`–`0.10.2`, all pre-#1120) that then silently stranded, and **rejected** the preview/source builds (`0.0.0-preview-*`, `0.1.1`) that actually ship #1120.

After this fix, `/cockpit:auto`:

- **no longer blocks on version** — the version probe is advisory only;
- **detects the engine's gate model at runtime** by observing whether `waiting-for:implementation-review` co-occurs with `completed:validate`;
- **routes `approve` correctly** for both post-#1120 and legacy/flag-off engines;
- **fails closed with an actionable message** (naming the required engine flags) only when neither model is detectable — never silently strands.

Nothing about how you invoke `/cockpit:auto` changes.

## The three engine scenarios

| Scenario | Engine | Labels at `implementation-review` | `approve` does | Outcome |
|----------|--------|-----------------------------------|----------------|---------|
| **Post-#1120 build** | preview `0.0.0-preview-*` / source `0.1.1`, or any engine with the flags on | `waiting-for:implementation-review` **+ `completed:validate`** | `cockpit_merge` | merged on green |
| **Legacy / flag-off** (common default) | npm `0.10.2`, or `reviewPhaseEnabled`/`ciMergeGateEnabled` off | `waiting-for:implementation-review` (no `completed:validate`) | `cockpit_advance(gate="implementation-review")` | engine proceeds to validate→merge |
| **Undetectable** | engine rejects the legacy advance too | ambiguous | fail-closed diagnostic | run exits non-zero; drive manually |

## Fail-closed message (when it appears)

If `/cockpit:auto` cannot determine the gate model, it prints a message that names `reviewPhaseEnabled` and `ciMergeGateEnabled`, then exits without stranding. The remedy it points to:

- enable `reviewPhaseEnabled` / `ciMergeGateEnabled` on the cluster's generacy build, **or**
- upgrade to a build that ships generacy#1120, **or**
- drive the epic manually with `/cockpit:watch`, `/cockpit:status`, and `/cockpit:advance`.

## Verifying the change

1. Inspect the edited playbook:
   ```bash
   sed -n '/waiting-for:implementation-review/,/Ledger line/p' \
     packages/claude-plugin-cockpit/commands/auto.md
   ```
   Confirm the D.3 `approve` verdict branches on `completed:validate` co-occurrence and includes both `cockpit_merge` and `cockpit_advance(gate="implementation-review")`.

2. Confirm the version literal is gone:
   ```bash
   grep -n "MIN_GENERACY_VERSION" packages/claude-plugin-cockpit/commands/auto.md   # expect: no matches
   ```

3. Run the pin suite (re-pinned `500-1`):
   ```bash
   pnpm --filter @generacy-ai/claude-plugin-cockpit test playbook-verification
   ```
   `500-1` must be green and assert the runtime detection mechanism + the exact fail-closed wording (with both flag names).

## Troubleshooting

- **A legacy engine still strands** → confirm the D.3 legacy branch actually calls `cockpit_advance(issue=<ref>, gate="implementation-review")` (not `cockpit_resume`, and not `cockpit_merge`).
- **A preview build is rejected at pre-flight** → confirm the `MIN_GENERACY_VERSION` gate was fully removed; the version probe must never exit non-zero.
- **`500-1` fails** → it is a re-pin, not a smoke test. Re-pin it to the new contract (contracts/pin-repin-500-1.md); do not weaken the assertion (CLAUDE.md § "Cockpit playbook pins").
