# Contract: `formatGateQueryProbeErrorLine` reference formatter

Load-bearing prose for the new operator-facing failure-line formatter, plus its pinning shape mirroring the existing `formatPreDraftCheckErrorLine` (test 457-9a).

The formatter's SOURCE OF TRUTH is the auto.md prose (test 459-7); the `lib/gate-status-check.ts` implementation is a reference implementation pinned by fixture-equality tests (test 459-7a) so a future edit that changes one but not the other is caught by the CI suite.

## Scope

The `formatGateQueryProbeErrorLine` function produces the single operator-facing line printed on any probe failure. It is called from exactly one call site in the plugin (the pre-flight probe fail path, per [`gate-query-probe.md`](./gate-query-probe.md) § Fail path).

Under Q5's answer (research.md § R6), the failure-line wording is a SINGLE FROZEN TEMPLATE with `<class>` / `<detail>` placeholders. All four error classes (`query-unreachable`, `invalid-args`, `internal`, `transport`) share this one template; any change to the wording requires re-pinning both the auto.md prose (test 459-7) and the formatter's equality fixtures (test 459-7a).

## Signature

Added to `packages/claude-plugin-cockpit/lib/gate-status-check.ts`:

```typescript
/**
 * The visible operator-facing line the pre-flight gate-query probe prints on
 * ANY error (pinned literally by auto.md § step 1 --gates resolution → probe
 * fail path). Printed AFTER the fail ledger row and BEFORE the mode-specific
 * tail action (exit non-zero under explicit --gates=ui; resolve to local under
 * --gates=auto).
 *
 * Deliberately does NOT take issueRef — the probe is against a single identity
 * ref already named in the ledger header's Tracking ref: field, and the
 * operator's next action (--gates=local, or fix the cluster/cloud deployment)
 * does not depend on which ref was probed. This mirrors the --gates=ui absence
 * string (test 449-4), which also carries no identity ref.
 */
export function formatGateQueryProbeErrorLine(error: GateQueryError): string {
  return `gate-query surface unavailable (class: ${error.class}): ${error.message} — re-run with --gates=local, or fix the cluster/cloud gate-query deployment`;
}
```

**Design choices**:

- **No `issueRef` argument.** The pre-flight probe runs against a single identity ref that is already visible in the `Tracking ref:` header of the ledger; naming it again in the failure line adds noise without diagnostic value. Contrast with `formatPreDraftCheckErrorLine`, which DOES take `issueRef` because the per-event pre-draft check fires per-event and needs to name WHICH event's dispatch was aborted.
- **Em-dash pinned.** The `—` (U+2014) between `<detail>` and `re-run with…` is intentional. Matches the em-dash convention used in `formatPreDraftCheckErrorLine` and in the generation-drift ack detail-string.
- **No trailing period.** Matches the terminal-line convention of the two existing pinned strings (`--gates=ui` absence string at 449-4; pre-draft-check line at 457-9a).
- **Single template, four classes.** Per Q5 answer: the class token is interpolated into the same template for every class; the workaround (`--gates=local`, or fix the deployment) is shared across all four classes.

## Fixture-verified equality assertions

Test 459-7a — one equality per class:

```typescript
describe("459 pre-flight functional probe", () => {
  describe("formatGateQueryProbeErrorLine", () => {
    it("formats query-unreachable class verbatim", () => {
      expect(formatGateQueryProbeErrorLine({
        class: "query-unreachable",
        message: "gate-query-service: connect ETIMEDOUT",
      })).toBe(
        "gate-query surface unavailable (class: query-unreachable): gate-query-service: connect ETIMEDOUT — re-run with --gates=local, or fix the cluster/cloud gate-query deployment"
      );
    });

    it("formats invalid-args class verbatim", () => {
      expect(formatGateQueryProbeErrorLine({
        class: "invalid-args",
        message: "unrecognized key issueId (expected: issueRef)",
      })).toBe(
        "gate-query surface unavailable (class: invalid-args): unrecognized key issueId (expected: issueRef) — re-run with --gates=local, or fix the cluster/cloud gate-query deployment"
      );
    });

    it("formats internal class verbatim (the incident class)", () => {
      expect(formatGateQueryProbeErrorLine({
        class: "internal",
        message: "cluster query endpoint returned 404",
      })).toBe(
        "gate-query surface unavailable (class: internal): cluster query endpoint returned 404 — re-run with --gates=local, or fix the cluster/cloud gate-query deployment"
      );
    });

    it("formats transport class verbatim", () => {
      expect(formatGateQueryProbeErrorLine({
        class: "transport",
        message: "cockpit process exited with code 1 before responding",
      })).toBe(
        "gate-query surface unavailable (class: transport): cockpit process exited with code 1 before responding — re-run with --gates=local, or fix the cluster/cloud gate-query deployment"
      );
    });
  });
});
```

**Motivating class**: the `internal` fixture uses the exact detail-string shape of the motivating 404 (cluster `snappoll-local-2`, 2026-07-25 — cloud endpoint returned 404 → cluster mapped to `class: 'internal'`). A future operator hitting this class will see the fixture-verified line and can grep the fixture to confirm the format.

## Auto.md prose pin

The prose pin (test 459-7) requires `auto.md` to contain the failure line template VERBATIM. Recommended placement: inside the `--gates=auto` three-part-check block (item 3's fail sub-branch) AND inside the explicit `--gates=ui` probe step (fail sub-branch), so the operator reading either mode's documentation sees the exact string.

Prose fragment:

```markdown
On any probe error, print the operator-facing line — a single frozen template with `<class>` / `<detail>` placeholders, produced by `lib/gate-status-check.ts § formatGateQueryProbeErrorLine`:

```
gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local, or fix the cluster/cloud gate-query deployment
```

Where `<class>` is one of `query-unreachable` / `invalid-args` / `internal` / `transport` (per the § Gate-query error taxonomy) and `<detail>` is the tool's `detail` field verbatim. All four classes share this ONE template; any change to the wording requires re-pinning the playbook prose AND the formatter's fixture-equality tests.
```

## Why the pinning is doubled (prose + fixture)

Per Q5 rationale + research.md § R6:

- **Both existing operator-visible strings on the `--gates=ui` path are already doubly pinned:**
  - `--gates=ui` absence string — pinned in auto.md prose (test 449-4).
  - Pre-draft-check line — pinned in auto.md prose AND against `formatPreDraftCheckErrorLine` (test 457-9a).

- Pinning the probe line ONLY in one place (prose OR fixture) would make it the ONE operator-visible string on this path free to drift between the two — precisely the drift mechanism CLAUDE.md § "Cockpit playbook pins" exists to prevent.

- Double-pinning costs: one small function in `lib/` plus four fixture-equality assertions. Benefit: any future author who edits the prose without touching the formatter (or vice versa) gets a CI failure naming BOTH the prose and the formatter.

## Alternatives rejected

- **Per-class formatter templates** (Q5 option C) — quadruples the frozen surface (four separate templates, four separate fixtures, four separate prose pins) for no diagnostic gain. All four classes share the same workaround; the class name is already interpolated.
- **Shape-only pinning** (Q5 option B) — leaves the wording free to drift; makes the probe line the ONE operator-visible drift-eligible string on this path.
- **Prose-only pinning (no formatter)** — the prose lives in the playbook (a markdown file). The line is produced by a model interpreting the prose; without a fixture-verified reference implementation, there is no automated check that the model produces the exact wording. The existing `formatPreDraftCheckErrorLine` fixture is what makes 457-9a's equality-check meaningful; the probe formatter provides the same guarantee for 459-7a.
- **Formatter-only pinning (no prose)** — the formatter lives in `lib/`, but the playbook is the source of truth. Pinning only the formatter would allow a future edit to change the auto.md prose while leaving the fixture-verified formatter unchanged, producing a drift that no test catches.

## Interaction with `GateQueryError` type

The formatter takes a `GateQueryError` (imported from the same file):

```typescript
interface GateQueryError {
  class: "query-unreachable" | "invalid-args" | "internal" | "transport";
  message: string;
}
```

This is the exact type used by `classifyGateQueryError`, `formatPreDraftCheckErrorLine`, and the per-event pre-draft-check taxonomy. No new type, no discriminated union alias, no new enum member. The four classes cover the entire reachable error surface for `cockpit_gate_list` / `cockpit_gate_status`; unknown classes surface via the `default:` branch of `classifyGateQueryError`, which routes to the loud "gate-query bug" bucket — and if such an unknown class is passed to `formatGateQueryProbeErrorLine`, the class name is interpolated verbatim ("gate-query surface unavailable (class: <unknown>): …") so the operator sees the tool's actual class value in the transcript.

## Interaction with `formatPreDraftCheckErrorLine`

The two formatters are siblings but NOT overlapping — they format different lines for different call sites:

| | `formatPreDraftCheckErrorLine` | `formatGateQueryProbeErrorLine` |
|---|---|---|
| Call site | § Dispatch D.n step 0 (per-event) | § step 1 pre-flight probe (per-run) |
| Signature | `(issueRef: string, error: GateQueryError) => string` | `(error: GateQueryError) => string` |
| Purpose | Name WHICH event's dispatch was aborted | Name that the SURFACE is broken |
| Output | `pre-draft gate check failed for <issue-ref> (<class>): <detail> — not drafting; see the run ledger` | `gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local, or fix the cluster/cloud gate-query deployment` |
| Pinned by | 457-9a | 459-7a |

The pre-draft-check formatter names an issue and refers the operator to the ledger; the probe formatter names the surface and gives the operator a concrete next action (`--gates=local` or fix the deployment). Different call sites, different diagnostic needs, different lines.

Both use the same `GateQueryError` shape, so a future change to `GateQueryErrorClass` (e.g., adding a class in the tool layer) surfaces cleanly in both formatters without either needing to update.
