# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-07-21 15:37

### Q1: Title truncation rule
**Context**: FR-007 says the tracking-issue title `Tracking: auto session YYYY-MM-DD — #N1 #N2 …` is 'truncated sensibly for long lists', but the concrete rule is not specified. Implementation needs a fixed threshold and a defined suffix so the title stays under GitHub's 256-char limit and remains scannable.
**Question**: What truncation strategy should be applied to the tracking-issue title when the ref list is long?
**Options**:
- A: Include up to 5 refs, then append ` (+K more)` where K is the remaining count. Example: `Tracking: auto session 2026-07-21 — #223 #224 #226 #227 #228 (+3 more)`.
- B: Include up to 3 refs, then append ` (+K more)`.
- C: Include all refs, but hard-cap the title at 200 chars and append `…` if truncated.
- D: Drop the ref list entirely from the title once count > 5 and use `Tracking: auto session YYYY-MM-DD — N issues` instead.

**Answer**: *Pending*

### Q2: Re-invocation duplicate handling
**Context**: If an operator runs `/cockpit:auto 512 513` twice (e.g. after the first run crashed, or by accident), the spec does not say whether the second invocation should reuse the existing open tracking issue, create a fresh one, or refuse. This affects idempotency, wasted work, and operator confusion when two tracking issues target the same refs.
**Question**: How should Form 4 behave when an open tracking issue in the workspace repo already contains the same set of resolved refs?
**Options**:
- A: Always create a fresh tracking issue; leave any prior open one alone. Operator is responsible for closing stale sessions.
- B: Detect an open tracking issue with an identical ref-set and reuse it (proceed as `--tracking <existing-ref>`). Print a notice that the session is being resumed.
- C: Detect any open tracking issue whose ref-set overlaps with the new refs and refuse, telling the operator to close it or use `--tracking` explicitly.
- D: Skip detection entirely — treat every Form-4 invocation as new, matching current Form-3 `--new` behavior.

**Answer**: *Pending*

### Q3: Duplicate token dedup
**Context**: If the operator passes `/cockpit:auto 512 512` or `/cockpit:auto 512 generacy-ai/agency#512` (bare + qualified pointing to the same issue), the spec is silent on whether the two tokens should be deduped in the tracking-issue body, or if duplicates should error out.
**Question**: How should duplicate refs within a single invocation be handled?
**Options**:
- A: Silently dedupe after resolution — the tracking-issue body lists each unique ref once, in first-seen order.
- B: Preserve duplicates in the body as written; let the engine reject/handle them downstream.
- C: Reject the invocation with a diagnostic that names the duplicate token(s) — do not create any issue.

**Answer**: *Pending*

### Q4: Referenced issue existence
**Context**: The spec does not say whether Form 4 verifies that each referenced issue actually exists in its repo before filing the tracking issue. Skipping validation is faster but produces tracking issues that reference non-existent numbers, which the engine may or may not surface gracefully.
**Question**: Should Form 4 validate that every referenced issue exists (via `gh api` or MCP lookup) before creating the tracking issue?
**Options**:
- A: Validate all refs up front; if any is missing/inaccessible, exit with a diagnostic naming the bad ref(s) and do not create the tracking issue.
- B: Skip validation — file the tracking issue as-is and let the engine surface any bad refs during its first scope pass.
- C: Validate only bare-number refs against the workspace repo (the ones we just resolved), but pass qualified cross-repo refs through unchecked.

**Answer**: *Pending*

### Q5: Malformed comma-split tokens
**Context**: FR-001 splits args on commas and whitespace. Inputs like `/cockpit:auto 512,,513`, `/cockpit:auto 512, ,513`, or a trailing comma produce empty tokens. The spec doesn't say whether empty tokens are silently discarded or trigger the FR-002 'reject anything else with usage' path.
**Question**: How should empty tokens produced by comma/whitespace splitting be handled?
**Options**:
- A: Silently discard empty tokens; process the remaining non-empty tokens normally.
- B: Treat empty tokens as a malformed invocation — print usage and exit before any resolution or issue creation.

**Answer**: *Pending*

