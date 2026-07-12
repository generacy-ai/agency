<!--
Drift fixture for finding #410.
This is a MINIMAL FIXTURE reproducing the pre-#410 state of commands/auto.md D.7
(one unified dispatch path; no sub-path split; no verdict-schema addendum;
no rule anchor; no sixth-element row on the escalation-gate presentation).

The audit (410-2) feeds this file through auditD7 and asserts at least one of
the structural fields is false — proving the audit's logic isn't vacuous.

DO NOT reintroduce any of the post-fix properties into this file. The fixture's
value is their ABSENCE (see specs/410-found-during-cockpit-v1/contracts/
negative-fixture-shape.md).
-->

## Dispatch

### D.7 — `agent:error` / `failed:*` → escalation gate (Requeue path)

**Trigger**: An issue enters `agent:error` or any `failed:*` state. Verbatim event strings: `agent:error` and `failed:` (matching any `failed:<subtype>`).

**Dispatch**:
1. **Fetch evidence** — the parent's sole evidence-fetch tool is `cockpit_context(issue=<issue-ref>)`. No ad-hoc `gh` chains, no link-following. The return payload is whatever the engine bundle returns.
2. **Spawn diagnosis subagent** — dispatch to a general-purpose subagent. Return contract: a single JSON value `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}`.
3. **Present escalation gate** (see § Gate contract G.4b).
4. **Apply verdict**: Requeue / Skip / Stop.

## Gate contract

### G.4 — Escalation gate

**(b) `agent:error` / `failed:*`**:

```
Agent error on <issue-ref>:

**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Current state:** <observed state>
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)
```

<!-- No sub-path split on step 1, no verdict-schema addendum on step 2, no rule anchor, no sixth-element row on the escalation-gate presentation. The audit MUST report at least one structural failure on this file. -->
