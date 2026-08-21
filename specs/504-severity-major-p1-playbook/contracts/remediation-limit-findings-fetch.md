# Contract: remediation-limit findings retrieval (D.13 / G.9)

**Applies to**: `auto.md` § D.13 (`waiting-for:remediation-limit`, `:1035-1054`) and
§ G.9 (Remediation-limit gate, `:1502-1518`). Governs FR-003, FR-004, SC-003.

## Source of truth

The engine writes the remaining (non-converged) findings as a **plain GitHub issue
comment** on the linked issue (`phase-loop.ts:1411-1421`). The gate record carries no
findings — `cockpit_gate_status` returns `{gateId, status}` only — so the comment is the
sole source in BOTH local and UI gate modes.

## Retrieval procedure

```
gh issue view <issue-ref> --json comments
  → comments: [{ body, createdAt, ... }, ...]
  → candidates = comments where body startsWith "## Remediation limit reached"   # exact, case-sensitive
  → if candidates empty        → render (none) fallback
  → else selected = max(candidates, by createdAt)                                 # single most-recent
  → parse selected.body bullets: "- <file>:<line> — <title>"                      # em-dash separator
  → render parsed findings
```

Identical in local and UI gate modes.

## Selection predicate (exact)

- **Heading anchor**: `body.startsWith("## Remediation limit reached")` — exact,
  case-sensitive `startsWith` (NOT `contains`, NOT case-insensitive).
- **Multiplicity**: the engine may write the comment more than once across resume
  cycles; select the SINGLE most-recent by `createdAt`.
- **Fallback**: if no comment matches, render the explicit `(none)` state (do not fail).

## Bullet format contract

```
- <file>:<line> — <title>
```

One bullet per finding. Separator between `<line>` and `<title>` is the em-dash `—`.

## Fallback rendering

When no matching comment exists, G.9 renders the explicit empty state (mirroring the
G.8/G.9 `| (none) | | | |` row shape). No error, no exception.

## G.8 contrast (FR-005)

G.8 (implementation-review final-approval) has NO findings artifact on either the
post-validate or legacy path (`phase-loop.ts:1435-1453` — the on-ci-green branch posts no
comment). G.8 therefore renders `(none)` UNCONDITIONALLY and does NOT perform this fetch.
This fetch contract is scoped to the remediation-limit gate (G.9 / D.13) only.

## Downstream (unchanged)

- `resume remediation` → `cockpit_advance(issue=<issue-ref>, gate="remediation-limit")`
  (resets the counter server-side; `cockpit_resume` is the WRONG verb).
- `stop` → exit auto cleanly; no label writes.
- No subagent is spawned — findings come from the engine comment, not a cluster-side
  analyzer.
