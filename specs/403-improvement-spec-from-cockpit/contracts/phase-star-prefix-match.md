# Contract: D.9d — `phase:*` prefix-match ledger-only row

**Applies to**: `packages/claude-plugin-cockpit/commands/auto.md` § Dispatch table row + new D.9d subheading; `tests/playbook-verification.test.ts` assertions 403-2, 403-3.

## Contract statement

**Any transition class whose token begins with the literal `phase:` prefix matches D.9d and dispatches ledger-line-only.**

Concretely:

- `phase:specify` → D.9d.
- `phase:clarify` → D.9d.
- `phase:plan` → D.9d.
- `phase:tasks` → D.9d.
- `phase:implement` → D.9d.
- `phase:validate` → D.9d.
- Any future workflow-phase token beginning with `phase:` → D.9d, no `auto.md` edit required.

**D.10 never fires on a `phase:*` token.** D.10 remains the catch-all for genuinely unknown, non-`phase:` labels (per § Dispatch D.10's tightened trigger — an unrecognized `waiting-for:*` still fires D.10).

## Rationale

The phase set is workflow-dependent and open-ended. Speckit-feature and speckit-bugfix already differ (Assumption A6 in the spec). Enumerating each phase label as a separate D.9-class row would break the day a workflow adds a phase — the failure mode is a D.10 escalation gate firing on a routine transition, which is exactly the class of dispatch-overhead this spec exists to kill.

Prefix-match gives the open set one named row with explicit prefix-match semantics; the open-set nature is a first-class part of the row's Trigger definition, not a footnote.

## Ledger line format

```text
<issue-ref> · <phase:*-token> · (no-op) · engine-owned phase transition
```

Distinct from the D.9 / D.9a / D.9b / D.9c outcome `server-side-owned` — `phase:*` transitions are engine-owned transient states of the workflow-phase machinery, not waits for a downstream artifact. The distinction lets grep audits on the ledger file distinguish "waiting for something server-side" from "phase transition heartbeat" without parsing the transition class field.

## Preserved (unchanged from the current playbook)

- **The never-content-filter invariant (§7).** The stream reader consumes every non-empty line from `cockpit watch` unfiltered. D.9d changes what the dispatcher *does* with a `phase:*` event; it does not change which events reach the dispatcher. Upstream filtering of `phase:*` events was explicitly rejected (Q1=D) because it removes the liveness heartbeat and grazes §7.
- **The tightened D.10 trigger (from #396).** Any `waiting-for:*` label without a matching Trigger row still fires D.10. D.9d removes `phase:*` from D.10's catch-all (because `phase:*` is now explicitly matched), but non-`phase:` unrecognized states are unchanged.
- **The mandatory ledger line per dispatch (§ Ledger L.5).** D.9d dispatches produce a ledger line exactly like every other dispatch.
- **The liveness cross-check (step 5).** The cross-check fires on the conjunction of (a) live watch process, (b) N=4 empty reads, (c) actionable live state per `cockpit status --json`. `phase:*` transitions are not actionable (they route to D.9d, which is ledger-only), so a stream of `phase:*` events during a long implement stretch does not prevent the cross-check from firing if the consumer dies. Unchanged.

## Prose shape

The § Dispatch table row (in the table at the top of § Dispatch):

```markdown
| D.9d | `phase:*` (prefix-match) | Ledger line only (engine-owned phase transition) |
```

The § Dispatch D.9d subheading (inserted between D.9c and D.11):

```markdown
### D.9d — `phase:*` → ledger only

**Trigger**: An issue enters any `phase:*` state. **Prefix-match**: any transition class whose token begins with the literal `phase:` prefix matches this row (`phase:specify`, `phase:clarify`, `phase:plan`, `phase:tasks`, `phase:implement`, `phase:validate`, and any future workflow-phase addition). The phase set is workflow-dependent and open-ended — speckit-feature and speckit-bugfix already differ; enumeration would break the day a workflow adds a phase.

**Dispatch**: **Ledger line only.** No CLI verb (in particular, no `generacy cockpit status --json` re-check), no subagent, no gate, no status table, no prose recap — engine-owned transient transition. Never surface a D.10 escalation gate on a `phase:*` token; D.10 remains the catch-all for genuinely unknown, non-`phase:` labels (per § Dispatch D.10's tightened trigger — an unrecognized `waiting-for:*` still fires D.10).

**Ledger line**: `<issue-ref> · <phase:*-token> · (no-op) · engine-owned phase transition`.
```

## Test coverage

- **403-2**: New D.9d subheading exists; the prefix-match sentence is present verbatim; the "Ledger line only" prose is present; the ledger-line format `engine-owned phase transition` appears.
- **403-3**: Reference dispatch classifier prefix-matches:
  - Fixture `403-phase-transition-live-state.json` (`transition_class: "phase:plan"`, an existing enumerated phase) → classifier returns D.9d, not D.10.
  - Fixture `403-phase-someday-live-state.json` (`transition_class: "phase:someday"`, a never-enumerated novel phase) → classifier returns D.9d, not D.10. This is the load-bearing correctness assertion for FR-005.
  - Regression check: neither fixture appears in `GATE_VOCABULARY` (from #396) — `phase:*` tokens are not `waiting-for:*` labels and never should be in that vocabulary. The classifier's D.9d branch operates outside the `waiting-for:*` catch-all.

## True verifier

Transcript grep on a comparable 12-issue epic run: for every event whose transition class matches `phase:*`, the ledger line records `engine-owned phase transition` and no D.10 escalation gate presentation appears. SC-007.
