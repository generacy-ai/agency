# Contract: `--gates=auto` resolution — probe fold-in and short-circuit rule

Load-bearing prose for the `--gates=auto` two-part → three-part extension in `packages/claude-plugin-cockpit/commands/auto.md` § step 1 `--gates` resolution. This contract owns the specific pieces of the `auto` mode's resolution flow that this feature changes; the probe's own call shape and error handling live in [`gate-query-probe.md`](./gate-query-probe.md).

## Scope

`--gates=auto` is the DEFAULT mode when the operator does not specify `--gates=...`. Its purpose is to resolve to `ui` when both the tools AND the surface support it, and to fall back to `local` otherwise so the run keeps working on partially-deployed clusters.

Today, the resolution is a two-part check. This feature extends it to three parts, with a load-bearing short-circuit rule so the third part is issued ONLY when the first two both pass.

## The three-part check (canonical form)

Verbatim prose form for `auto.md`:

```markdown
**`--gates=auto` resolution (three-part check, decided ONCE).** When the parsed value is `auto`, resolve to `ResolvedGateMode` via a three-part check — items 1 and 2 evaluated at parse-time pre-flight, item 3 (the probe) deferred until AFTER the ledger header is written; short-circuit rule applies (item 3 is issued ONLY when items 1 AND 2 both pass):

1. **Tool binding**: Are `cockpit_gate_open`, `cockpit_gate_status`, AND `cockpit_gate_list` ALL present in the session's MCP tool binding? (same shape as the `cockpit_*` tool-presence check at step 3 below under `ResolvedGateMode === "ui"` — these three tools are the complete UI-mode-only set that landed together in generacy#1038, but a partial deployment where `cockpit_gate_open` is bound and the query tools are not can arise on clusters mid-upgrade; requiring all three here — rather than only `cockpit_gate_open` — keeps item 3 from invoking an unbound `cockpit_gate_list` at the probe on such a cluster.)
2. **Cluster cloud-activation**: (unchanged existing text)
3. **Gate-query surface functional probe** (NEW, per generacy-ai/agency#459; fires post-header-write): Issue exactly one read-only `cockpit_gate_list({ issueRef: <identity-ref> })` call against the run's identity ref (the value in the ledger header's `Tracking ref:` field). An empty `{gates: []}` return is a perfectly good pass. Pass (`{status: 'ok'}`) → resolve to `ui`. Fail (any `{status: 'error'}`, any of the four classes in the § Gate-query error taxonomy) → resolve to `local` via the pre-flight probe fail path (write `<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe` — safe now that the header exists as the first line of the ledger file, print the FR-013 template line, print the `Auto run starting · gates: local (source: --gates=auto → probe-failed)` line, proceed to § step 3 in `local` mode).

**Short-circuit rule (load-bearing)**: when item 1 fails (any UI-mode tool unbound) OR item 2 fails (cluster not cloud-activated), resolve to `local` with **NO probe call and NO probe ledger row**. Always-probing would break the byte-identity pin `auto`→`local` = explicit `--gates=local` (any-mode probe row would appear under `auto`→`local` but not under explicit `local`), and would call `cockpit_gate_list` at a point where § step 3's conditional presence check does not require it to be bound. Only when items 1 AND 2 BOTH pass is item 3 issued.

**Form 4 sequencing (per Q1 rationale)**: item 3 requires (a) `trackingRef` to be bound and (b) the ledger header to have been written. Under Form 4 the ref binding happens at F4.4 (reuse) or F4.6 (fresh-creation) and the header write happens at F4.7 — all inside step 1. The sequencing constraint: items 1 and 2 (which need neither) may evaluate at the start of step 1 at parse time; F4.4/F4.6/F4.7 run per their own contracts; THEN item 3 fires only when items 1 AND 2 both passed AND F4.7 has completed. Under Forms 1/2/3 the identity ref is bound at parse time (Form 1: epic ref; Form 2: `trackingRef` from `--tracking <ref>`) or after G.6 approval (Form 3), and the header is written at line-199 (Forms 1/2) or after G.6 (Form 3); item 3 fires after those form-specific header writes.

The resolution is decided ONCE per run; it does not flip mid-loop. Mid-run outages of the gate-query surface remain the responsibility of the per-event `query-unreachable` taxonomy (§ Gate-query error taxonomy), NOT of a re-probe.
```

## Why the short-circuit is load-bearing

Three independent reasons, any one of which is sufficient (per Q3 answer + research.md § R4):

### R1 — Byte-identity pin

`auto.md` today pins `--gates=auto` resolved to `local` as byte-identical to explicit `--gates=local`. That pin is what allows an operator diagnosing a `local` run's behavior to trust that "auto resolved to local" and "explicit local" produce indistinguishable output — no ledger row appears in one that does not appear in the other.

Always-probing would break this pin: `auto`→`local` would produce a probe ledger row (either the pass row if the probe succeeded, or the fail row if it failed), while explicit `--gates=local` would not. The pin is load-bearing (a downstream operator diagnosis assumes the two paths are indistinguishable); breaking it silently would confuse every future post-mortem.

### R2 — Tool-binding violation

Per #457's conditional tool-presence check, `cockpit_gate_status` / `cockpit_gate_list` are required in the session's MCP binding ONLY under `ResolvedGateMode === "ui"`. Under `local` (either explicit or `auto`-resolved), they are NOT required and may not even be bound.

Issuing the probe when either item 1 or item 2 already resolved to `local` would call an unbound tool — producing a harness error with no row in the four-class gate-query taxonomy to classify it. The `local` run would then hard-abort at pre-flight on a tool it never intended to use. This directly reintroduces the "hard-abort on a tool it never calls" symptom that #457's conditional check was designed to prevent (which was itself a fix for a prior over-broad requirement).

For the same reason, item 1's tool-binding check requires all three UI-mode tools (`cockpit_gate_open`, `cockpit_gate_status`, `cockpit_gate_list`) to be bound — not just `cockpit_gate_open`. Only checking `cockpit_gate_open` would let a partial-deployment cluster (post-#1038 `cockpit_gate_open` but pre-#1038 query tools) pass item 1 with items 2 also YES, then invoke an unbound `cockpit_gate_list` at item 3.

### R3 — No informational value

Under `auto`-short-circuited-to-local, the outcome of the probe cannot flip the resolution: item 1 or item 2 already fixed it to `local`. Issuing the probe is wasted network I/O for zero decision-making benefit.

## Why the Form 4 sequencing matters

Under Forms 1/2/3, the identity ref is bound before or during step 1 by a mechanism that runs before the `--gates` resolution:
- Form 1: parse-time (`--epic <ref>`).
- Form 2: parse-time (`--tracking <ref>`).
- Form 3: after G.6 approval, which runs inside step 1 but before the `--gates` resolution.

Under Form 4 (fresh-epic bootstrap), the identity ref is bound at F4.4 (reuse) or F4.6 (fresh-creation), and the ledger header is written at F4.7 — all late-step-1 steps. Today's `--gates=auto` two-part check is described as a single pre-flight action; adding a third check that depends on both the identity ref (as probe input) and the ledger header (as ledger-row precondition) would introduce a dependency on Form 4's mid-step-1 sequencing.

**Solution**: items 1 and 2 do NOT depend on the identity ref or the header and can be evaluated first (they check tool-binding and cluster-cloud-activation, both static session properties). Item 3 fires only after F4.4/F4.6 has bound the identity ref AND F4.7 has written the ledger header. Under Forms 1/2/3 this is a trivial ordering constraint (header write happens at line-199 or after G.6 approval); under Form 4 it prevents item 3 from firing with an undefined `<identity-ref>` (invalid-args probe error at best, harness error at worst) OR from trying to write a probe ledger row before the header (violating the header-first invariant per auto.md line 199).

**Test assertion 459-4**: § step 1 states the Form 4 sequencing rule verbatim — probe fires AFTER F4.6/F4.4 has bound `trackingRef`, NOT alongside conditions 1–2.

## The `Auto run starting` line — `probe-failed` value

`auto.md` today prints an `Auto run starting · gates: <ui|local> (source: --gates=<value>[ → <resolution reason>])` line before the ledger header. The `→ <resolution reason>` suffix appears only when `--gates=auto` resolved down to `local`, and names which of the two-part checks failed.

Today's possible values (from `auto.md:166`):
- `ui-mode tools unbound` — item 1 failed (any of `cockpit_gate_open` / `cockpit_gate_status` / `cockpit_gate_list` absent).
- `cluster not cloud-activated` — item 2 failed.

This feature adds ONE new value:
- **`probe-failed`** — items 1 and 2 both passed, but item 3 (the probe) failed.

Example lines this feature enables:
- `Auto run starting · gates: local (source: --gates=auto → probe-failed)` — probe failed under `auto` (items 1 and 2 passed).

The pin (459-3) requires the `probe-failed` value to be enumerated verbatim in the auto.md prose that documents the possible `<resolution reason>` values.

Under explicit `--gates=ui` the line is NOT printed — a probe failure under explicit `ui` exits non-zero (per FR-004), and no `Auto run starting · gates: ui` line is produced for a run that never starts. Under explicit `--gates=local` the suffix is omitted entirely.

## Resolution decision points table

Complete table of `--gates=auto` resolution outcomes after this feature:

| Item 1 (all 3 UI-mode tools bound) | Item 2 (cluster cloud-activated) | Item 3 (probe) | ResolvedGateMode | `Auto run starting` line | Probe ledger row |
|---|---|---|---|---|---|
| NO | (short-circuit) | (short-circuit) | `local` | `Auto run starting · gates: local (source: --gates=auto → ui-mode tools unbound)` | NONE |
| YES | NO | (short-circuit) | `local` | `Auto run starting · gates: local (source: --gates=auto → cluster not cloud-activated)` | NONE |
| YES | YES | PASS (`{status: 'ok'}`) | `ui` | `Auto run starting · gates: ui (source: --gates=auto)` | Pass row |
| YES | YES | FAIL (any `{status: 'error'}`) | `local` | `Auto run starting · gates: local (source: --gates=auto → probe-failed)` | Fail row |

Under explicit `--gates=ui`:

| Item 1 (all 3 UI-mode tools bound) | Item 3 (probe) | Outcome |
|---|---|---|
| NO | (not reached) | Hard-fail: verbatim `--gates=ui` absence string; exit non-zero; NO ledger dir created; NO ledger row |
| YES | PASS | `ResolvedGateMode = "ui"`; `Auto run starting · gates: ui (source: --gates=ui)`; probe pass ledger row; continue to § step 3 |
| YES | FAIL | Write fail ledger row; print FR-013 template line; exit non-zero; NO `Auto run starting` line printed (run never starts) |

Under explicit `--gates=local`: no probe, no probe ledger row, `Auto run starting · gates: local (source: --gates=local)`, continue to § step 3 in `local` mode.

## The "decided ONCE" invariant

Per FR-006: the `auto` resolution decision MUST be made once at pre-flight and MUST NOT flip mid-run.

This is what makes the probe a **pre-flight** concern rather than a per-event or per-wake concern:

- Mid-run flips would introduce cross-mode consistency hazards. A run that starts in `ui`, half-drafts a gate, and then flips to `local` because the probe went red mid-run would have a hybrid state (some gates in the inbox, others resolved locally) that no operator can reason about.
- Mid-run outages ARE handled — by the per-event `query-unreachable` class in the pre-draft-check taxonomy. Individual events fail; the run continues.

The probe fires once, sets `ResolvedGateMode`, and hands off to § step 3. The value of `ResolvedGateMode` is stable for the run.

## Interaction with other resolution paths

- **`--gates=ui` explicit** — probe fires as an additional pre-flight assertion (see [`gate-query-probe.md`](./gate-query-probe.md)). Failure → exit non-zero (never resolves to `local`).
- **`--gates=local` explicit** — no probe fires. Zero interaction with this feature.
- **`--gates=auto`** — probe fires as item 3, ONLY when items 1 and 2 both pass. Short-circuit otherwise.

## Test assertions this contract owns

- **459-1**: § step 1 `--gates=auto` resolution declares a three-item list with the probe as item 3 AND states the short-circuit rule verbatim.
- **459-3**: `Auto run starting` line's `<resolution reason>` suffix enumerates `probe-failed` as a possible value under `--gates=auto`.
- **459-4**: Form 4 sequencing — probe fires AFTER F4.6/F4.4.
- **459-11 (partial)**: On probe failure under `--gates=auto`, the run resolves to `local` (not exits) AND the probe fail ledger row is written. (The `ui` half of 459-11 is owned by [`gate-query-probe.md`](./gate-query-probe.md).)

## Re-pin targets in the existing suite

The following existing pins quote the OLD two-part check and MUST be re-pinned to the three-part contract in the same PR (per repo CLAUDE.md § "Cockpit playbook pins"):

- Any assertion in the `449 UI-mode gates` block that quotes the `--gates=auto` two-part check verbatim (audit at implementation time — likely 449-N for the parse/resolution assertion).
- Any assertion elsewhere that names the `→ <resolution reason>` values by enumeration and thus needs `probe-failed` added.

CLAUDE.md rule: do not weaken, re-pin.
