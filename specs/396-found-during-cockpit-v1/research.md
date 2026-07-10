# Research: #396 — Close the D.10 bypass, add D.11 for `waiting-for:merge-conflicts`

Phase 0 restatement of the Q1–Q5 decisions from [clarifications.md](./clarifications.md) as design decisions with alternatives-rejected and rationale. Each decision is anchored in a directly-observed T-S5 constraint or a directly-observed pre-existing dispatch-table gap; none is aesthetic.

## Framing: what shape of fix is this?

The observed failure is a **classification drift**, not a mechanism gap:

- The auto session **received** the `waiting-for:merge-conflicts` event on the stream (mechanism worked).
- The parent **classified** the label as *"worker-owned transient state, not one of the D.1–D.9 actionable dispatch classes"* and routed the classification to a **third bucket** ("known but not actionable") that the playbook does not define.
- No dispatch row fired. No ledger line was written. D.10's catch-all did not fire because the parent's classification decided the state was "known" (i.e., D.10's "unrecognized" trigger was interpreted as strictly-not-known, not as strictly-not-dispatchable).

The fix has the same shape as #384/#388/#390/#394 (instruction-drift class): pin the rule at the surface where the drift occurred, add a completeness-hygiene backstop the model cannot silently regress. The specific surface here is the D.10 trigger prose (drift point) + a declared vocabulary the model can be audited against (backstop).

## R1 — Audit source: plugin-local vocabulary list (Q1=C)

**Decision**: `packages/claude-plugin-cockpit/lib/gate-vocabulary.ts` is a plugin-local TypeScript module that exports a named `GATE_VOCABULARY` const containing the 11 `waiting-for:*` tokens from `tetrad-development/.github/labels.yml` **plus `waiting-for:merge-conflicts`** (12 total). The file header comment names the two upstream sources (`labels.yml` for the machine-readable list, `docs/label-protocol.md` for the human-facing doc) and states the sync obligation ("this list must be re-synced when the upstream vocabulary changes; a mismatch does not affect runtime safety — D.10's tightened trigger catches any `waiting-for:*` without a dispatch row — but it will fail the drift audit at build time").

**Rationale**: The audit runs in this repo's CI. The alternatives all fail on a concrete requirement:

- **Q1=A (`tetrad-development/.github/labels.yml`)**: Cross-repo read. This repo's CI does not have `tetrad-development` checked out; a naive read would fail at test time. Even if we mounted the sibling repo in CI, we would introduce cross-repo coupling — a typo in `labels.yml` would fail this repo's build.
- **Q1=B (`tetrad-development/docs/label-protocol.md`)**: Same cross-repo problem, plus the doc lists 8 tokens where `labels.yml` lists 11 — the doc is authored, not generated, so it drifts against the machine-readable source. Auditing against the drifted source would flag the source's own drift as an `auto.md` bug.
- **Q1=D (grep `auto.md` for its own `waiting-for:*` tokens)**: A self-consistency check — by construction, every token dispatched has a Trigger row (that's the definition of dispatching). The audit would always pass, contributing zero drift signal against the engine vocabulary.

Q1=C is the only option that (a) runs in-repo without cross-repo coupling and (b) checks against a declared vocabulary (not against `auto.md` itself). The sync obligation is a documentation-only cost, discharged by the operator when the engine vocabulary changes.

**Load-bearing invariant remains the runtime rule**: any `waiting-for:*` label without a matching dispatch row → D.10 escalation. The audit is completeness hygiene at build time; the D.10 trigger is the safety net at run time. This layering is deliberate — if the vocabulary list falls out of sync with the engine (which can happen if the engine ships a new label before the operator updates `gate-vocabulary.ts`), the runtime still catches the drift as an escalation, not a silent no-op.

**Alternatives rejected in-line above**: Q1=A, Q1=B, Q1=D.

## R2 — Backfill three ledger-only rows (Q2=C)

**Decision**: `auto.md` gets three new named ledger-only D.9-shape dispatch rows for pre-existing engine-emitted `waiting-for:*` tokens that would otherwise fail the audit day one:

| Token | New row | One-line rationale (inline in dispatch section) |
|-------|---------|-------------------------------------------------|
| `waiting-for:pr-feedback` | **D.9a** | Legacy alias of the engine-owned feedback loop (already surfaced via D.9 `waiting-for:address-pr-feedback`; the `pr-feedback` prefix is the older shape, present in `labels.yml` for backward-compat with epics that haven't migrated) |
| `waiting-for:children-complete` | **D.9b** | Epic-container state — the running loop *is* its resolution (the parent auto session dispatches children until `epic-complete`, at which point `waiting-for:children-complete` transitions naturally without operator input) |
| `waiting-for:dependencies` | **D.9c** | Engine-owned cross-issue wait — resolved server-side when the depended-on issue transitions |

Each rationale ships as one prose line inside the dispatch row's **Dispatch** block. Ledger line format is D.9-shape: `<issue-ref> · <token> · (no-op) · server-side-owned`.

**Numbering choice**: **D.9a / D.9b / D.9c** (sub-numbered under D.9), not D.12/D.13/D.14 (appended after D.11). Rationale:

- D.9 is the "server-side-owned ledger-only family" heading; grouping the three new tokens under it keeps the semantic family visible in the table.
- Appending as D.12/D.13/D.14 places them numerically after D.11 (the new escalation row) and after D.10 (catch-all), which visually places the catch-all D.10 in the middle of the table — breaking the "catch-all last" invariant that has held since D.10 was introduced.
- Sub-numbering preserves monotonic leading-digit ordering (`D.1 … D.9 … D.11 → visually D.10 last`), so the "catch-all is the last row an operator sees when reading the table top-to-bottom" invariant survives.

**Fallback for genuinely-ambiguous semantics**: if any of the three tokens' semantics cannot be pinned at implement time with confidence, that one row falls back to Q2=B's per-token allowlist path — an explicit entry in the audit fixture naming the token as "known drift, pending semantic clarification, filed follow-up #<n>". Guessing is prohibited (D.10's `Never guess` clause applies transitively — a ledger-only classification with wrong semantics silently drops an actionable state, exactly the T-S5 failure this fix exists to close). At implement time, the operator's judgment call is: if the one-line rationale can be defended without reading the engine code, ship the row; otherwise allowlist and file a follow-up.

**Alternatives rejected**:

- **Q2=A (expand scope to add operator-facing gates for all three)**: Would smuggle in a new interaction surface the observed corpus doesn't need. `waiting-for:pr-feedback` doesn't have an operator-authorable resolution surface distinct from `waiting-for:address-pr-feedback`'s already-server-side-owned handling; `waiting-for:children-complete` and `waiting-for:dependencies` are engine-owned by construction. Adding gates would add operator burden with no gate-appropriate operator decision to make.
- **Q2=B (allowlist all three unconditionally)**: Would ship with a visible TODO surface where day-one green requires zero TODO entries. The audit would fail-open on three tokens simultaneously, obscuring the drift signal. Q2=B remains the per-token fallback for genuinely-ambiguous semantics; using it as the default treats "we haven't thought hard about this" as the state to ship.
- **Q2=D (narrow FR-011 to merge-conflicts-only)**: Would kill the drift signal — a single-token audit ("does merge-conflicts appear?") is trivially true and adds no protection against future vocabulary additions. The whole point of FR-011 is completeness hygiene against the declared engine vocabulary.

## R3 — D.11 `I've resolved it` failure path: re-present the gate (Q3=A)

**Decision**: If the operator selects `I've resolved it — advance the gate` and the `generacy cockpit advance --gate merge-conflicts <issue-ref>` CLI call returns non-zero, the parent **re-presents the D.11 gate with the CLI error prepended verbatim to the presentation block**. The Skip/Stop options remain available on the re-presented gate; only `I've resolved it — advance the gate` triggers the retry loop.

**Presentation shape on retry** (contract in [contracts/dispatch-D11-merge-conflicts.md](./contracts/dispatch-D11-merge-conflicts.md)):

```markdown
Advance failed for <issue-ref>:

<CLI stderr verbatim — e.g., "error: branch still has conflicts on paths: packages/foo/src/bar.ts">

Merge conflicts on <issue-ref>:

<conflicted paths from pause alert>
```

The operator sees the CLI error and the original conflicted-paths context in the same block, mid-decision. They can now:

- Re-select `I've resolved it — advance the gate` after actually resolving and pushing (retries the CLI call).
- Select `Skip (session-local mute)` — muted for the run, resurfaces on the next auto invocation's startup sweep.
- Select `Stop (exit auto)` — kills watch, prints summary, exits.

**Rationale**: The most likely non-zero return from `cockpit advance --gate merge-conflicts` is `error: branch still has conflicts` (the operator thought they resolved it; git rebase left a merge marker; they pushed but the conflict persists). Every other option obscures this context:

- **Q3=B (route to D.10)**: Category error — D.10 is for *state-classification* unrecognition, not *action-execution* failure. Failing to advance a known gate is not a novel state; it's a known state whose action didn't stick.
- **Q3=C (ledger the failure, continue the loop)**: The operator sees the retry on the next poll with no context about what went wrong. Idempotency (L.5) covers duplicate-action safety, but the operator's next interaction is with a fresh gate presentation that doesn't tell them why the last attempt failed. The retry loop happens, but the debugging surface is stripped.
- **Q3=D (full-stop the auto session)**: Over-punitive for an operator-recoverable failure. Killing the session forces a full relaunch (new watch process, new startup sweep) when the failure is a one-line CLI error the operator can address in ~30 seconds by re-resolving and re-pushing.

**Precedent match**: D.6 (validate-red / merge-red) already uses the "re-present the escalation gate on retry" shape when the bounded fixer subagent returns `{fixed: false, …}`. D.11's failure-path is the same shape at a different trigger: an operator-authored action didn't stick, re-present the same gate with the failure inline so the operator's next selection is informed.

## R4 — Label registration in tetrad-development is a same-day operator-side edit (Q4=D-modified)

**Decision**: `waiting-for:merge-conflicts` and `completed:merge-conflicts` are registered in `tetrad-development/.github/labels.yml` and `docs/label-protocol.md` as an operator-side docs/config edit, same-day, tracked outside this PR's diff.

**Rationale**: The plugin-local audit vocabulary (Q1=C / R1) decouples this repo's CI from `tetrad-development`'s doc/config state. The `.github/labels.yml` sync is consumed by `tetrad-development/scripts/sync-labels.sh` when the operator syncs GitHub labels; that's an engine-side (or operator-side) concern, not a plugin CI concern. `docs/label-protocol.md` is a human-facing reference document; keeping it in sync is documentation hygiene.

The observed T-S5 evidence is that `waiting-for:merge-conflicts` is already being emitted by the engine — the label exists in the repo's live-label vocabulary, just not in either doc. Registering it closes an observable gap ("this label is emitted but not documented"). Not registering it leaves that gap open and requires an allowlist entry in the audit fixture — extra machinery for no CI benefit.

**Alternatives rejected**:

- **Q4=A (companion cross-repo PR)**: Coordination cost (two PRs, two review cycles, ordering constraints) for no CI benefit — the audit source is plugin-local either way.
- **Q4=B (defer via companion generacy finding)**: Leaves the label undocumented until the companion ships. The docs/config edit is trivial (~4 lines across two files); deferring it is scope shifting, not scope reduction.
- **Q4=C (partial — labels.yml only, skip label-protocol.md)**: Machine-readable list matches reality, but the human-facing doc still misleads any operator reading it. Both files edit together at the same trivial cost.
- **Q4=D-original (no registration + allowlist entry)**: Introduces audit machinery to work around a doc-hygiene issue. Q1=C already decouples the two repos; the allowlist is only needed if the audit source is cross-repo (Q1=A/B), which we rejected.

**Traceability**: The two-file operator edit is called out in [plan.md § Companion operator-side edits](./plan.md) so a reader following the trail from #396 to `auto.md` can see the whole picture. The edit is not part of this branch's diff; the PR body will link to the tetrad-development commit(s) for evidence.

## R5 — G.4 sub-block placement: named rows grouped, catch-all last (Q5=C+D)

**Decision**: The order of G.4 sub-blocks in `auto.md` § Gate contract becomes:

```
(a) Validate-red / merge-red     (from D.6)
(b) agent:error / failed:*        (from D.7)
(d) Merge-conflicts               (from D.11, NEW — inserted between (b) and (c))
(c) Unrecognized                  (from D.10, terminal)
```

The § Gate contract table row `G.4 (d)` inserts between `G.4 (b)` and `G.4 (c)` in the same position:

```
| G.4 (a) | Escalation: validate-red / merge-red | ... |
| G.4 (b) | Escalation: agent:error / failed:*   | ... |
| G.4 (d) | Escalation: Merge-conflicts          | ... |   <-- NEW
| G.4 (c) | Escalation: unrecognized state       | ... |
```

**Rationale**: The order carries no semantic weight (Q5=D) — the trigger comes from the dispatch row, not the sub-block position; a reader could find `(d)` in either order. So the rule is deterministic, not aesthetic:

- **Named rows grouped together** — `(a)`, `(b)`, `(d)` are all "the parent knows what happened and has a specific gate for it" cases.
- **Catch-all last** — `(c) Unrecognized` is "the parent doesn't know what happened", terminal placement mirrors D.10's terminal placement in the § Dispatch table.

Numeric labeling (a, b, c, d) is decoupled from visual position. `(c)` retains its letter (attached to D.10, the catch-all) even though it appears fourth; `(d)` retains its letter (attached to D.11, a named row) even though it appears third. This is the same shape as the § Dispatch table's D.10/D.11 relationship — D.11 numerically follows D.10 (append) but visually inserts between D.9 (family) and D.10 (catch-all).

**Alternatives rejected**:

- **Q5=A (append `(d)` after `(c)`)**: Numeric alphabetical order (a, b, c, d) reads naturally at first glance but breaks the "catch-all last" grouping. A future reader looking for named gates would skim past `(c)` (the catch-all) before finding `(d)` (a named gate) — the reading flow implies `(d)` is more-catch-all than `(c)`, which is backwards.
- **Q5=B (`(a)`, `(d)`, `(b)`, `(c)` or similar visual-mirror-of-dispatch-table)**: Over-fitting the presentation to the § Dispatch table's D.6/D.7/D.11/D.10 ordering. The two tables serve different audiences (dispatch = event-classification-time; gate contract = gate-authoring-time); coupling their orderings creates rigidity for no benefit.

## R6 — Load-bearing surfaces: what the fix touches and what it doesn't

The tightened D.10 trigger and the D.11 dispatch row are the two load-bearing edits. Everything else is completeness hygiene around them:

**Load-bearing** (a bug here reproduces the T-S5 stall):

- D.10's tightened trigger prose — the runtime safety net. Any `waiting-for:*` label without a matching dispatch row IS unrecognized. No "known but not actionable" third bucket.
- D.11's dispatch row — the named handler for the specific token that triggered the finding.
- D.11's `apply verdict` failure-path prose (re-present with error inline) — the operator-recoverability surface.

**Completeness hygiene** (a bug here fails the audit at build time, not at runtime):

- D.9a/b/c backfill — closes the pre-existing dispatch-table gap so day-one audit is green.
- `lib/gate-vocabulary.ts` — the declared vocabulary the audit checks against.
- The three drift-audit assertions (396-1, 396-2, 396-3) — the machine-checkable backstop.

**Not touched** (out of scope):

- § Invariants section — no new invariant §8. The tightened D.10 trigger sits inside D.10's own prose, not at the invariants surface. Matches SC-007 of #394 (no belt-and-suspenders extra clauses).
- Sibling playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md`) — no dispatch surface, no drift risk.
- `cockpit watch` / `cockpit status` / `cockpit advance` CLI verbs — no engine-side change; `cockpit advance --gate merge-conflicts` is the existing pattern applied to a new gate name.
- `packages/claude-plugin-cockpit/lib/reference-consumption.ts` (created by #394) — independent module, untouched.
- Historical spec directories — deliberately byte-identical.

## Sources

- **Spec**: [spec.md](./spec.md) — observed T-S5 evidence, two-fix framing, regression-test enumeration.
- **Clarifications**: [clarifications.md](./clarifications.md) — Q1–Q5 with resolved answers.
- **Predecessor fixes**: [../384-found-during-cockpit-v1/plan.md](../384-found-during-cockpit-v1/plan.md), [../388-found-during-cockpit-v1/plan.md](../388-found-during-cockpit-v1/plan.md), [../390-found-during-cockpit-v1/plan.md](../390-found-during-cockpit-v1/plan.md), [../394-found-during-cockpit-v1/plan.md](../394-found-during-cockpit-v1/plan.md) — the instruction-drift class this fix continues to close at successive playbook surfaces.
- **Upstream vocabulary source of record**: `tetrad-development/.github/labels.yml` (11 `waiting-for:*` tokens) + `tetrad-development/docs/label-protocol.md` (author-curated 8-token doc) — companion operator-side edit registers `waiting-for:merge-conflicts` in both.
