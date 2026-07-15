# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-07-15 17:19

### Q1: Co-occurrence dedup
**Context**: The Assumptions state the two labels co-occur and 'the fix routes the event whichever label the classifier surfaces first.' Once the classifier fix ships, both labels can produce events. If D.11 dispatches on the first-arriving label and the operator resolves it (advance / skip / stop), what should the loop do when the second co-occurring label's event arrives next? This affects whether the operator sees the same gate twice per incident.
**Question**: When both `waiting-for:merge-conflicts` and `blocked:stuck-merge-conflicts` produce events for the same issue, how should the second event be handled after D.11 has already dispatched on the first?
**Options**:
- A: Dedup by issue-ref: once D.11 dispatches for an issue-ref in the current batch/session, subsequent merge-conflict events for the same ref are ledger-only (`already-dispatched`) and skip the gate.
- B: No dedup: each event fires its own D.11 gate; the operator dismisses the redundant one manually (Skip / Stop).
- C: Fire once per label per issue-ref: the operator sees at most one gate for the `waiting-for:*` event and one for the `blocked:*` event; ledger records both.
- D: Out of scope for this fix — the classifier prerequisite hasn't shipped yet, so document the behavior as 'undefined until follow-up' and don't add dedup logic now.

**Answer**: *Pending*

### Q2: Presentation wording
**Context**: FR-003 says the D.11 gate presentation must 'note auto-remedy already failed' when the source label is `blocked:stuck-merge-conflicts`, but doesn't specify the exact wording or placement. The current initial-presentation template (auto.md ~line 685) opens with `Merge conflicts on <issue-ref>:` followed by Root cause / Evidence / Conflicted paths / Suggested decision. An implementer needs an exact string to render.
**Question**: What exact form should the 'auto-remedy already failed' note take in the D.11 presentation block when triggered by `blocked:stuck-merge-conflicts`?
**Options**:
- A: Replace the opening line: `Merge conflicts on <issue-ref> (auto-remedy failed — engine escalated):` (single-line, visible before Root cause).
- B: Add a dedicated field to the five-element block: `**Auto-remedy status:** failed (engine escalated via `blocked:stuck-merge-conflicts`)`, placed above `**Root cause:**`.
- C: Append a trailing note after the resolve-locally instruction: `Note: the engine's auto-remedy has already failed on this conflict; operator resolution is required.`
- D: Prepend a bold callout line above the entire block: `**⚠️ Auto-remedy failed — operator resolution required.**`

**Answer**: *Pending*

### Q3: Subagent context
**Context**: The D.11 diagnosis subagent (auto.md line 381–387) receives `<issue-ref + conflicted-paths payload + gate-option-set directive + return-schema directive>` and returns `{root_cause, evidence, recommended_action, confidence}`. If the source label is `blocked:stuck-merge-conflicts`, the fact that engine auto-remedy has already tried and failed is material information for root-cause diagnosis. The spec doesn't say whether the subagent prompt should be updated to carry this signal.
**Question**: Should the D.11 diagnosis subagent's prompt include the source label (so it knows whether auto-remedy has already failed) and adjust its `root_cause` / `evidence` accordingly?
**Options**:
- A: Yes — pass the source label verbatim in the prompt; the subagent may reference 'auto-remedy already failed' in `root_cause` / `evidence` when the label is `blocked:stuck-merge-conflicts`. Return schema unchanged.
- B: No — the subagent receives the same prompt regardless of source label; the 'auto-remedy failed' framing is a parent-side presentation concern only (per FR-003), and the subagent's diagnosis focuses purely on the conflict content.
- C: Yes and extend the return schema — add an optional `remedy_context: 'auto-failed' | 'plain'` field so the parent can render conditionally without string-sniffing.

**Answer**: *Pending*

### Q4: D.10 trigger text
**Context**: D.10's current Trigger enumerates four sub-cases (a-d); case (d) says 'the `waiting-for:*` label is a token that does not match a Trigger in any § Dispatch row (D.1–D.9c or D.11).' `blocked:stuck-merge-conflicts` is a `blocked:*` label, not `waiting-for:*`, so case (d) technically wouldn't match it — but case (a) 'S8 adds a new transition class the playbook doesn't know' plausibly would (this is how snappoll's 3 fall-throughs happened). FR-005/FR-006 require the fall-through to stop. An implementer needs to know whether D.10's Trigger prose must be explicitly rewritten, or whether extending D.11's Trigger alone is sufficient.
**Question**: Does D.10's Trigger text itself need to be updated to explicitly exclude `blocked:stuck-merge-conflicts`, or is extending D.11's Trigger alone sufficient?
**Options**:
- A: Extending D.11's Trigger is sufficient — the § Dispatch table is the exhaustive routing surface; once D.11 names `blocked:stuck-merge-conflicts`, D.10's 'not one of D.1–D.11' phrasing naturally excludes it. No edit to D.10's prose needed.
- B: Update D.10's Trigger to add an explicit clause: 'blocked:stuck-merge-conflicts is a recognized state that routes to D.11 (see D.11 trigger).' Belt-and-suspenders — safer for future readers.
- C: Update D.10's Trigger to broaden case (d) beyond `waiting-for:*` — e.g., 'any state token (waiting-for:* or blocked:*) that does not match a Trigger in D.1–D.11 fires D.10.' This handles the fix AND documents blocked:* as a recognized state class.

**Answer**: *Pending*

