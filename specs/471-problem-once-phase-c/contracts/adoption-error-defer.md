# Contract: § step 3 § Adoption pass — per-issue `cockpit_gate_list` error defer (FR-014)

**Feature**: [../spec.md](../spec.md)
**Plan**: [../plan.md](../plan.md)
**Data model**: [../data-model.md](../data-model.md)
**Related**: [`adoption-sweep.md`](./adoption-sweep.md) (parent contract)

This contract pins the error-handling branch of the § step 3 § Adoption pass — what happens when `cockpit_gate_list` for one in-scope issue returns `{status: 'error', class: <any>, detail: <any>}` after the tool's internal `QUERY_RETRY_SCHEDULE` has exhausted (3 attempts, ~5s backoff, ~20s worst case).

## Scope

Applies when the adoption-path `cockpit_gate_list({ issueRef: <ref>, gateType: <omitted> })` call for a SPECIFIC in-scope issue returns `{status: 'error', ...}`.

Does NOT apply to:

- `cockpit_status` failures (handled by the § step 3 tool-presence check / existing sweep error path).
- `cockpit_gate_open` failures during the subsequent § Synthetic-event dispatch pass — those are handled by the existing § step 3 § Deferred-to-loop behavior on sweep-time `cockpit_gate_open` failure paragraph (FR-014 mirrors its shape but is a distinct trigger).
- The pre-flight capability probe's `cockpit_gate_list` call (per #469 § Pre-flight probe (UI mode)) — that call has its own four-branch classification and precedes the adoption pass.

## Action (per FR-014 / SC-013 / V7 / US5)

On `{status: 'error', class, detail}` for issue X:

1. **Skip both adoption AND drafting for issue X in this pass.**
   - Do NOT add ANY `openGates` entry for any row that may have been intended for X.
   - Do NOT issue ANY `cockpit_gate_open` for any natural gate on X during the subsequent § Synthetic-event dispatch pass. The synthetic-event pass MUST have a "skip issues whose adoption deferred" filter that reads from a per-run in-memory set the adoption pass writes to (e.g. `adoptionDeferredIssues: Set<IssueRef>`).
   - This is the exclusive-or property pinned in V7. A partial defer that skips adoption but still drafts would produce the exact duplicate-inbox symptom this repair exists to remove (the very reason Q5 rejected option B).

2. **Write one ledger row.** Shape per [data-model.md § `AdoptionLedgerRow`](../data-model.md):

   ```
   startup · adoption-list-error · <issueRef> · <errorClass> · deferred-to-next-wake
   ```

   - `<issueRef>` is the qualified `owner/repo#N` form.
   - `<errorClass>` is the `class` string from the error envelope verbatim (one of `query-unreachable`, `invalid-args`, `internal`, `transport`, or an unrecognized class token).
   - The trailing `deferred-to-next-wake` sentinel makes the row grep-distinguishable from other adoption-related rows (there are none in the success path, but future ledger extensions might add some).
   - The row is appended to the run's `.ledger` file at the same append point every other startup-sweep ledger row uses (per `auto.md § Ledger`).

3. **Continue with the next in-scope issue.** DO NOT abort the run. DO NOT re-order the remaining issues. DO NOT skip other issues.

4. **Do not re-attempt in this same pass.** The tool's internal `QUERY_RETRY_SCHEDULE` (3 attempts, ~5s backoff) has already run; by the time the playbook sees `status: 'error'`, the transient case has been absorbed. Adding a playbook-level retry on top would add ~35s of blocking per failing issue without buying anything (per research.md § R5).

5. **The label is persistent — the event re-fires on the next natural wake.** The underlying label(s) that would trigger the drafted gate on issue X (e.g. `waiting-for:clarification`, `agent:error`, `phase-complete`) remain persistent. On the next `cockpit_await_events` drain (Monitor line or heartbeat fire), issue X's transition will yield a synthetic-event-like batch entry; the main-loop dispatch retries via the existing D.n Step 0 flow (which is a `cockpit_gate_status` call, not `cockpit_gate_list`, but by then either the transient blip is over and X's normal Step 0 does its job or the operator sees the second attempt fail loudly through the ordinary main-loop failure paths). This is the SAME "label persistence guarantees natural re-fire" mechanism `auto.md § step 3 § Deferred-to-loop behavior on sweep-time cockpit_gate_open failure` already relies on for a symmetric failure mode.

## Ordering invariant

The `adoptionDeferredIssues` set MUST be written by the adoption pass BEFORE the § Synthetic-event dispatch block reads from it. Adoption is one block; synthetic dispatch is the next block; the set is populated in the first and consumed in the second. No mutation to the set after the synthetic dispatch block begins.

## What does NOT happen on defer

- **No operator prompt.** A prompt whose every option means "abort" is not a decision (established pattern for environmental failures per `auto.md § step 3 tool-presence check`).
- **No abort of the run.** The blast radius under FR-001's N+1 semantics is one issue per failure; aborting on any one takes down N-1 healthy issues (rejected as Q5 option A).
- **No downgrade to `local` mode.** `ResolvedGateMode` is decided at pre-flight (per #469 § step-1 `--gates` resolution) and MUST NOT flip mid-run.
- **No fresh `cockpit_gate_open` for any natural gate on the failing issue.** V7 exclusive-or. Drafting without having successfully attempted adoption is exactly the soft-fail-then-draft branch Q5 rejected as option B.

## What DOES happen on defer

- **One ledger row per failing issue.** Grep recipe: `grep '· adoption-list-error ·' *.ledger` returns every defer across every run.
- **The run continues.** Other in-scope issues' adoption + drafting completes normally.
- **The next natural wake retries the issue.** No manual re-invocation required.

## Pattern reference

`auto.md § step 3 § Deferred-to-loop behavior on sweep-time cockpit_gate_open failure`:

> the specific gate's initiation is DEFERRED to the main loop's first natural wake … The record is NOT opened, but the underlying event WILL re-fire naturally because the label is persistent.

FR-014 uses the identical shape for `cockpit_gate_list` failure. Two identical shapes, one for each of the two sweep-time cloud calls; symmetry is the point.

## Test assertions

- **471-8**: § Adoption pass declares the FR-014 defer-not-draft rule verbatim, including the ledger row shape, the "continue with other issues" rule, and the "do not abort" rule.
- **SC-013**: integration test injects a `cockpit_gate_list` error for one child in a multi-child epic; asserts (a) zero `cockpit_gate_open` fires for that issue this pass, (b) one ledger row appended naming that issue and the error class, (c) adoption+drafting completes normally for every other in-scope issue, (d) the run does not abort.
- **US5**: acceptance criteria in the spec map 1:1 onto (a)–(d) of SC-013.

## Interaction with the pre-flight capability probe (per #469)

The pre-flight probe fires ONE `cockpit_gate_list` call against the identity ref (with `runId`, safe because Phase B's handler drops it locally). That call has its own four-class error classification (#469 § Pre-flight probe (UI mode)) and precedes the adoption pass in the run's timeline. If the probe fails, the adoption pass never runs (the run has either hard-failed or downgraded to `local` before reaching § step 3). If the probe passes, the adoption pass runs and this contract applies to any subsequent per-issue `cockpit_gate_list` error.

The two failure modes are independent:

| Failure site | Guard | Failure branch |
|--------------|-------|----------------|
| Pre-flight probe (#469) | Runs at pre-flight, before ledger header on most forms | Four-class taxonomy → hard-fail-ui / downgrade-to-local / graceful-degrade / hard-fail-tentative-ui |
| Per-issue adoption `cockpit_gate_list` | Runs at § step 3 startup sweep, after probe passed | This contract → per-issue defer |

A cluster-wide transient blip that fails both would produce a probe-fail first (hard-fail or downgrade) and the adoption pass would never run. A cluster-wide transient blip that fails only the adoption pass (probe passed a moment earlier; blip happened between then and § step 3) would produce N+1 defer rows and a next-wake retry, no abort.
