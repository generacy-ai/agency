# Contract: D.5 `waiting-for:implementation-review`-absent merge guard

**Applies to**: `auto.md` § D.5 (`completed:validate` (checks green) → merge without gate),
`auto.md:813-831`. Governs FR-001, FR-002, SC-001, SC-002.

## Guard rule

D.5 MUST NOT merge while `waiting-for:implementation-review` is co-present with
`completed:validate`. The guard is evaluated after the `checks` verdict resolves green
and before `cockpit_merge` is called.

```
resolve checks verdict            # existing (E4 / fallback)
  checks red        → D.6
  checks not green  → (existing fallback)
  checks green      → evaluate label guard:            # NEW
      waiting-for:implementation-review present   → DEFER (no merge)
      waiting-for:implementation-review absent    → merge (existing step 2)
      label state non-decisive                    → fail-safe re-query:
          cockpit_status(issue=<issue-ref>, json=true)
          confirmed absent → merge
          present          → DEFER
          still non-decisive / error → DEFER (fail safe)
```

## Label source of truth

- **Primary**: the enriched doorbell line's `labels` field (§ Enriched-line dispatch
  contract E3/E4).
- **Fail-safe**: when `labels` is absent, bare, or malformed (non-decisive), a single
  authoritative `cockpit_status(issue=<issue-ref>, json=true)` re-query. This mirrors the
  existing `checks` fallback in D.5 step 1 — prefer folding the label check into the same
  re-query when the `checks` fallback already fires, to avoid a second round-trip.
- Absence-of-signal is NEVER treated as absence-of-gate (Q1=A).

## Deferral behavior (passive no-op)

On DEFER:
- Write the D.5 ledger row with outcome token `deferred: implementation-review pending`.
- Drop the event. Do NOT call `cockpit_merge`. Do NOT call `cockpit_gate_open`. Do NOT
  invoke the G.8 presentation path. Write NO label (add-only advance invariant §3).
- G.8 is presented by the co-present `waiting-for:implementation-review` transition, which
  is D.3's own trigger. `approve` at G.8 performs the merge via the cockpit merge path
  (`auto.md:1494`).

## Unchanged legacy path

When `waiting-for:implementation-review` is confirmed absent, D.5 merges on
`completed:validate` + green exactly as before (`cockpit_merge(issue=<issue-ref>)`,
squash, branch delete). No regression (SC-002).

## Ledger line

```
<issue-ref> · completed:validate · merge · <outcome>
```

Outcome enum, extended with the deferral token:

`merged (PR #<n>)` | `deferred: implementation-review pending` | `blocked: missing-approval`
| `blocked: draft` | `blocked: pending` | `blocked: missing-label`
| `infrastructure failure — <checks>`

## Invariants preserved

- **Never merge on red** (invariant §1) — the guard runs only on the green path.
- **No-gate row** — D.5 never calls `cockpit_gate_open`; deferral does not change that.
- **437-5 negative pin** — no "defer this wake" / "defer on pending" phrasing; the
  `deferred: implementation-review pending` token does not match `/defer\s+(this\s+wake|on\s+pending)/i`.
- **437-5 positive pin** — D.5 still names both `absent` and `pending` as `checks`
  fallback triggers.
