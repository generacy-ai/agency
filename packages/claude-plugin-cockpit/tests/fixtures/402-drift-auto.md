<!--
Drift fixture for finding #402.
This is a MINIMAL FIXTURE reproducing the pre-#402 state of `commands/auto.md`
(missing the `## AskUserQuestion invocation contract` section, G.1 carrying the
pre-fix `never ceil(N/4)` phrasing). The audit (`402-2`) feeds this file through
the same structural check as `402-1` and asserts `sectionExists: false`.

DO NOT add `## AskUserQuestion invocation contract` to this file. The fixture's
value is its ABSENCE of the section.
-->

## Gate contract

### G.1 — Clarification batch gate

**Presentation**: (elided — irrelevant to the drift audit).

**Gate invocation**: **Exactly one** `AskUserQuestion` call per batch in the same response (never `ceil(N/4)`, never per-question). Parameters:
- **Question text**: `Post all <N> drafted answers to <issue-ref>?`
- **Header**: `Clarify` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, discrete, in this order):
  1. `Approve all & post (Recommended)`
  2. `Make changes`
  3. `Skip this batch`

<!-- No `## AskUserQuestion invocation contract` section follows. The audit MUST report sectionExists=false on this file. -->
