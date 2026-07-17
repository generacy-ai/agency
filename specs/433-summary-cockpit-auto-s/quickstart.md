# Quickstart: `/cockpit:auto` doorbell probe fix (agency#433)

**Feature**: agency#433
**Branch**: `433-summary-cockpit-auto-s`
**Date**: 2026-07-17
**Status**: Complete

Everything below runs from the repo root at `/workspaces/agency`.

## What this fix does

Replaces the false-positive `--help`-based pre-flight probe in `/cockpit:auto` with a pure verb-existence check that cannot false-pass on absent verbs. Also corrects three misattributed `generacy#970` references (that PR is closed and shipped different work) to `generacy#974` (the real tracking issue).

If you're on a cluster whose `generacy` binary doesn't ship `doorbell`, `/cockpit:auto` now aborts pre-flight with a clean "Engine doorbell surface not available … upgrade the cluster's generacy build (generacy#974)" message instead of proceeding into a `Monitor.spawn` that fails with `unknown command 'doorbell'`.

## Prerequisites

- pnpm workspace setup (already handled by the repo).
- `generacy` binary on PATH (real or shim — see [Verification](#verification) below).
- Node ≥ 20 (repo baseline).

## Install

Same as the monorepo baseline — no new dependencies:

```bash
pnpm install
pnpm build
```

## What to look for in `auto.md` after the edit

```bash
# Should print 1 (the probe uses the corrected form)
grep -c "generacy cockpit help doorbell" packages/claude-plugin-cockpit/commands/auto.md

# Should print 0 (the broken --help short-circuit form is gone from both L41 and L53)
grep -c "cockpit doorbell --help" packages/claude-plugin-cockpit/commands/auto.md

# Should print 0 (no stale generacy#970 references)
grep -c "generacy#970" packages/claude-plugin-cockpit/commands/auto.md

# Should print ≥ 3 (all three attributions now point to #974)
grep -c "generacy#974" packages/claude-plugin-cockpit/commands/auto.md
```

## Verification

### Absent-verb path (SC-001) — real binary on snappoll

Already verified against `generacy 0.0.0-preview-20260717045830-01bbb03` (doorbell absent):

```bash
$ generacy cockpit help doorbell >/dev/null 2>&1; echo $?
1
$ generacy cockpit doorbell --help >/dev/null 2>&1; echo $?
0  ← this is the false-positive being fixed
```

Under the fix, running `/cockpit:auto <epic-ref>` on the snappoll cluster aborts pre-flight with:

```
Engine doorbell surface not available. /cockpit:auto needs a generacy build that
ships `generacy cockpit doorbell` (generacy#974). Upgrade the cluster's generacy
build, or drive the epic manually with /cockpit:watch, /cockpit:status, and
/cockpit:advance.
```

### Present-verb path (SC-002) — via local shim

Local shim that fakes a doorbell-shipping `generacy` binary (record the exact invocation in the PR body):

```bash
# 1. Create a shim directory + a fake generacy that recognizes `cockpit help doorbell`
mkdir -p /tmp/generacy-shim
cat > /tmp/generacy-shim/generacy <<'SHIM'
#!/usr/bin/env bash
# Fake the doorbell verb for SC-002 verification only.
if [[ "$1 $2 $3" == "cockpit help doorbell" ]]; then
  echo "Usage: generacy cockpit doorbell <epic-ref>"
  exit 0
fi
if [[ "$1 $2" == "cockpit doorbell" ]]; then
  # Emit one doorbell line so Monitor unblocks, then exit.
  echo '{"event":"shim-heartbeat"}'
  sleep 3600
fi
# Fall through to real generacy for everything else.
exec /usr/local/bin/generacy "$@"
SHIM
chmod +x /tmp/generacy-shim/generacy

# 2. Drive /cockpit:auto with the shim on PATH
PATH="/tmp/generacy-shim:$PATH" claude /cockpit:auto <epic-ref>

# Expected: pre-flight passes; step 2 spawns the shim's doorbell under Monitor;
# no "Engine doorbell surface not available" message; loop enters heartbeat + wake mode.
```

### Test pin (SC-003) — via Vitest

```bash
# Run the playbook-verification suite (includes the new 433 assertions)
pnpm --filter @generacy/claude-plugin-cockpit test playbook-verification

# Expected: 433-1 (positive) and 433-2 (negative) both pass.
```

### Manual regression check on the test pin

Confirm the pin catches a partial revert (the whole point of Q2=B):

```bash
# Revert just L41 to the broken form on a scratch branch
git checkout -b scratch/verify-433-pin
sed -i 's/generacy cockpit help doorbell/generacy cockpit doorbell --help/' \
  packages/claude-plugin-cockpit/commands/auto.md
# Only edit the first occurrence — L53 stays corrected
pnpm --filter @generacy/claude-plugin-cockpit test playbook-verification
# Expected: 433-2 (negative pin) fails — because `cockpit doorbell --help` reappeared.
git checkout -- packages/claude-plugin-cockpit/commands/auto.md
git checkout -   # back to the fix branch
```

## Available commands

This feature does not introduce new commands. The behavior it corrects is inside:

- `/cockpit:auto <epic-ref>` — the pre-flight guard that this fix restores.

Unchanged commands (all still work identically):

- `/cockpit:watch` — the manual assist skill named in the pre-flight failure message.
- `/cockpit:status` — the read-only status printer.
- `/cockpit:advance` — the manual gate advance skill.

## Troubleshooting

**"pre-flight passed but sensor spawn failed with `unknown command 'doorbell'`"**
Means the fix has NOT been applied yet — `auto.md` still uses `doorbell --help` which false-passes. Confirm with `grep -c "cockpit doorbell --help" packages/claude-plugin-cockpit/commands/auto.md`; expect 0 after the fix.

**"pre-flight fails with the doorbell error, but I know my `generacy` build ships doorbell"**
Run `generacy cockpit help doorbell; echo $?` directly. If it exits non-zero on a build that supposedly ships `doorbell`, the verb is registered under a different name in that build — file a follow-up against the generacy repo. If it exits 0 and pre-flight still fails, the corrected probe string may not be present in auto.md (verify with `grep -c "generacy cockpit help doorbell" packages/claude-plugin-cockpit/commands/auto.md`).

**"the shim doesn't work — commander.js in real generacy is picking up my shim's args differently"**
The shim is a bash wrapper, not a commander app — its `$1 $2 $3` comparison is a literal string match, not commander parsing. If your PATH still resolves `generacy` to the real binary, either `hash -r` in the current shell or make the shim the first entry in PATH: `PATH="/tmp/generacy-shim:$PATH"` (not `"$PATH:/tmp/generacy-shim"`).

**"the 398 drift audit failed after my edit"**
Should not happen — the corrected probe (`generacy cockpit help doorbell`) matches the `help` verb, which is out of 398's snapshot set. If 398-1 fails, check whether an unrelated edit changed a `<positional>` token in some other `generacy cockpit <verb>` invocation.

**"the 406-3 pin failed after my edit"**
Should not happen — 406-3 asserts `auto.md` step 2 contains `generacy cockpit doorbell` (the bare sensor invocation). The negative pin (433-2) is scoped to `cockpit doorbell --help` only. If both fire, you may have inadvertently changed the sensor invocation in step 2 as well; only the `--help` occurrence at L41 and the doc cross-reference at L53 should change.

## Related

- **generacy#974** — companion issue that implements the missing `generacy cockpit doorbell` verb (in progress; the actual root cause of the false-positive being detected).
- **agency#431** — the spec that introduced the pre-flight probe and doorbell dependency (context for what this fix restores).
- **generacy#970 / generacy PR #971** — already merged; shipped GraphQL rate-limit efficiency work, not the doorbell verb. Stale references to #970 in `auto.md` are corrected to #974 by this fix.

---

*Generated by speckit*
