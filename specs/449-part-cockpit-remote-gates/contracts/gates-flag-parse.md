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

Decided ONCE at pre-flight, after arg parse, before the seven-cockpit-tools presence check at auto.md line 136. Does not flip mid-run.

Two-part check:

1. **Tool binding**: Is `cockpit_gate_open` present in the session's MCP tool binding?
2. **Cluster cloud-activation**: Is the cluster cloud-activated? Query surface pinned by the epic (see `cockpit-remote-gates-plan.md § Skill-side presence check` — implementation is expected to piggyback on either the doorbell handshake or a startup field returned by `cockpit_context`).

If both YES → `resolvedGateMode = "ui"`. If either NO → `resolvedGateMode = "local"` (byte-identical to explicit `--gates=local`).

Ledger startup line records the resolution:
```
Auto run starting · gates: <resolvedGateMode> (source: --gates=<flag-value>)
```
(printed AFTER the ledger directory is created, alongside the existing startup ledger header — this is a print+ledger-header extension, not a new dispatch row.)

## `--gates=ui` pre-flight absence (Q3=A)

When `--gates=ui` is explicit AND `cockpit_gate_open` is absent from the session's MCP tool binding at pre-flight:

**Response class**: `Print + exit`. No ledger directory created.

**Verbatim error string**:
```
--gates=ui specified but cockpit_gate_open is not available in this session; re-invoke with --gates=local or --gates=auto
```

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
- `assert step-1 parse block contains the two-part auto-resolution rule (both cockpit_gate_open bound AND cluster cloud-activated → ui, else local)`

Any of these breaking means the pre-flight contract has drifted; re-pin to the new contract, do not weaken.
