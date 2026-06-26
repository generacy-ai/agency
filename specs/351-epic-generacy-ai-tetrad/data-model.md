# Data Model: /cockpit:watch slash command

**Feature**: 351-epic-generacy-ai-tetrad
**Date**: 2026-06-26

This feature ships one markdown playbook, not runtime code. The "data model" is the shape of the records the playbook reads (transitions, policy mappings) and the in-memory structure it maintains (the dedupe seen-set).

## Entities

### E1: Transition record (one line from `generacy cockpit watch`)

A single JSON object emitted on stdout per state transition observed by `generacy cockpit watch`. The playbook reads one of these per `Monitor` notification.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `repo` | string | yes | `owner/repo` form, e.g. `generacy-ai/agency`. |
| `kind` | string | yes | `issue` \| `pr` (extensible by #787; the playbook treats unknown values as actionable transitions, not as errors). |
| `number` | integer | yes | Issue or PR number within `repo`. |
| `from` | string \| null | yes | Prior label/state. `null` indicates a baseline state-sync line (see Validation). |
| `to` | string | yes | New label/state. |
| `at` | string | no | ISO-8601 timestamp the transition was observed by `generacy cockpit watch`. Not used for dedupe (per Q1-B). |
| `source` | string | no | Free-form provenance from `generacy cockpit watch` (e.g. `"webhook"`, `"poll"`). Pass through to notifications; not used for control flow. |

**Validation rules**:
- Each line MUST be valid JSON. Malformed lines MUST be logged inline and skipped — they must NOT crash the watch loop.
- `from === null` MUST be classified as **state-sync**: recorded in the seen-set but never dispatched and never surfaced as a user notification (Q1).
- `from === "X"` and `to === "X"` (a same-state echo) MUST be skipped — it isn't a transition.
- Required fields missing → log inline as a malformed line; skip.

### E2: Dedupe id (computed locally, per Q1-B)

```
transition_id = `${repo}:${kind}:${number}:${from}→${to}`
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `transition_id` | string | yes | Composed from E1 fields. Baseline lines use `null→${to}` and live alongside real transition ids in the same seen-set without colliding. |

**Validation rules**:
- IDs are case-sensitive and whitespace-significant; the playbook MUST NOT normalize.
- The id is scoped to the current `/cockpit:watch` invocation only. There is no persistence (Q1).

### E3: Seen-set (in-memory)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `seen` | `Set<transition_id>` | yes | Holds every transition id (including baselines) the playbook has processed during this `/cockpit:watch` invocation. |

**Validation rules**:
- Membership check happens BEFORE the policy lookup or any dispatch — dedupe is the first gate after baseline classification.
- Insertion happens AFTER successful classification (baseline or actionable) but does not depend on the dispatch succeeding — a failed dispatch should not cause a duplicate fire on the next emission of the same transition.
- The set is unbounded for the loop's lifetime; expected transition volume per epic is low enough that bounding is not required for this issue.

### E4: Autonomy policy entry (consumed; defined upstream by G1.1–G1.3, A1.4)

A mapping from a transition class to an action. The playbook reads one mapping per transition; the resolver shape is owned upstream and may evolve. The playbook only requires the minimum surface below.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `mode` | `"auto"` \| `"notify-only"` | yes | Action to take. Missing mapping → playbook treats as `"notify-only"` per Q2-A. |
| `command` | string | conditional | Required when `mode === "auto"`; the `/cockpit:*` slash command to invoke (e.g. `"/cockpit:clarify"`). |
| `args_template` | string | no | Optional template for the dispatched command's argument string (e.g. `"<repo>#<number>"`). If omitted, the playbook passes `<repo>#<number>` by default. |

**Validation rules**:
- `mode === "auto"` with no `command` MUST be treated as a configuration error: degrade to `"notify-only"` and emit the notification with an inline `policy-error:` marker so the developer notices.
- `command` MUST start with `/cockpit:` — non-cockpit dispatch is out of scope for this issue.
- Unknown extra fields MUST be ignored (forward-compatibility with upstream evolution).

### E5: Inline notification message (emitted to the chat)

The user-visible artifact when the policy resolves to `notify-only` (or when an unmapped transition falls back to it per Q2-A).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `transition_id` | string | yes | The same id from E2 — lets the developer correlate notifications with logs. |
| `summary` | string | yes | One-line human-readable rendering of E1. |
| `policy` | string | yes | `"notify-only"` or `"unmapped"`. |
| `suggested_command` | string | no | If the developer might want to take an action, the playbook may suggest `/cockpit:<verb> <ref>`. Optional. |

**Validation rules**:
- Exactly one notification per actionable transition (Acceptance criterion + Q1 dedupe).
- Baseline lines (E1.from === null) MUST NOT produce notifications.

## Relationships

```
generacy cockpit watch (stdout)
        │
        │  one JSON line per emission
        ▼
   E1: Transition record
        │
        │  if E1.from === null → record in E3, stop here (baseline / state-sync, Q1)
        │  else → compute E2 (transition_id)
        ▼
   E2: Dedupe id
        │
        │  membership check against E3 (seen-set)
        │  if already in E3 → drop silently
        │  else → add to E3, look up E4
        ▼
   E4: Autonomy policy entry
        │
        ├── mode === "auto"        → invoke E4.command with args
        └── mode === "notify-only" → emit E5 (inline notification)
            (unmapped also routes here, per Q2-A)
```

## Cross-document invariants

- The `repo:kind:number:from→to` id format MUST be identical between the playbook (E2) and `contracts/transition.schema.md`. Any change requires updating both.
- The playbook MUST consume only the fields listed in E4; new resolver fields must be additive.
- The set of "transitions a developer might see" is open-ended — neither E1.kind, E1.from, nor E1.to should be hardcoded as enums in the playbook.
- Baseline classification (E1.from === null) is the only place the playbook short-circuits before dedupe; this is load-bearing for the "watch restart re-syncs without re-firing" UX from Q1.
