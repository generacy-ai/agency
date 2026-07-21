# Contract: Existing-tracking-issue reuse detection

Pins the reuse-detection query, ref-set equality rule, and reuse-notice format. Answers Q2=B verbatim.

## R1 — Workspace repo resolution

Prerequisite for both reuse detection AND bare-number resolution. Runs after `flags.unknown` / `both-flags` checks pass, before per-token resolution begins.

**Command**: `git remote get-url origin` (in the operator's cwd, captured via Bash `pwd` at pre-flight).

**Parse**: Match against three GitHub remote URL shapes:

| Shape | Regex |
|-------|-------|
| HTTPS | `^https://github\.com/([A-Za-z0-9._-]+)/([A-Za-z0-9._-]+?)(?:\.git)?/?$` |
| SSH shorthand | `^git@github\.com:([A-Za-z0-9._-]+)/([A-Za-z0-9._-]+?)(?:\.git)?$` |
| SSH long form | `^ssh://git@github\.com/([A-Za-z0-9._-]+)/([A-Za-z0-9._-]+?)(?:\.git)?$` |

**Failure modes** (all → `Print + exit`):
- `git remote get-url origin` exits non-zero (not a git repo, or `origin` unset):
  ```
  /cockpit:auto Form 4 needs a workspace with a GitHub `origin` to resolve bare issue numbers.
  Observed: `git remote get-url origin` failed with: <stderr>
  ```
- URL matches none of the three shapes:
  ```
  /cockpit:auto Form 4 needs a workspace whose `origin` is a GitHub repo. Observed: <originUrl>.
  ```

## R2 — Reuse query

**Command**:
```
gh issue list --repo <workspace.owner>/<workspace.repo> --label cockpit:tracking --state open --json number,body,createdAt
```

**Output**: JSON array of `{ number: int, body: string, createdAt: string }`. Empty array → no candidate → skip to creation.

**Scope**: Query is workspace-repo-scoped only. Cross-repo tracking issues (an operator running `/cockpit:auto 41` in workspace A but with a prior tracking issue in workspace B whose body contains `A/A#41`) are NOT matched. This is intentional: workspace-scope matches operator intuition ("re-invoked in the same checkout") and avoids unbounded query cost.

**Label prerequisite**: If the `cockpit:tracking` label does not yet exist in the workspace repo, this query returns `[]` and Form 4 proceeds to creation, where the label is created before use (see contract `contracts/tracking-issue-body.md § L1`).

## R3 — Body parsing

For each candidate, extract task-list refs from the body:

**Regex** (per line, case-sensitive): `^\s*- \[ \] ([A-Za-z0-9._-]+)/([A-Za-z0-9._-]+)#(\d+)\s*$`

Only fully-qualified refs match; any other markdown (headings, prose, `## Ad-hoc` sections, bare `#N` refs) is ignored. The engine writes exactly this shape at seeding time (contract `contracts/tracking-issue-body.md § B1`), so post-seed hand edits of the ref list are handled sanely (mismatched lines are treated as "not part of the ref-set" — they cannot cause a false-positive reuse).

**Empty parse**: A candidate whose body yields zero refs is skipped (it cannot participate in ref-set equality).

## R4 — Ref-set equality

The candidate's parsed `bodyRefs` and this invocation's `ResolvedRefSet.refs` are compared as sets under `QualifiedRef` equality (E4: `owner`, `repo`, `number` all match; `supplied` field ignored).

**Match iff**:
- `candidate.bodyRefs.length === invocation.refs.length` (fast reject), AND
- Every element of one is in the other (order-agnostic set compare).

**No overlap-based match.** A candidate whose ref-set overlaps but is not identical is NOT a match — Form 4 creates a fresh tracking issue (Q2 verbatim: "Overlapping-but-not-identical ref-sets do NOT trigger reuse or refusal — create a fresh tracking issue").

## R5 — Multiple-match tiebreaker

At most one candidate SHOULD match — the `cockpit:tracking` label + open state + identical ref-set is precise enough that duplicates should not exist. If two open issues match, log a warning to the transcript and reuse the oldest (min `createdAt`, ISO-8601 comparison):

```
Warning: found <N> open tracking issues with identical ref-sets. Reusing the oldest: <owner>/<repo>#<n> (created <YYYY-MM-DD>). Consider closing the newer duplicate(s): <list>.
```

This surface exists as defence-in-depth for pre-#1015 same-scope-claim behavior (per Q2's reference to `generacy-ai/generacy#1015`). Post-#1015 it should be dead code; retain it in the playbook as a diagnostic.

## R6 — Reuse-notice format

Printed BEFORE the standard startup line, on reuse:

```
Resuming existing tracking session <owner>/<repo>#<n> (opened <YYYY-MM-DD HH:MM UTC>) — ref-set matches this invocation exactly.
```

Then the standard startup line follows:
```
Tracking ref: <owner>/<repo>#<n> · form: tracking-existing
```

Note: on reuse, `form` is `tracking-existing`, NOT `tracking-list`. The invocation form is not the identity of the run — the run's identity is the tracking ref, and once found, it IS a Form-2 run (Q2=B "proceed as `--tracking <existing-ref>`").

## R7 — Ledger header on reuse

Ledger header line (first line of the ledger file) on reuse:
```
Tracking ref: <owner>/<repo>#<n> · form: tracking-existing · resumed: <YYYY-MM-DD HH:MM UTC>
```

The `· resumed:` suffix distinguishes a reuse-path run from a first-time Form-2 invocation for post-mortem analysis. Existing Form-2 headers do NOT carry this suffix.

## R8 — Failure modes during reuse detection

If `gh issue list` fails (network, auth expiry, rate limit), Form 4 does NOT silently fall through to creation — that could produce a duplicate tracking issue against operator expectation. Print + exit:

```
Cannot check for existing tracking sessions: `gh issue list` failed with:
  <stderr>
Re-run when connectivity is restored, or invoke with `--tracking <ref>` to bypass reuse detection.
```

The bypass suggestion (`--tracking <ref>`) is deliberate — it gives the operator a Form-2 escape hatch that skips the failing query.
