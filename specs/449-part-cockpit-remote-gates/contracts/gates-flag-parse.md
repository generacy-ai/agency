# Contract: `--gates` flag parse + pre-flight resolution

Extends `packages/claude-plugin-cockpit/commands/auto.md` step-1 argument-parse block. Load-bearing for spec FR-001, FR-002, US4 pre-flight branch, and Q3=A.

## Flag shape

```
--gates=<value>
```

Where `<value>` ∈ `{ "ui", "local", "auto" }`. Default when the flag is absent: `"auto"`.

Orthogonal to the four invocation forms (positional epic-ref, `--tracking`, `--new`, `<issue-list>`) — accepted alongside any of them.

## Usage-string extension

Extends the string at auto.md line 41:

```
Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>" | <issue-list>
       [--gates=ui|local|auto]  (default: auto)
```

## Ambiguity-table extension

Adds one row to the existing table at auto.md lines 28–41:

| Input pattern | Form | Notes |
|---------------|------|-------|
| `--gates=<value>` where `<value>` ∉ `{ui, local, auto}` | usage error | New — reason `gates-value-invalid`. |
| Multiple `--gates=*` flags | usage error | New — reason `gates-duplicate`. |

Existing "unknown `--*` flag" row (auto.md line 38) is unchanged; `--gates` is now recognized.

## `--gates=auto` resolution (pre-flight)

> **Extended by #459** from a two-part to a THREE-part check. auto.md § step-1 `--gates` resolution and pre-flight absence is the normative text; this contract mirrors it. Both must move together.

Decided ONCE per run — items 1 and 2 at parse-time pre-flight (after arg parse, before the seven-cockpit-tools presence check at auto.md line 136), item 3 after the ledger header write. Does not flip mid-loop.

Three-part check:

1. **Tool binding**: Are `cockpit_gate_open`, `cockpit_gate_status`, AND `cockpit_gate_list` **all** present in the session's MCP tool binding? All three — not `cockpit_gate_open` alone — because a cluster mid-upgrade to generacy#1038 can have `cockpit_gate_open` bound while the query tools are not, and requiring only the former lets item 3 invoke an unbound `cockpit_gate_list`.
2. **Cluster cloud-activation**: Is the cluster cloud-activated? Query surface pinned by the epic (see `cockpit-remote-gates-plan.md § Skill-side presence check` — implementation is expected to piggyback on either the doorbell handshake or a startup field returned by `cockpit_context`).
3. **Pre-flight functional probe**: Does the gate-query surface actually WORK? Exactly one read-only `cockpit_gate_list({ issueRef: <identity-ref>, gateType: <omitted> })` call; any `status: 'error'` return is a failure. **DEFERRED** until after the ledger header line is written, because the probe writes a ledger row on both pass and fail. **Short-circuit rule (load-bearing)**: issue item 3 ONLY when items 1 AND 2 both pass; otherwise resolve to `local` with NO probe call and NO probe ledger row — `--gates=auto` → `local` is pinned byte-identical to explicit `--gates=local`, which never calls `cockpit_gate_list`.

If items 1 AND 2 AND 3 all pass → `resolvedGateMode = "ui"`. If either of items 1–2 is NO → `resolvedGateMode = "local"` (byte-identical to explicit `--gates=local`; no probe issued). If item 3 alone fails → `resolvedGateMode = "local"` with resolution reason `probe-failed` — **except** when a remote UI gate was already consumed in the TENTATIVE window (currently only reachable via Form 3's G.6), in which case the run hard-fails with reason `probe-failed-after-remote-gate-consumed` rather than downgrading, because a `gates: local` ledger carrying a `· source: ui-gate` resolution row above it is exactly the ambiguous partial-UI / partial-local record the decide-once discipline exists to prevent.

**TENTATIVE window**: between the parse-time decision (items 1–2) and the post-header probe (item 3), the resolution is TENTATIVE — `ui pending probe` when items 1–2 both YES, `local` otherwise. Any gate firing in that window presents under the TENTATIVE mode. Under current sequencing only Form 3's G.6 filing gate can fire there. See auto.md § TENTATIVE window gate-presentation rule.

Ledger startup line records the resolution:
```
Auto run starting · gates: <resolvedGateMode> (source: --gates=<flag-value>)
```
(printed AFTER the ledger directory is created, alongside the existing startup ledger header — this is a print+ledger-header extension, not a new dispatch row.)

## `--gates=ui` pre-flight absence (Q3=A)

When `--gates=ui` is explicit AND **any** of `cockpit_gate_open`, `cockpit_gate_status`, or `cockpit_gate_list` is absent from the session's MCP tool binding at pre-flight:

**Response class**: `Print + exit`. No ledger directory created.

**Verbatim error string** — this file is the source of truth for the string; test `449-4` in `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` pins it and auto.md reproduces it. All three must move together:
```
--gates=ui specified but one or more of cockpit_gate_open / cockpit_gate_status / cockpit_gate_list is not available in this session; re-invoke with --gates=local or --gates=auto
```

> **Widened by #459** from `cockpit_gate_open` alone to all three UI-mode tools. Requiring all three here is what prevents the deferred pre-flight probe from later invoking an unbound `cockpit_gate_list` on a partial-deployment cluster.

**Exit code**: non-zero.

**Ordering**: this check fires AFTER arg parse (V1) and BEFORE any of:
- Ledger directory creation (`mkdir -p .generacy/cockpit/auto-runs`)
- Ledger header write
- The seven-cockpit-tools presence check at auto.md line 136 (which validates the OTHER seven cockpit MCP tools)
- The Form 4 workspace-repo inference (which fires yet earlier in step 1)

**Rationale**: `--gates=ui` is an explicit operator override the environment cannot satisfy. Precedent: the seven-cockpit-tools presence check (auto.md line 136–141) and the Monitor-presence check both use `Print + exit`. Silent whole-run downgrade would reintroduce exactly the session-blocking that `--gates=ui` was chosen to escape. Per-gate fallback (US4 / FR-011) covers call-time ERROR, not pre-flight ABSENCE — a static session property should not pay per-gate fallback overhead.

**No prompt**: the operator cannot enable `cockpit_gate_open` in-session; a prompt whose every option means "abort" is not a decision.

## `--gates=local` fast path

When `resolvedGateMode = "local"` (explicit or from auto-resolution), the loop's byte-path is unchanged from today. In particular:
- No `cockpit_gate_open` calls are made.
- No `openGates` map is populated.
- D.12 is a no-op dispatch (never fires — the doorbell surface does not emit `gate-answer` events when no records are open).
- The ledger `source: ui-gate` suffix is never appended.
- Every existing test that exercises local behavior continues to pass without modification.

This is the spec-mandated invariant: **`--gates=local` byte-path unchanged** (spec § Acceptance criteria first clause).

## Test pins (playbook-verification)

The 449-* describe block adds:

- `assert usage string at line ~41 contains "[--gates=ui|local|auto]  (default: auto)"` (literal match)
- `assert ambiguity table contains row for "gates-value-invalid"` (literal match of the reason string)
- `assert step-1 parse block contains the verbatim Q3=A error string` (literal match, exact spacing)
- `assert step-1 parse block contains the THREE-part auto-resolution rule` — item 1 = `cockpit_gate_open` AND `cockpit_gate_status` AND `cockpit_gate_list` all bound, item 2 = cluster cloud-activated, item 3 = pre-flight functional probe passes (deferred past the header write), plus the short-circuit clause; all three → `ui`, else `local`. **Widened by #459 from the original two-part pin — do not re-narrow.**
- `assert the enumerated <resolution reason> values are` `ui-mode tools unbound` / `cluster not cloud-activated` / `probe-failed` (literal match). The item-1 token is deliberately tool-agnostic: item 1 requires all three UI-mode tools, so a per-tool token would name the wrong tool on a partial-deployment cluster.

Any of these breaking means the pre-flight contract has drifted; re-pin to the new contract, do not weaken.
