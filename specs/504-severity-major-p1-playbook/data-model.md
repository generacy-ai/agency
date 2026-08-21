# Data Model: D.5 merge-past-G.8 guard + remediation-limit findings-fetch contract

This feature adds no new runtime types. The "data model" here is the set of contracts
the playbook prose must describe exactly: label states it reads, the ledger outcome
enum it extends, and the engine artifact it parses. Each is fixed by an engine or client
source and must be pinned verbatim.

## E1 — D.5 dispatch decision inputs

The D.5 row reads three fields from the enriched doorbell line (§ Enriched-line dispatch
contract E3/E4), plus one derived label check added by this feature:

| Field | Source | Values | Role |
|-------|--------|--------|------|
| `to` | enriched line | label string | the transition (`completed:validate`) |
| `labels` | enriched line | list \| absent \| bare \| malformed | co-present label set |
| `checks` | enriched line | `green` \| `red` \| `pending` \| absent | merge gate verdict (existing) |
| `waiting-for:implementation-review` present? | `labels`, or fallback re-query | present \| absent \| non-decisive | **NEW** merge guard |

**Decisiveness of the label guard** (mirrors the `checks` fallback):

| `labels` state | `waiting-for:implementation-review` verdict | D.5 action |
|----------------|---------------------------------------------|------------|
| present in `labels` | co-present with `completed:validate` | **defer** (no merge) |
| absent from a well-formed `labels` list | confirmed absent | merge (existing path) |
| labels absent / bare / malformed line | **non-decisive** | fail safe → `cockpit_status(json=true)` re-query; merge only if confirmed absent |

## E2 — D.5 ledger outcome enum (extended)

Existing outcomes on the D.5 ledger line (`<issue-ref> · completed:validate · merge · <outcome>`):

- `merged (PR #<n>)`
- `blocked: missing-approval`
- `blocked: draft`
- `blocked: pending`
- `blocked: missing-label`
- `infrastructure failure — <checks>`

**Added by FR-002**:

- `deferred: implementation-review pending` — passive no-op; D.5 writes the row and drops
  the event. Constraints: this token must NOT match the 437-5 negative regex
  `/defer\s+(this\s+wake|on\s+pending)/i` (it does not — no whitespace follows `defer`),
  and the deferral writes NO label and calls NO gate verb.

## E3 — Remediation-limit findings artifact (engine-authored)

The engine writes findings as a **plain GitHub issue comment** on the linked issue
(`phase-loop.ts:1411-1421`). Contract the client parses:

| Element | Contract | Strictness |
|---------|----------|------------|
| Heading | body `startsWith` `## Remediation limit reached` | exact, case-sensitive |
| Bullet | `- <file>:<line> — <title>` (one per finding) | em-dash `—` separator |
| Comment selection | single most-recent by `createdAt` among matching comments | deterministic |
| Fallback | no matching comment → render `(none)` | explicit empty state |

**Retrieval**: `gh issue view <issue-ref> --json comments` → filter `comments` by the
`startsWith` predicate → pick max `createdAt`. Identical in local and UI gate modes;
the source is the issue comment, never the gate record (`cockpit_gate_status` returns
`{gateId, status}` only, no findings).

## E4 — G.8 presentation table (unconditional `(none)`)

G.8 has no findings artifact on either path. Its presentation table keeps exactly one
body row, byte-for-byte:

```
| (none) | | | |
```

No JSON-regenerated findings table; no gate-body parse.

## E5 — `cockpit.auto.agents` role-selector keys

Per-role `{model, effort}` selector keys after this change:

`default` / `clarifier` / `reviewer` / `validator` / `diagnoser`

`fixer` is **removed** — no playbook path spawns a `cockpit-fixer` subagent (red validate
is engine-owned per `auto.md:841`).

## E6 — `DRIFT_GUARD_UNRESOLVABLE_GATE_TYPES` docstring rows

The `gate-status-check.ts:164-165` docstring enumerates the dispatch rows that open the
`escalation` gateType. After this change it names only the **live** escalation rows:

- D.7 (G.4b)
- D.10 (G.4c)
- D.11 (G.4d)

The removed **D.6 (G.4a)** row is dropped — D.6 is now ledger-only and opens no gate.
This is a comment-only edit; the `Set` value (`["escalation"]`) is unchanged.
