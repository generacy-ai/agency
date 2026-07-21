# Contract: Tracking-issue title, body, and label

Pins the machine-generated title convention (Q1=A), the fully-qualified flat-body shape (spec § Changes bullet 3), and the label lifecycle. Governs both the shape written at creation time AND the shape parsed at reuse detection.

## L1 — Label lifecycle

**Label name**: `cockpit:tracking` (verbatim; test 444-3 pins this string in auto.md).

**Create-if-absent step** (before any `gh issue create` fires):

```
gh label create cockpit:tracking \
  --color cccccc \
  --description "Auto-created tracking issue for /cockpit:auto" \
  --repo <workspace.owner>/<workspace.repo>
```

Swallow the failure `label already exists` (exit code 1 + specific stderr) — that's the idempotent success case. Any other failure (auth, network) → `Print + exit`:

```
Cannot ensure `cockpit:tracking` label exists on <workspace>: `gh label create` failed with:
  <stderr>
Create the label manually and re-run, or invoke with `--tracking <ref>` if you have an existing tracking issue.
```

**Color**: `#cccccc` (neutral gray) — reads as "meta / synthetic", distinct from workflow labels (typically colored). Value not tested; may be overridden by repo conventions post-hoc without breaking anything.

**Description**: `"Auto-created tracking issue for /cockpit:auto"`. Not tested; informational for humans browsing the label list.

## T1 — Title convention (Q1=A)

**Format**:
```
Tracking: auto session <YYYY-MM-DD> — <ref1> <ref2> ... <ref5> (+K more)
```

**Components**:
- **Prefix**: literal `Tracking: auto session ` (trailing space).
- **Date**: UTC today in `YYYY-MM-DD` form (deterministic across operator timezones; matches the ledger-filename timestamp discipline of auto.md step 1).
- **Separator**: literal ` — ` (em dash between spaces).
- **Ref list**: first 5 refs in `ResolvedRefSet.refs` order (first-seen after dedup), space-separated.
- **Overflow suffix**: literal ` (+K more)` where `K = refs.length - 5`, appended only when `refs.length > 5`.

**Ref rendering in the title**:
- **Workspace-local** (`ref.owner === workspace.owner && ref.repo === workspace.repo`): render short-form `#<number>`.
- **Cross-repo**: render qualified `<owner>/<repo>#<number>`.

Short-form is a title-only convenience — it keeps the title scannable when every ref is workspace-local (the common case). The body always uses qualified form (see B1).

**Examples**:

| Input | Workspace | Title |
|-------|-----------|-------|
| `223` | `generacy-ai/agency` | `Tracking: auto session 2026-07-21 — #223` |
| `223, 224, 226` | `generacy-ai/agency` | `Tracking: auto session 2026-07-21 — #223 #224 #226` |
| `223 224 226 227 228 229 230 231` | `generacy-ai/agency` | `Tracking: auto session 2026-07-21 — #223 #224 #226 #227 #228 (+3 more)` |
| `223 other/repo#41` | `generacy-ai/agency` | `Tracking: auto session 2026-07-21 — #223 other/repo#41` |
| `other/repo#41` | `generacy-ai/agency` | `Tracking: auto session 2026-07-21 — other/repo#41` |

**Length bound**: 5 qualified refs of shape `owner-name/repo-name#12345` (~24 chars each) + prefix (~30 chars) + separator (3 chars) + suffix (up to ~12 chars) = ~165 chars — safely under GitHub's 256-char cap for issue titles.

## B1 — Body shape

**Format**:
```
- [ ] <owner>/<repo>#<number>
- [ ] <owner>/<repo>#<number>
...
```

**Rules**:
- One ref per line.
- Every ref rendered fully-qualified (`owner/repo#N`), never short-form. The engine's resolver rejects bare `#N` in bodies (per spec § Changes bullet 3).
- Order matches `ResolvedRefSet.refs` (first-seen after dedup).
- No leading/trailing blank lines. Exactly one `\n` between refs.
- No headings, no prose, no `## Ad-hoc` section. The `## Ad-hoc` section is added at runtime by `cockpit_scope_add` — see auto.md § existing tracking-mode prose.

**Example** — invocation `/cockpit:auto 223, 224 other/repo#41` in workspace `generacy-ai/agency`:

```
- [ ] generacy-ai/agency#223
- [ ] generacy-ai/agency#224
- [ ] other/repo#41
```

## C1 — Creation command

**Command**:
```
gh issue create \
  --repo <workspace.owner>/<workspace.repo> \
  --title <title> \
  --body-file <tmpfile> \
  --label cockpit:tracking
```

Where `<tmpfile>` is `/tmp/cockpit-auto-form4-<workspace-slug>-<unix_ts>.md` containing the body (B1). Use `--body-file` exclusively (never `-b` / `--body`; shell quoting can strip newlines and mangle the task-list bullets).

**Success**: `gh issue create` prints the new issue URL on stdout; parse `#<number>` from the URL's last path segment. Bind to `trackingRef = { ...workspace, number, supplied: "qualified" }`.

**Failure**: any non-zero exit → `Print + exit`:
```
Failed to create tracking issue: `gh issue create` returned:
  <stderr>
```

No cleanup is needed (no side effects yet — the label creation at L1 is idempotent and harmless if orphaned).

## LR1 — Ledger header on creation (fresh issue)

Written immediately after `gh issue create` returns success, as the first line of the ledger file:

```
Tracking ref: <owner>/<repo>#<n> · form: tracking-list
```

The `form: tracking-list` value is new — it distinguishes Form 4's freshly-created path from the three existing forms (`epic`, `tracking-existing`, `tracking-new`) for post-mortem grep discovery. Reuse-path Form 4 invocations write `tracking-existing` per R6/R7.

## R1 — Round-trip guarantee

**Invariant**: A tracking issue created by Form 4 (T1 title + B1 body + L1 label) parses back to a `ResolvedRefSet` identical to the one that created it (see contract `contracts/tracking-issue-reuse.md § R3` for the body-parse regex).

**Proof sketch**:
- Every ref in the body is fully-qualified `owner/repo#N` (B1).
- The reuse regex matches exactly that shape (R3).
- Set equality (R4) is order-agnostic; the body's line order matches `ResolvedRefSet.refs` order (B1), so a round-trip preserves the set even if the order convention drifts.
- The label filter in R2 matches the label applied at L1.

**Consequence**: A second identical invocation always finds the first invocation's tracking issue via reuse detection — the Q2=B invariant is machine-enforced.
