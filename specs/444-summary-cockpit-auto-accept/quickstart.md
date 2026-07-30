# Quickstart: `/cockpit:auto` Form 4

Operator-facing guide to Form 4 (bare issue-number list) invocation of `/cockpit:auto`. Complements the pre-existing Form 1/2/3 docs in the plugin readme.

## What Form 4 does

Given one or more GitHub issue references, `/cockpit:auto` will:

1. Resolve any bare numbers against the workspace repo's `origin`.
2. Validate every ref exists and is accessible.
3. Either resume an existing open tracking session (if the ref-set matches), or create a fresh tracking issue seeded with your refs.
4. Enter the standard auto loop against that tracking ref — every ref is driven to terminal state through the existing gates.

**When to use it**: whenever you have a small list of issue numbers in mind and don't want to hand-write a tracking issue first. Typical case: "Claude just found two bugs in conversation → file them → process them" (`/cockpit:auto 512 513`).

## Prerequisites

- You are in a git checkout with a GitHub `origin` (HTTPS, SSH shorthand, or SSH long form all work).
- `gh auth status` succeeds (Form 4 uses `gh api` and `gh issue create/list/label`).
- The `Monitor` harness tool is available (unchanged pre-flight requirement from all forms).
- The `generacy` binary is on `PATH` and ships the `doorbell` subcommand (unchanged pre-flight requirement).

## Usage

```
/cockpit:auto <issue-list>
```

Where `<issue-list>` is one or more references, comma- and/or whitespace-separated:
- Bare integer: resolves against the workspace repo (e.g., `512`).
- Qualified: `owner/repo#N` (e.g., `other-org/other-repo#41`).

**Examples**:

```
/cockpit:auto 512
/cockpit:auto 512, 513
/cockpit:auto 512 513 514
/cockpit:auto 512, 513, other/repo#41
/cockpit:auto 512,,513,          # extra commas / trailing commas OK
```

## Expected output (fresh session)

```
Tracking ref: generacy-ai/agency#999 · form: tracking-list
Startup sweep for generacy-ai/agency#999 (3 refs)...
  - generacy-ai/agency#512: waiting-for:spec-review
  - generacy-ai/agency#513: waiting-for:clarification
  - other/repo#41: waiting-for:validate
[dispatch stream continues...]
```

The tracking issue is created in the workspace repo with:
- **Title**: `Tracking: auto session 2026-07-21 — #512 #513 other/repo#41`
- **Body**: flat markdown task list of the three qualified refs.
- **Label**: `cockpit:tracking` (created automatically if the label doesn't yet exist in the repo).

## Expected output (resumed session — Q2=B)

If a prior invocation with the identical ref-set is still open:

```
Resuming existing tracking session generacy-ai/agency#999 (opened 2026-07-21 09:14 UTC) — ref-set matches this invocation exactly.
Tracking ref: generacy-ai/agency#999 · form: tracking-existing
[dispatch stream continues from wherever the prior session left off...]
```

**When reuse fires**: same set of refs (order-agnostic; bare/qualified equivalence resolved), single workspace repo, open `cockpit:tracking`-labeled issue.

**When reuse does NOT fire**: overlapping-but-not-identical ref-sets (e.g., prior session had `[512, 513]`, this invocation has `[512, 513, 514]`) → a fresh tracking issue is created. Both sessions run independently.

## Common errors

### Not a GitHub workspace
```
/cockpit:auto Form 4 needs a workspace with a GitHub `origin` to resolve bare issue numbers.
Observed: `git remote get-url origin` failed with: fatal: not a git repository (or any of the parent directories): .git
```
**Fix**: `cd` into a git checkout with a GitHub `origin` set, or invoke with only qualified refs (which don't need workspace inference) — but Form 4's workspace check runs first, so even a qualified-only invocation fails outside a git repo.

### Non-GitHub origin (GitLab, self-hosted, etc.)
```
/cockpit:auto Form 4 needs a workspace whose `origin` is a GitHub repo. Observed: git@gitlab.example.com:owner/repo.git.
```
**Fix**: Form 4 is GitHub-only by design (the entire cockpit stack targets GitHub). Use a workspace whose `origin` points at GitHub.

### One or more refs missing / inaccessible
```
Cannot create tracking issue — the following refs are missing or inaccessible:

  - generacy-ai/agency#9999   (404 Not Found)
  - other/repo#12             (403 Forbidden — token lacks access)

Fix or remove these refs and re-run.
```
**Fix**: Remove the bad refs from your invocation, or fix the underlying issue (typo, closed repo, missing PAT scope) and re-run. No tracking issue is created when any ref is bad — the entire invocation is atomic (Q4=A).

### Empty invocation
```
Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>" | <issue-list>
...
```
**Fix**: Pass at least one non-empty token. `/cockpit:auto 512` is the minimum valid Form 4 invocation.

### Unknown flag typo
```
Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>" | <issue-list>
Reason: unknown-flag (--tracing)
...
```
**Fix**: Form 4 rejects any `--*` token that isn't a recognized flag. Common typos: `--tracing`, `--traking`. Fix the flag or drop it (bare-number invocation needs no flags).

## Available commands (recap)

All four `/cockpit:auto` invocation forms:

| Form | Invocation | Behavior |
|------|-----------|----------|
| 1 | `/cockpit:auto owner/repo#N` | Epic mode. Exits on `epic-complete`. |
| 2 | `/cockpit:auto --tracking owner/repo#N` | Epic-less: existing tracking issue. |
| 3 | `/cockpit:auto --new "title"` | Epic-less: file a fresh tracking issue via G.6 gate. |
| **4** | **`/cockpit:auto <issue-list>`** | **Epic-less: reuse-or-create tracking issue from a ref list.** |

The tracking ref is the run's identity under Forms 2/3/4; Form 4's `tracking-list` value appears in the ledger `form:` header only for grep-based post-mortem — from the operator's perspective, the loop behaves exactly like `--tracking`.

## Troubleshooting

**Q: The reuse notice fired but I wanted a fresh session.**
Close the pre-existing tracking issue (or remove its `cockpit:tracking` label) and re-run. Alternatively, add or remove one ref from your invocation — the ref-set match is exact, so any difference bypasses reuse.

**Q: My tracking issue has the wrong title / label.**
Titles are generated from the resolved ref-set + UTC date; you can rename the tracking issue in GitHub after creation without breaking anything (reuse detection reads the body, not the title). The `cockpit:tracking` label is load-bearing for reuse — don't remove it if you want future re-invocations to resume.

**Q: `gh issue list` returned 5xx during reuse detection.**
Form 4 does not silently fall through to creation (that could duplicate work). Re-run when connectivity is restored, or use `--tracking <ref>` to bypass reuse detection if you know the tracking ref.

**Q: I want inline phase grouping in the body.**
Not supported (spec § Out of scope). Form 4 seeds flat scope; mid-run `cockpit_scope_add` still lands in `## Ad-hoc` per existing behavior.

**Q: Can I run two Form 4 sessions in parallel over overlapping refs?**
Yes — the same-scope-claim guard (per `generacy-ai/generacy#1015`) is a separate concern owned by the cluster worker lease. Form 4's reuse-detection is scope-identity-based, not scope-overlap-based.
