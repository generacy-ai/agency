# Data Model: Inline-thread request-changes contract

The guardrail is a shell-composed pipeline, but the shapes flowing between its stages are worth pinning down. All types are logical (not TS/JSON-schema files); the executor is a markdown playbook.

## Finding

Emitted by the review-verdict analyzer subagent (SB.2 return, unchanged).

```
Finding {
  file: string           // repo-relative path, e.g. "src/api/handler.ts"
  line: number | null    // 1-indexed source line; null when the analyzer has no anchor
  summary: string        // one-line finding text, ≤ 200 chars typical
  failure_scenario: string  // the "why this matters" leg posted below `summary`
}
```

**Validation**: `file` non-empty; `line` positive integer or null; `summary`/`failure_scenario` non-empty. A returned array MAY be empty (`[]`) — that path still fires the verdict gate with `Suggested decision: approve`.

## DiffHunk

Derived by the guardrail from `gh pr diff <ref>` output. One entry per hunk header per file.

```
DiffHunk {
  file: string           // path from the `+++ b/<path>` line
  headStart: number      // C in `@@ -A,B +C,D @@`  (1-indexed)
  headCount: number      // D in `@@ -A,B +C,D @@`
}
```

The head range is `[headStart, headStart + headCount - 1]` inclusive.

## AnchorCheck

The pre-validation output — one per input `Finding`.

```
AnchorCheck {
  finding: Finding
  status: "anchored" | "unanchored"
  reason: "analyzer-supplied-null"     // finding.line was null
        | "outside-diff-hunks"          // finding.line non-null but no matching hunk
        | "inside-diff-hunk"            // finding.line non-null and inside a hunk
}
```

**Rule**: `status = "anchored"` iff `finding.line != null` AND `∃ h ∈ hunks: h.file == finding.file ∧ h.headStart ≤ finding.line ≤ h.headStart + h.headCount - 1`. Everything else is `"unanchored"`.

## InlineComment

One entry per `AnchorCheck` whose `status == "anchored"`; goes into the `comments[]` array of the `gh api ... /reviews` POST.

```
InlineComment {
  path: string        // finding.file
  line: number        // finding.line
  body: string        // `${finding.summary} — ${finding.failure_scenario}`
  // side defaults to RIGHT; do not set side or start_line (single-line anchors only)
}
```

## UnanchoredBlock

Rendered into the review body under the stable marker.

```
UnanchoredBlock {
  marker: "<!-- generacy-cockpit:unanchored-findings -->"
  header: "## General findings (no file anchor)"
  entries: UnanchoredEntry[]
}

UnanchoredEntry {
  index: number             // 1-based within the block, for the `### Finding <n>` sub-header
  finding: Finding
  reason: "analyzer-supplied-null" | "outside-diff-hunks"
}
```

The rendered markdown per entry:

```markdown
### Finding <index>
**Finding:** <finding.summary>
**Failure scenario:** <finding.failure_scenario>
_reason: <human-readable form of reason>_
```

## ReviewPostBundle

The full payload the guardrail hands to `gh api`.

```
ReviewPostBundle {
  event: "COMMENT"                     // never REQUEST_CHANGES (self-PR rule)
  body: string                         // header line + optional UnanchoredBlock
  comments: InlineComment[]            // anchored entries
}
```

**Body composition** (in order, single blank line between sections):

1. `<total> finding(s) requiring changes; see inline comments.` (header line — total = anchored + unanchored)
2. If `unanchored.length > 0`: the `UnanchoredBlock` rendered as above.
3. Nothing else.

If `comments.length == 0` AND `unanchored.length == 0`, the guardrail does NOT execute the POST — the verdict was `request-changes` on zero findings, which is a contract violation (the analyzer returned `[]` or the operator selected `request-changes` inappropriately). Fall through to Error handling.

## PostcondCounts

The two-leg postcondition — computed after the POST returns.

```
PostcondCounts {
  expectedAnchored: number            // == bundle.comments.length
  acceptedByPost: number              // POST response's returned `comments[].length`
  freshUnresolvedThreads: number      // reviewThreads(first:50) filtered to createdAt >= POST timestamp
                                       // AND author == bot AND isResolved == false
}
```

**Success**: `acceptedByPost == expectedAnchored AND freshUnresolvedThreads >= expectedAnchored`.

**Failure classes**:
- `acceptedByPost < expectedAnchored` → POST-side rejection (probably a 422 on a specific entry that slipped past pre-validation — flag as an anchor-check bug).
- `acceptedByPost == expectedAnchored AND freshUnresolvedThreads < expectedAnchored` → accepted-but-invisible; this is the exact snappoll failure mode.

## RetryLedgerEntry

Emitted on the first postcondition failure. Not a data type per se — a fixed ledger-line shape.

```
`<issue-ref> · waiting-for:<gate> · review-post-retry · attempt=1 · reason=<mismatch summary>`
```

Followed by (on success) `... · postcondition-passed · attempt=2` or (on failure) `... · postcondition-failed · re-present-gate`.

## Thread resolution

**Not** modeled as a data type in this branch — it lives on the re-review step which is out of the current spec's file-change scope (the re-review reads `reviewThread.isResolved` on entry; the fix-loop replies in-thread; neither writes). Documenting the contract:

- `resolveReviewThread` is called **only** by the re-review step (D.2/D.3 on a repeat entry), after it verifies the finding is genuinely addressed by the current PR HEAD.
- The fix-loop agent MAY post a `PullRequestReviewThread` reply comment via `gh api ... /replies` — this is the existing acknowledgement mechanic — but MUST NOT call `resolveReviewThread`.
- The re-review's skip rule: for each finding, look up its thread by `path:line`; if `isResolved`, skip the finding's re-verification.

## Relationships

```
Finding[]  ─→  AnchorCheck[]  ─→  ┬─→ InlineComment[]  ─┐
                                  │                     ├─→ ReviewPostBundle ─→ POST ─→ PostcondCounts
                                  └─→ UnanchoredBlock  ─┘
```
