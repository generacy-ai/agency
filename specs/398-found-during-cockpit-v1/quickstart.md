# Quickstart: verifying #398

Runbook for the reviewer / operator to confirm the fix behaves as intended. Layered static + behavioral checks; the true verifier is a re-run of the cockpit v1.5 auto-mode integration smoke test.

## Prerequisites

- Repo at branch `398-found-during-cockpit-v1`.
- `pnpm install` at repo root (installs `vitest` for the plugin's test suite).
- `git` on `PATH`, `grep` available.
- For the refresh-script check only: `generacy` on `PATH` (inside a cluster session at `/shared-packages/node_modules/.bin`, or after `npm install -g @generacy-ai/generacy`).

## Static checks

Run from repo root. Each command is expected to succeed (or return the noted output) — a failure here indicates the corresponding structural contract invariant has drifted.

### `auto.md` D.5 token fix (contract C.1, C.2)

```bash
# C.1: D.5 dispatch step 2 uses `<issue>` verbatim.
grep -n 'generacy cockpit merge <issue>' packages/claude-plugin-cockpit/commands/auto.md
# Expected: at least one match (line ~171).

# C.2: NO `<pr-ref>` anywhere in auto.md (smoking-gun negative anchor).
grep -n '<pr-ref>' packages/claude-plugin-cockpit/commands/auto.md
# Expected: zero matches (grep exits 1). If any match, the D.5 fix is incomplete.
```

### `merge.md` frontmatter + prose fix (contract C.3, C.4, C.5)

```bash
# C.3: Frontmatter argument renamed to `issue`.
grep -nE '^  - name: issue$' packages/claude-plugin-cockpit/commands/merge.md
# Expected: exactly one match.

# C.4: NO `<pr-ref>` anywhere in merge.md.
grep -n '<pr-ref>' packages/claude-plugin-cockpit/commands/merge.md
# Expected: zero matches.

# C.5: Step 1 usage-error prose uses <issue>.
grep -n 'Usage: /cockpit:merge \[<issue>\]' packages/claude-plugin-cockpit/commands/merge.md
# Expected: exactly one match.

# Additional: step 4 CLI invocation reference uses <resolved-issue> (or the chosen documentation variable).
grep -nE 'generacy cockpit merge <(resolved-)?issue>' packages/claude-plugin-cockpit/commands/merge.md
# Expected: at least one match.

# Additional: `name: ref` is no longer present.
grep -nE '^  - name: ref$' packages/claude-plugin-cockpit/commands/merge.md
# Expected: zero matches.
```

### Help-snapshot files (contract C.6, C.7)

```bash
# C.6: Each snapshot file starts with the version-tag comment.
for f in packages/claude-plugin-cockpit/tests/fixtures/help-snapshots/*.txt; do
  head -1 "$f" | grep -q '^# captured from: generacy --version ' \
    && echo "OK: $f" \
    || { echo "FAIL missing version tag: $f"; exit 1; }
done
# Expected: OK line per snapshot file, script exits 0.

# C.7: Snapshot file set matches the set of distinct verbs in commands/*.md.
LEFT="$(grep -hoE 'generacy cockpit [a-z][a-z-]*' packages/claude-plugin-cockpit/commands/*.md \
        | awk '{print $3}' | sort -u)"
RIGHT="$(ls packages/claude-plugin-cockpit/tests/fixtures/help-snapshots/*.txt \
         | xargs -n1 basename | sed 's/\.txt$//' | sort)"
diff <(echo "$LEFT") <(echo "$RIGHT")
# Expected: empty diff.
```

### Refresh script (contract C.13)

```bash
# C.13: Refresh script exists and is executable.
test -x packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh && echo OK
# Expected: OK.

# Shebang check.
head -1 packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh
# Expected: `#!/usr/bin/env bash` (or repo-standard equivalent).
```

### Regression fixture (contract C.8)

```bash
# C.8: Fixture contains the offending `<pr-ref>` invocation.
grep -F 'generacy cockpit merge <pr-ref>' packages/claude-plugin-cockpit/tests/fixtures/398-drift-auto.md
# Expected: exactly one match.
```

### Sibling-playbook byte-identity (or intentional co-located fixes)

```bash
# Sibling playbooks byte-identical against origin/develop by default:
git diff origin/develop -- \
  packages/claude-plugin-cockpit/commands/clarify.md \
  packages/claude-plugin-cockpit/commands/review.md \
  packages/claude-plugin-cockpit/commands/queue.md \
  packages/claude-plugin-cockpit/commands/watch.md \
  packages/claude-plugin-cockpit/commands/status.md

# Expected: empty diff OR a diff consisting exclusively of verbatim `<X-ref>` → `<Y>` token
# substitutions that the audit revealed as pre-existing drift on those files. Any diff outside
# that class is scope creep — flag in review.
```

### Historical spec directories (must be byte-identical)

```bash
git diff origin/develop -- \
  'specs/372-*' 'specs/384-*' 'specs/388-*' 'specs/390-*' 'specs/394-*' 'specs/396-*'
# Expected: empty diff.
```

### `auto.md` § Invariants section (no new §8)

```bash
grep -nE '^\| §?[0-9]+ \|' packages/claude-plugin-cockpit/commands/auto.md | head -20
# Expected: same set of invariants as origin/develop. No `| §8 |` or `| 8 |` row.

git diff origin/develop -- packages/claude-plugin-cockpit/commands/auto.md \
  | grep -c '^+.*| §\?8 |'
# Expected: 0.
```

## Vitest run (behavioral checks)

```bash
pnpm --filter claude-plugin-cockpit test
```

Expected output: **7 tests passing** (2 from #394's block, 3 from #396's block, 2 from #398's new block).

The two new 398 assertions:

- **398-1 (drift audit)**: sweeps all `commands/*.md`, parses invocations, cross-checks against `help-snapshots/*.txt`. Zero mismatches → pass.
- **398-2 (regression check)**: feeds `tests/fixtures/398-drift-auto.md` through the audit. Exactly one specific mismatch (`{verb: 'merge', position: 0, observed: '<pr-ref>', expected: '<issue>'}`) → pass.

If **398-1 fails** with a mismatch on a sibling playbook (e.g., `queue.md`), that's pre-existing drift discovered by the audit — fix by verbatim token substitution in the same PR (see [plan.md § Complexity Tracking](./plan.md#complexity-tracking) constraint on sibling drift).

If **398-2 fails** with `mismatches.length === 0`, the parser regressed and no longer catches the fixture's drift — the audit has silently degraded to no-op. See [contracts/invocation-parser-rules.md § Failure modes](./contracts/invocation-parser-rules.md#failure-modes).

## Reproducibility smoke test (optional)

Confirm the audit isn't vacuous by manually reverting the D.5 fix and verifying 398-1 fails:

```bash
# 1. Revert the D.5 fix.
sed -i 's|generacy cockpit merge <issue>|generacy cockpit merge <pr-ref>|' \
  packages/claude-plugin-cockpit/commands/auto.md

# 2. Run the audit — should fail.
pnpm --filter claude-plugin-cockpit test 2>&1 | grep -A2 '398-1'
# Expected: assertion fails with a mismatch on commands/auto.md D.5.

# 3. Restore the fix.
git checkout packages/claude-plugin-cockpit/commands/auto.md

# 4. Re-run — should pass.
pnpm --filter claude-plugin-cockpit test
```

## Refresh script check (optional, requires generacy on $PATH)

Confirm the refresh script produces byte-identical output to what's already checked in:

```bash
# Save current snapshots.
cp -r packages/claude-plugin-cockpit/tests/fixtures/help-snapshots /tmp/398-snapshots-before

# Run the refresh script.
bash packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh

# Compare — should be identical if the CLI version tag matches.
diff -r /tmp/398-snapshots-before packages/claude-plugin-cockpit/tests/fixtures/help-snapshots
# Expected: empty diff (or diffs only in the version-tag header line if the local CLI is a
# newer version than the one used when the snapshots were committed).
```

If the diff shows changes beyond the version-tag line, the CLI's `--help` has drifted since the snapshots were committed — refresh, commit the new snapshots, and update `commands/*.md` per any resulting audit mismatches.

## True verifier: cockpit v1.5 auto-mode integration smoke test

The regression the audit prevents is a *diagnosis-round-burn during auto-mode T-S6* — the auto session following D.5's pre-fix prose to a confusing failure. The audit's build-time enforcement is defense-in-depth; the runtime confirmation is a re-run of the same smoke session:

1. Start a cluster session on a repo with at least one issue in `completed:validate` + green state whose PR passes CI.
2. Invoke `/cockpit:auto <epic-ref>` and observe the D.5 dispatch when the loop reaches the ready-to-merge issue.
3. Confirm the assistant invokes `generacy cockpit merge <issue-ref>` (passing the issue number, not the PR number) on the first attempt.
4. Confirm no `red / missing-label` phantom verdict; the merge succeeds.

If step 3 fails (the assistant passes a PR ref), the prose is genuinely still wrong OR a runtime instruction gap not covered by this fix exists — file a new finding.

## Escalation path

- **Audit fails on an unexpected playbook file** (not covered by [plan.md](./plan.md) scope): stop, file a follow-up finding. Do not extend this PR — the audit revealing pre-existing drift on an unrelated surface is a legitimate signal, but the fix belongs in its own PR to keep the diff reviewable.
- **Snapshot refresh produces a diff on multiple `<verb>.txt` files at once**: the CLI's `--help` output has changed broadly. Coordinate with the generacy team before committing — a broad `--help` reformat may require playbook edits in every file, which is a larger scope than this PR.
- **398-2 fails**: the audit has regressed. See [contracts/drift-audit-assertion.md § Failure interpretation](./contracts/drift-audit-assertion.md#failure-interpretation). Fix the parser or the fixture before landing this PR.

## References

- [spec.md](./spec.md) — the observed T-S6 finding
- [plan.md](./plan.md) — implementation plan
- [research.md](./research.md) — design decisions
- [data-model.md](./data-model.md) — pre/post layout, fixture shapes, parser contracts
- [contracts/](./contracts/) — six contract files (D.5 token fix, merge.md frontmatter fix, help-snapshot format, invocation-parser rules, drift-audit assertion, refresh-script)
