# Contract: Up-front ref validation

Pins the `gh api` probe shape and the aggregated-error diagnostic format for Form 4's per-ref existence check. Answers Q4=A of `clarifications.md` verbatim.

## V1 — Probe shape

For each `QualifiedRef` in `ResolvedRefSet.refs`, invoke:

```
gh api -X GET repos/<owner>/<repo>/issues/<number> --silent --include
```

`--silent` suppresses the JSON body (we don't need it — existence is the signal); `--include` prints the response headers so the caller can read the status code. Exit code is the primary signal:

- `0` and the response `HTTP/1.1 200` (or `301` — GitHub redirects renamed repos) → `RefValidationHit`.
- Non-zero, OR any other status (`404`, `403`, `410`, `5xx`) → `RefValidationMiss`.

**Reason string extraction**: parse the first HTTP status line from `--include` output; render as `<status> <phrase>` (e.g., `404 Not Found`, `403 Forbidden`). On `403`, append ` — token lacks access` (common cause for cross-repo probes with a scoped PAT).

## V2 — Batch execution

Probes run **sequentially** (not parallel). Rationale:

- Simplicity: no `xargs -P` or subshell backgrounding to error-check.
- GitHub abuse-detection: parallel bursts on the same REST endpoint can trigger secondary rate limits. Sequential probes stay well under the 5000-request/hour PAT budget even for large ref lists (a 20-ref list = 20 requests, ~2s total wall time).
- Cost: negligible. Real ref lists in practice are 1–20 refs.

Ordering: match `ResolvedRefSet.refs` order (first-seen), so the diagnostic's bad-ref list reads in operator-supplied order.

## V3 — Aggregation rule (Q4=A verbatim)

Do NOT short-circuit on the first miss. Probe every ref, then decide.

- All hits → return `RefValidationResult { ok: [...], bad: [] }` → Form 4 proceeds to reuse detection.
- Any miss → return `RefValidationResult { ok: [...], bad: [...] }` → Form 4 prints the aggregated diagnostic and exits.

## V4 — Diagnostic shape (aggregated)

Exactly this shape (whitespace and punctuation pinned; test 444-4 greps for it):

```
Cannot create tracking issue — the following refs are missing or inaccessible:

  - <owner>/<repo>#<n>   (<reason>)
  - <owner>/<repo>#<n>   (<reason>)
  ...

Fix or remove these refs and re-run.
```

Where:
- `<owner>/<repo>#<n>` is always the fully-qualified form (never bare), so the operator can copy-paste the exact ref that failed.
- `<reason>` is the E7 `reason` field (`"404 Not Found"`, `"403 Forbidden — token lacks access"`, `"5xx server error"`, etc.).
- Refs render in `ResolvedRefSet.refs` order (matches operator input order after dedup).
- Blank lines around the ref list are present in the output (readability).

**Do NOT** print the list of good refs — the operator does not need it, and printing it invites confusion ("`#223` succeeded but nothing happened?"). The `Fix or remove these refs and re-run.` trailer makes clear that ONE bad ref stopped everything.

## V5 — Failure exit rule

`bad.length > 0` → exit non-zero **without creating anything**:
- No `gh issue create` fires.
- No `cockpit:tracking` label is created (if it did not exist).
- No ledger file / directory is created.
- No `Tracking ref:` header is printed to the transcript.

Match Form 3's pattern where G.6 skip also creates nothing.

## V6 — Non-goals

- **No retry.** A transient `5xx` prints the same aggregated diagnostic; the operator re-runs. Retrying inside Form 4 would silently mask engine-scale outages that the operator should know about.
- **No caching.** Each invocation re-probes. The cost is bounded (V2) and correctness beats cache-hit-rate at this scale.
- **No permission-check pre-probe.** `gh auth status` already ran in pre-flight; a per-repo permission probe is what the 200/403 status IS.
