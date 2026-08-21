# Quickstart: UI-mode remediation-limit gate

This feature has no runtime installation step — it wires an existing playbook path into the plugin's type system and reconciles playbook prose. Use this guide to make and verify the change.

## Prerequisites

```bash
pnpm install
pnpm build
```

Work in the `packages/claude-plugin-cockpit` package.

## The changes at a glance

| File | Edit |
|------|------|
| `lib/gate-wire-types.ts` | Add `remediation-limit` to `GateType` (`:105-113`); add `"D.13"` to `DispatchClass` (`:142-152`); add discriminator comment line (`:115-133`). |
| `commands/auto.md` | Base sweep `D.1–D.9` → include D.13 (`:333`); extend D.10 clause (d) (`:1012`); drop rejected parenthetical (`:1555`); reconcile DATA GAPS (`:1561`). |
| `tests/playbook-verification.test.ts` | Re-pin rows 500-5, 500-7, 500-9 to the new contract. |

## Verify: type-level

The `GateType` and `DispatchClass` edits are validated by the compiler. After editing:

```bash
pnpm --filter @generacy-ai/claude-plugin-cockpit build
# or, for a fast type-only check:
pnpm --filter @generacy-ai/claude-plugin-cockpit exec tsc --noEmit
```

Expected: clean. A missing `DispatchClass` `"D.13"` member would surface as a type error where an adoption `GateRecord` sets `dispatchClass: 'D.13'`.

## Verify: playbook drift audit

The drift audit is the source-of-truth verification for the auto.md edits:

```bash
pnpm --filter @generacy-ai/claude-plugin-cockpit test playbook-verification
```

Expected: green, including rows 500-5, 500-7, 500-9. If an auto.md edit breaks an unrelated pin, **re-pin it to the new contract string** — never weaken or delete the assertion (per CLAUDE.md "Cockpit playbook pins").

## Verify: behavior (dogfood — gated on generacy#1163)

Live gate-verb acceptance requires the engine-side `GateTypeSchema` enum (generacy-ai/generacy#1163) and an engine at `>= 0.2.0`. Once available:

1. **US1 — gate reaches the inbox (UI mode)**: drive an issue to `waiting-for:remediation-limit` with `runIdEnabled` both true and false. Confirm `cockpit_gate_status` / `cockpit_gate_open` accept `gateType: remediation-limit` (no `invalid-args`) and a gate with the remaining findings appears in the operator inbox.
2. **US2 — restart recovery (both modes)**: park an issue at `waiting-for:remediation-limit`, restart `auto`, and confirm the startup sweep dispatches or adopts a D.13 gate without waiting for an unrelated event.
3. **US3 — recognised state**: confirm a `waiting-for:remediation-limit` doorbell line dispatches to D.13 and D.10 unknown-state escalation does NOT fire.

## Success criteria mapping

| SC | How to check |
|----|--------------|
| SC-001 D.13 gate verbs accepted | UI-mode dispatch test at `waiting-for:remediation-limit` (post-#1163). |
| SC-002 Gate reaches inbox | End-to-end UI-mode run. |
| SC-003 Restart recovery | Restart test with a parked issue. |
| SC-004 No unknown-state misroute | Classification test — D.10 does not fire. |
| SC-005 Both schema sides land | Cross-repo verification with generacy#1163. |
| SC-006 Playbook pins re-pinned | `playbook-verification.test.ts` green (rows 500-5/7/9). |

## Troubleshooting

- **`tsc` error on `dispatchClass: 'D.13'`** → the `DispatchClass` union edit (FR-007) is missing.
- **Gate verbs return `invalid-args` for `remediation-limit`** → expected until generacy#1163 lands the MCP `GateTypeSchema` enum; the `MIN_GENERACY_VERSION=0.2.0` pre-flight probe sequences this.
- **`playbook-verification` fails on an unrelated row** → an auto.md edit shifted pinned text; re-pin to the new string, do not weaken.
- **Parked `remediation-limit` issue still invisible after restart** → the base sweep edit (FR-003) did not land in the D.1–D.9 enumeration at `auto.md:333`.
